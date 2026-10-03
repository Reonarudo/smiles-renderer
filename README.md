# smiles-renderer

Render [SMILES](https://en.wikipedia.org/wiki/Simplified_molecular-input_line-entry_system)
molecules and [SMARTS](https://en.wikipedia.org/wiki/SMILES_arbitrary_target_specification)
patterns to safe, inline-ready SVG in Node, at build time, with
[OpenChemLib](https://github.com/cheminfo/openchemlib-js). One of five renderer libraries that
share the [render contract](http://192.168.188.68:3001/projects/markdown-renderers/wiki/Render_contract).

```sh
npm install github:Reonarudo/smiles-renderer#v0.1.0
```

On npm 12 or later, a project installing git dependencies also needs `allow-git=root` in its
`.npmrc`. Nothing runs on install: `dist/` is committed, and OpenChemLib comes from the npm
registry.

## Use

```js
import { createRuntime } from '@reonarudo/smiles-renderer';

const runtime = await createRuntime();
const result = runtime.render({ source: 'CCO ethanol\nc1ccccc1 benzene', notation: 'smiles' });
await runtime.dispose();
```

`render({ source, notation })` takes the whole fence body and the fence's notation, `smiles`
or `smarts`. Each non-blank line is one molecule (or pattern), written as in `.smi` files: the
line notation ends at the first whitespace, and the rest of the line is its label. The same
string means different things in the two notations, and SMILES mode refuses SMARTS rather than
guessing.

`render` is synchronous and returns one of:

| `status` | Fields | When |
| --- | --- | --- |
| `success` | `output`, `notes` | `output` is one `<svg class="smiles" viewBox="…">` with no size, ready to inline, holding every molecule of the fence; `notes` is always `[]` |
| `failure` | `message`, `line?`, `column?` | a molecule OpenChemLib cannot parse (plain text, 1-based fence-relative line and column), an empty fence, or an exceeded limit |
| `timeout` | `budget` | depicting the fence ran past `timeout` milliseconds |
| `unavailable` | `reason` | the engine could not start |

`render` throws only for programmer errors: input that is not
`{ source: string, notation: 'smiles' | 'smarts' }`, or a call after `dispose()`.
`createRuntime` rejects only for invalid options.

### Layout

A single unlabelled molecule stands alone. Several, or a labelled one, sit side by side in one
row, top-aligned, with each label centred beneath its structure — the extension's preview,
drawn in SVG instead of HTML:

- each structure keeps OpenChemLib's own size: the standard bond length, cropped to its
  extent with a 6-unit margin, and scaled down only if it would exceed 600 × 400;
- SMARTS patterns are drawn at 1.5 times the bond length, so their query annotations stay
  legible;
- cells are 16 units apart; a label is 14 units high, 4 below its structure, and its cell is
  widened to an estimate of its width (0.6 em per character) when it is wider than the
  structure.

The row does not wrap: a long fence is a long, thin SVG. Colours follow OpenChemLib's CPK
convention on a transparent background, with black bonds and labels; a dark-mode treatment is
the consumer's.

### Runtime options

| Option | Default | |
| --- | --- | --- |
| `timeout` | `3000` | milliseconds per render, for the whole fence |
| `startupTimeout` | `10000` | milliseconds per engine start, never charged to a render |
| `limits.sourceChars` | `64000` | fence body, in string length |
| `limits.lineChars` | `4000` | one line of the fence, in string length |
| `limits.outputBytes` | `4194304` | OpenChemLib's SVG, summed in characters as it is drawn, and the composed SVG in UTF-8 bytes |

Each must be a finite positive number. Limits can be raised or lowered, never disabled.

### Errors

The first molecule that cannot be parsed fails the fence. Its `line` is its line in the fence,
and OpenChemLib's position is lifted out of the message into a 1-based `column`:
`dangling ring closure: 1; position:4` on line 3, indented by two spaces, becomes
`{ message: 'dangling ring closure: 1', line: 3, column: 7 }`. A position past the end of the
string keeps OpenChemLib's own words and no column.

### What the consumer does

The consumer does everything presentational:

- wraps the SVG: figure, caption, alt text, the author's class (`smarts`, if it wants to style
  patterns apart) and alignment;
- escapes `message` and `reason` when writing them into HTML;
- creates one runtime per build or preview, and disposes of it;
- caches, if it wants to.

## How the safety guarantees are met

Fence source is treated as untrusted.

- **Bounded time.** OpenChemLib runs in a worker thread that `render` blocks on with
  `Atomics.wait`. Coordinate generation is superlinear in the number of atoms, so one long
  string can take tens of seconds. Every molecule of a fence, and composing them, count against
  one budget. A render past its budget terminates the worker; the next render starts a fresh
  one and waits for it under `startupTimeout` before its own budget begins. The worker warms
  OpenChemLib up before it reports ready, so that cost is not charged to the first fence.
- **Bounded memory.** The worker's JavaScript heap is capped at 256 MB, the extension's value.
  An unexpected engine exception is a `failure` and the worker is discarded.
- **Bounded input and output.** `limits.sourceChars` and `limits.lineChars` are checked before
  the engine sees the fence. `limits.outputBytes` is checked as each structure is drawn, so a
  fence too large to return stops early, and again on the composed SVG.
- **No reach outside.** OpenChemLib depicts in memory and never reads files or the network.
- **Safe to inline.** Every structure is parsed as XML and rebuilt from an allowlist of the
  elements OpenChemLib draws with — `text`, `line`, `circle`, `polygon` — and their
  geometry, colour and font attributes, each kept only if its value is a number, a list of
  numbers, an `rgb()` colour, `none`, `normal` or `bold`. The editor's hit targets and
  OpenChemLib's own `<style>` are dropped. Labels and annotations are escaped text; characters
  XML cannot carry are removed. Comments, DOCTYPEs and anything that is not well-formed SVG are
  refused.
- **Isolated.** The only id is the root's, `smiles-<8 hex>-root`, taken from the sha256 of the
  notation and the source. The one `<style>` — sans-serif text, round line caps and joins —
  selects only through it, so two fences on one page cannot restyle each other. No other ids,
  references or `url()` are emitted.
- **Plain text out.** `message` is OpenChemLib's parser message without its Java class prefix
  and position clause.

Output is deterministic: the same input yields byte-identical SVG in any runtime.

## Development

```sh
npm ci
npm run compile        # tsc → dist/, which is committed; CI fails if it is stale
npm run lint
npm test               # tests import dist/, so compile first
npm run test:packed    # npm pack, install into a temp project, render one fence
```

Requires Node 22 or later (`.nvmrc` pins the version used in development).
