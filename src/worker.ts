import { parentPort, workerData } from 'node:worker_threads';
import { ENGINE, FAILED, HEADER, LENGTH, READY, STARTED, type Reply, type Request } from './protocol.js';
import { compose, OutputTooLarge, type Cell } from './compose.js';
import type { MoleculeLine } from './molecules.js';
import type { Notation } from './runtime.js';

type Molecule = typeof import('openchemlib').Molecule;

const { buffer } = workerData as { buffer: SharedArrayBuffer };
const state = new Int32Array(buffer, 0, HEADER / 4);
const bytes = new Uint8Array(buffer, HEADER);

function write(text: string): number {
  const encoded = new TextEncoder().encode(text);
  if (encoded.length > bytes.length) throw new RangeError('reply exceeds the shared buffer');
  bytes.set(encoded);
  Atomics.store(state, LENGTH, encoded.length);
  return encoded.length;
}

function reply(result: Reply): void {
  try {
    write(JSON.stringify(result));
  } catch {
    write(JSON.stringify({ status: 'failure', message: 'smiles output is too large to return' } satisfies Reply));
  }
  Atomics.store(state, READY, 1);
  Atomics.notify(state, READY);
}

/** `Class$S19: SmilesParser: dangling ring closure: 1; position:4` — the position is 0-based. */
const prefixes = /^(?:[\w$]+:\s*)?SmilesParser:\s*/;
const positioned = /(?:[;,]\s*|\s+)position:\s*(\d+)\s*$/i;

/** A molecule that could not be depicted, located on its fence line. */
interface Failed {
  message: string;
  line: number;
  column?: number;
}

/**
 * Depict one SMILES string, or one SMARTS pattern with its query features annotated on the atoms
 * and bonds they constrain. Invisible hit targets (`class="event"`) exist for OpenChemLib's
 * interactive editor and are dropped.
 */
function depict(Molecule: Molecule, molecule: MoleculeLine, notation: Notation): string | Failed {
  let parsed: InstanceType<Molecule>;
  try {
    // Explicit rather than `guess`: a mistyped SMILES must fail, not quietly become a pattern.
    parsed = Molecule.fromSmiles(molecule.smiles, { smartsMode: notation });
  } catch (error) {
    const raw = (error instanceof Error ? error.message : String(error)).replace(prefixes, '').trim();
    const match = positioned.exec(raw);
    const position = match ? Number(match[1]) : -1;
    // A position outside the string is not a place on the line; the message keeps it as written.
    if (match && position <= molecule.smiles.length) {
      return { message: raw.slice(0, match.index), line: molecule.line, column: molecule.column + position };
    }
    return { message: raw || `${notation} could not be parsed`, line: molecule.line };
  }
  if (parsed.getAllAtoms() === 0) return { message: 'no atoms found', line: molecule.line };
  // The canvas bounds the depiction: a molecule that fits keeps the standard bond length and is
  // cropped to its extent; a larger one is scaled down to fit. A pattern is drawn half as large
  // again, so its query annotations, set at two thirds of the atom-label size, stay legible.
  return parsed.toSVG(600, 400, 'ocl', {
    autoCrop: true,
    autoCropMargin: 6,
    fontWeight: 'normal',
    ...(notation === 'smarts' ? { maxAVBL: 36 } : {})
  }).replace(/^[ \t]*<(?:line|circle) id="[^"]*" class="event"[^>]*\/>\r?\n/gm, '');
}

function render(Molecule: Molecule, { notation, molecules, prefix, outputBytes }: Request): Reply {
  const tooLarge: Reply = { status: 'failure', message: `smiles output exceeds the ${outputBytes}-byte limit` };
  const cells: Cell[] = [];
  let raw = 0;
  for (const molecule of molecules) {
    const drawn = depict(Molecule, molecule, notation);
    if (typeof drawn !== 'string') return { status: 'failure', ...drawn };
    // OpenChemLib's raw output is held to the limit as it grows, so a fence too large to return
    // is not first spent depicting and parsing the rest.
    raw += drawn.length;
    if (raw > outputBytes) return tooLarge;
    cells.push(molecule.label === undefined ? { svg: drawn } : { svg: drawn, label: molecule.label });
  }
  try {
    return { status: 'success', output: compose(cells, prefix, outputBytes), notes: [] };
  } catch (error) {
    if (error instanceof OutputTooLarge) return tooLarge;
    return { status: 'failure', message: (error as Error).message };
  }
}

// Loaded inside the promise, so a missing or broken engine is a failed start, not a crash.
import('openchemlib').then(({ Molecule }) => {
  // The first depiction in a fresh worker costs a few hundred milliseconds of warm-up that must
  // not be charged to an author's budget, so it is spent here, before this worker reports ready.
  render(Molecule, { notation: 'smiles', molecules: [{ smiles: 'CC(=O)Oc1ccccc1C(=O)O', line: 1, column: 1 }], prefix: '', outputBytes: 1e6 });
  render(Molecule, { notation: 'smarts', molecules: [{ smiles: '[C,N;!H0]~*', line: 1, column: 1 }], prefix: '', outputBytes: 1e6 });
  parentPort!.on('message', (request: Request) => {
    let result: Reply;
    try {
      result = render(Molecule, request);
    } catch {
      // OpenChemLib threw where it never should; its state is not trusted again.
      result = { status: 'failure', message: 'OpenChemLib stopped unexpectedly', discard: true };
    }
    reply(result);
  });
  Atomics.store(state, ENGINE, STARTED);
  Atomics.notify(state, ENGINE);
  parentPort!.postMessage('started');
}, () => {
  write('OpenChemLib could not start');
  Atomics.store(state, ENGINE, FAILED);
  Atomics.notify(state, ENGINE);
  parentPort!.postMessage('failed');
});
