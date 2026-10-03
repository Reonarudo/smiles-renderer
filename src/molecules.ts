/** One molecule of a fence: the line notation to depict, its label, and where it was written. */
export interface MoleculeLine {
  smiles: string;
  label?: string;
  /** 1-based fence line the molecule is on. */
  line: number;
  /** 1-based column of the first character of `smiles` on that line. */
  column: number;
}

/**
 * Split a fence into molecules, one per non-blank line, in the convention of `.smi` files: the
 * line notation ends at the first whitespace and anything after it names the molecule.
 *
 * Nothing here can fail; a fence with no non-blank line yields no molecules.
 */
export function parseMolecules(source: string): MoleculeLine[] {
  const molecules: MoleculeLine[] = [];
  source.split('\n').forEach((text, index) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const column = text.length - text.trimStart().length + 1;
    const split = /\s/.exec(trimmed);
    if (!split) {
      molecules.push({ smiles: trimmed, line: index + 1, column });
    } else {
      molecules.push({ smiles: trimmed.slice(0, split.index), label: trimmed.slice(split.index).trim(), line: index + 1, column });
    }
  });
  return molecules;
}
