import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRuntime } from '../dist/index.js';

const runtime = await createRuntime();
after(() => runtime.dispose());

test('a molecule renders to inline-ready SVG with the renderer name as its only class', () => {
  const result = runtime.render({ source: 'CC(=O)Oc1ccccc1C(=O)O', notation: 'smiles' });
  assert.equal(result.status, 'success');
  if (result.status !== 'success') return;
  // Aspirin's depiction is 116 × 139 at OpenChemLib's standard bond length.
  assert.match(result.output, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 116 139" class="smiles" id="smiles-[0-9a-f]{8}-root">/);
  assert.match(result.output, /<\/svg>$/);
  assert.doesNotMatch(result.output, /<\?xml|<!--|<!DOCTYPE/);
  assert.doesNotMatch(result.output.slice(0, result.output.indexOf('>')), /\swidth=|\sheight=/);
  assert.match(result.output, /<text [^>]*>O<\/text>/);
  assert.match(result.output, /<line /);
  assert.deepEqual(result.notes, []);
});

/** The nested structures and labels of a composed fence, in document order. */
const cells = (svg: string) => ({
  structures: [...svg.matchAll(/<svg x="(\d+)" y="0" width="(\d+)" height="(\d+)"/g)].map((m) => m.slice(1).map(Number)),
  labels: [...svg.matchAll(/<text x="([\d.]+)" y="(\d+)" font-size="14" text-anchor="middle" fill="rgb\(0,0,0\)">([^<]*)<\/text>/g)].map((m) => [Number(m[1]), Number(m[2]), m[3]])
});

test('several lines become one row, top-aligned, each label centred beneath its structure', () => {
  const result = runtime.render({ source: 'CCO ethanol\n\nc1ccccc1\tbenzene  ring\nC#N', notation: 'smiles' });
  assert.equal(result.status, 'success');
  if (result.status !== 'success') return;
  const { structures, labels } = cells(result.output);
  // Alone, OpenChemLib draws ethanol 75 × 36, benzene 58 × 65 and HCN 44 × 36. A label is given
  // 0.6 em per character at 14 px: 59 for "ethanol" fits its structure, 110 for "benzene  ring"
  // widens its cell, which centres the structure 26 in. Cells are 16 apart; a label's baseline is
  // 4 + 14 below its structure and takes 22 in all.
  assert.deepEqual(structures, [[0, 75, 36], [117, 58, 65], [217, 44, 36]]);
  assert.deepEqual(labels, [[37.5, 54, 'ethanol'], [146, 83, 'benzene  ring']]);
  assert.match(result.output, /viewBox="0 0 261 87"/);
});

test('one labelled molecule is a row of one, so the label sits beneath it', () => {
  const result = runtime.render({ source: '  CCO   ethanol  ', notation: 'smiles' });
  assert.equal(result.status, 'success');
  if (result.status !== 'success') return;
  assert.deepEqual(cells(result.output).labels, [[37.5, 54, 'ethanol']]);
  assert.match(result.output, /viewBox="0 0 75 58"/);
});

test('a parse error names the molecule\'s fence line, and its position as a 1-based column', () => {
  // OpenChemLib counts positions from 0 within the string; the string starts 3 columns in.
  assert.deepEqual(runtime.render({ source: 'CCO ethanol\n\n  Xx unknown', notation: 'smiles' }), {
    status: 'failure', message: 'unknown element label found.', line: 3, column: 3
  });
  // The ring is left open at the end of the string, one past its last character.
  assert.deepEqual(runtime.render({ source: 'C1CC', notation: 'smiles' }), {
    status: 'failure', message: 'dangling ring closure: 1', line: 1, column: 5
  });
  assert.deepEqual(runtime.render({ source: 'C)C', notation: 'smiles' }), {
    status: 'failure', message: "Closing ')' without opening counterpart.", line: 1, column: 2
  });
  assert.deepEqual(runtime.render({ source: 'CCO\n[C;x3]', notation: 'smarts' }), {
    status: 'failure', message: "unexpected character inside brackets: 'x'", line: 2, column: 4
  });
});

test('a SMARTS pattern renders with its query features, and SMILES mode rejects it', () => {
  const pattern = runtime.render({ source: '[C,N;!H0]~*', notation: 'smarts' });
  assert.equal(pattern.status, 'success');
  assert.ok(pattern.status === 'success' && /<text [^>]*>\[C,N\]<\/text>/.test(pattern.output));
  assert.ok(pattern.status === 'success' && /class="smiles"/.test(pattern.output));
  assert.equal(runtime.render({ source: '[C,N;!H0]~*', notation: 'smiles' }).status, 'failure');
});

test('patterns are drawn at 1.5 times the standard scale, so their annotations stay legible', () => {
  const width = (notation: 'smiles' | 'smarts') => {
    const result = runtime.render({ source: 'CC', notation });
    return Number(result.status === 'success' && / viewBox="0 0 ([\d.]+) /.exec(result.output)?.[1]);
  };
  assert.ok(width('smarts') > width('smiles') * 1.3, `${width('smarts')} vs ${width('smiles')}`);
});

test('SMARTS annotations are escaped text', () => {
  const annotated = runtime.render({ source: '[C;!H0]', notation: 'smarts' });
  assert.ok(annotated.status === 'success' && /<text [^>]*>h&gt;0<\/text>/.test(annotated.output));
});

test('a fence with no molecule is a failure in the words of its notation', () => {
  assert.deepEqual(runtime.render({ source: '', notation: 'smiles' }), { status: 'failure', message: 'the fence contains no molecule' });
  assert.deepEqual(runtime.render({ source: '\n  \r\n', notation: 'smarts' }), { status: 'failure', message: 'the fence contains no pattern' });
});

test('a source over the character limit is a failure naming the limit; one at the limit renders', () => {
  // Sixteen one-carbon molecules, each line padded to the per-line limit.
  const atLimit = Array.from({ length: 16 }, () => 'C' + ' '.repeat(3999)).join('\n').slice(0, 64000);
  assert.equal(atLimit.length, 64000);
  assert.equal(runtime.render({ source: atLimit, notation: 'smiles' }).status, 'success');
  assert.deepEqual(runtime.render({ source: atLimit + 'C', notation: 'smiles' }), {
    status: 'failure', message: 'smiles source exceeds the 64000-character limit'
  });
});

test('a line over the per-line limit is a failure on that line; one at the limit renders', () => {
  const atLimit = 'C' + ' '.repeat(3998) + 'x';
  assert.equal(runtime.render({ source: `CCO\n${atLimit}`, notation: 'smiles' }).status, 'success');
  assert.deepEqual(runtime.render({ source: `CCO\n${atLimit}x`, notation: 'smarts' }), {
    status: 'failure', message: 'smarts line exceeds the 4000-character limit', line: 2
  });
});

test('limits are runtime options, and the output limit holds for the composed row', async () => {
  // Alone, ethane takes 431 bytes and ethanol 733: each fits 1000, the two in one row do not.
  const small = await createRuntime({ limits: { sourceChars: 12, lineChars: 6, outputBytes: 1000 } });
  try {
    assert.equal(small.render({ source: 'CC', notation: 'smiles' }).status, 'success');
    assert.equal(small.render({ source: 'CCO', notation: 'smiles' }).status, 'success');
    assert.deepEqual(small.render({ source: 'CC\nCCO', notation: 'smiles' }), {
      status: 'failure', message: 'smiles output exceeds the 1000-byte limit'
    });
    assert.deepEqual(small.render({ source: 'CC\nCCCCCCC', notation: 'smiles' }), {
      status: 'failure', message: 'smiles line exceeds the 6-character limit', line: 2
    });
    assert.deepEqual(small.render({ source: 'CC\nCC\nCC\nCC\nC', notation: 'smiles' }), {
      status: 'failure', message: 'smiles source exceeds the 12-character limit'
    });
  } finally {
    await small.dispose();
  }
});

test('the default output limit is 4 MiB', async () => {
  // About 2.5 kB per aspirin: two thousand of them in 44000 characters of fence. Depicting the
  // seventeen hundred that reach the limit takes seconds, so the budget is not what is tested.
  const roomy = await createRuntime({ timeout: 60000 });
  try {
    const source = Array.from({ length: 2000 }, () => 'CC(=O)Oc1ccccc1C(=O)O').join('\n');
    assert.deepEqual(roomy.render({ source, notation: 'smiles' }), {
      status: 'failure', message: 'smiles output exceeds the 4194304-byte limit'
    });
  } finally {
    await roomy.dispose();
  }
});

test('a runaway fence times out within its budget, and the next render on the runtime succeeds', async () => {
  const quick = await createRuntime({ timeout: 200 });
  try {
    const started = performance.now();
    assert.deepEqual(quick.render({ source: 'C'.repeat(1500), notation: 'smiles' }), { status: 'timeout', budget: 200 });
    assert.ok(performance.now() - started < 1000);
    // The replacement worker's start is not charged to these renders.
    assert.equal(quick.render({ source: 'CCO', notation: 'smiles' }).status, 'success');
    assert.deepEqual(quick.render({ source: 'C'.repeat(1501), notation: 'smiles' }), { status: 'timeout', budget: 200 });
  } finally {
    await quick.dispose();
  }
});

test('the budget covers the whole fence, not each molecule', async () => {
  // 600 carbons take a few hundred milliseconds: each alone fits a budget that four do not.
  const measured = await createRuntime({ timeout: 10000 });
  let one: number;
  try {
    const started = performance.now();
    assert.equal(measured.render({ source: 'C'.repeat(600), notation: 'smiles' }).status, 'success');
    one = performance.now() - started;
  } finally {
    await measured.dispose();
  }
  const budget = Math.ceil(one * 2);
  const bounded = await createRuntime({ timeout: budget });
  try {
    assert.equal(bounded.render({ source: 'C'.repeat(600), notation: 'smiles' }).status, 'success');
    assert.deepEqual(bounded.render({ source: Array(4).fill('C'.repeat(600)).join('\n'), notation: 'smiles' }), { status: 'timeout', budget });
  } finally {
    await bounded.dispose();
  }
});

test('a slow engine start is bounded by startupTimeout and does not consume the first render\'s budget', async () => {
  const started = performance.now();
  const tight = await createRuntime({ timeout: 1000, startupTimeout: 10000 });
  const startup = performance.now() - started;
  try {
    const before = performance.now();
    assert.equal(tight.render({ source: 'CC(=O)Oc1ccccc1C(=O)O', notation: 'smiles' }).status, 'success');
    assert.ok(performance.now() - before < startup + 1000);
  } finally {
    await tight.dispose();
  }
});

test('an engine that does not start in time makes that render unavailable, not the runtime', async () => {
  const slow = await createRuntime({ startupTimeout: 1 });
  try {
    assert.deepEqual(slow.render({ source: 'CCO', notation: 'smiles' }), { status: 'unavailable', reason: 'OpenChemLib did not start within 1 ms' });
  } finally {
    await slow.dispose();
  }
});

test('invalid runtime options reject createRuntime', async () => {
  for (const options of [
    { timeout: 0 }, { timeout: -1 }, { timeout: Number.NaN }, { timeout: Infinity }, { startupTimeout: 0 },
    { startupTimeout: -Infinity }, { limits: { sourceChars: 0 } }, { limits: { outputBytes: -5 } },
    { limits: { lineChars: Infinity } }, { limits: { lineChars: 0 } }, { timeout: '100' }, { limits: null }, null
  ]) {
    await assert.rejects(createRuntime(options as never), TypeError, JSON.stringify(options));
  }
});

test('render throws only for programmer errors: malformed input or a disposed runtime', async () => {
  for (const input of [undefined, null, 'CCO', {}, { source: 42, notation: 'smiles' }, { source: 'CCO' }, { source: 'CCO', notation: 'smirks' }]) {
    assert.throws(() => runtime.render(input as never), TypeError, JSON.stringify(input));
  }
  const disposable = await createRuntime();
  await disposable.dispose();
  await disposable.dispose();
  assert.throws(() => disposable.render({ source: 'CCO', notation: 'smiles' }), /dispose/);
});

/** Every value of an attribute, in document order. */
const values = (svg: string, name: string): string[] =>
  [...svg.matchAll(new RegExp(`\\s${name}="([^"]*)"`, 'g'))].map((m) => m[1]!);

test('two fences on one page share no id, and each style matches only its own output', () => {
  const outputs: string[] = [];
  // The same string in the two notations is two different fences.
  for (const [source, notation] of [['CCO', 'smiles'], ['c1ccccc1 benzene', 'smiles'], ['CCO', 'smarts']] as const) {
    const result = runtime.render({ source, notation });
    assert.equal(result.status, 'success');
    if (result.status === 'success') outputs.push(result.output);
  }
  const ids = outputs.map((svg) => values(svg, 'id'));
  for (const list of ids) assert.equal(list.length, 1);
  assert.equal(new Set(ids.flat()).size, 3);
  outputs.forEach((svg, index) => {
    const id = ids[index]![0]!;
    assert.match(id, /^smiles-[0-9a-f]{8}-root$/);
    const styles = [...svg.matchAll(/<style>([^<]*)<\/style>/g)].map((m) => m[1]!);
    assert.equal(styles.length, 1);
    const selectors = styles[0]!.split('}').filter(Boolean).map((rule) => rule.slice(0, rule.indexOf('{')));
    assert.ok(selectors.length > 0);
    for (const selector of selectors) assert.ok(selector.startsWith(`#${id} `), selector);
    assert.doesNotMatch(svg, /ocl|href|url\(/);
  });
});

test('the same input yields byte-identical output, also across runtimes', async () => {
  const input = { source: 'CC(=O)Oc1ccccc1C(=O)O aspirin\nC[C@H](N)C(=O)O L-alanine\nCn1cnc2c1c(=O)n(C)c(=O)n2C caffeine', notation: 'smiles' } as const;
  const other = await createRuntime();
  try {
    const first = runtime.render(input);
    assert.equal(first.status, 'success');
    assert.deepEqual(runtime.render(input), first);
    assert.deepEqual(other.render(input), first);
  } finally {
    await other.dispose();
  }
});

/** Every attribute value in the SVG's tags. Text is left out. */
const attributeValues = (svg: string): string[] => [...svg.matchAll(/<[^>]*>/g)]
  .flatMap((tag) => [...tag[0].matchAll(/\s(?!xmlns=)([\w:-]+)="([^"]*)"/g)].map((m) => m[2]!));

test('markup, script and links in labels stay inert text', () => {
  const source = [
    'CCO <script>alert(1)</script>',
    'CC <foreignObject><img src=x onerror=alert(1)></foreignObject>',
    'C x" onload="alert(1)',
    'N javascript:alert(1) data:text/html,1 https://evil.example/t url(https://evil.example/x)',
    'O &lt;b&gt; ]]> <!-- c --> <!DOCTYPE x [<!ENTITY e "x">]> \u0001\u0007'
  ].join('\n');
  const result = runtime.render({ source, notation: 'smiles' });
  assert.equal(result.status, 'success');
  if (result.status !== 'success') return;
  const tags = new Set([...result.output.matchAll(/<\/?([\w:!-]+)/g)].map((m) => m[1]!));
  assert.deepEqual([...tags].sort(), ['circle', 'line', 'style', 'svg', 'text'].filter((tag) => tags.has(tag)).sort());
  for (const tag of ['script', 'foreignObject', 'image', 'img', '!--', '!DOCTYPE']) assert.ok(!tags.has(tag), tag);
  assert.doesNotMatch(result.output, /<[^>]*\son\w+=/);
  for (const value of attributeValues(result.output)) assert.doesNotMatch(value, /javascript:|data:|https?:|url\(/, value);
  assert.match(result.output, />&lt;script&gt;alert\(1\)&lt;\/script&gt;<\/text>/);
  assert.match(result.output, />x" onload="alert\(1\)<\/text>/);
  assert.match(result.output, />&amp;lt;b&amp;gt; \]\]&gt; &lt;!-- c --&gt; &lt;!DOCTYPE x \[&lt;!ENTITY e "x"&gt;\]&gt; <\/text>/);
  assert.doesNotMatch(result.output, /[\u0001\u0007]/);
});

test('markup in a molecule or pattern is refused by the parser, never drawn', () => {
  for (const [source, notation] of [['[$(<script>)]', 'smarts'], ['[C;$(C<b>)]', 'smarts'], ['[#6&"x"]', 'smarts'],
    ['[C<1>]', 'smarts'], ['C<svg/onload=alert(1)>', 'smiles'], ['[Xx"onload"]', 'smiles']] as const) {
    assert.equal(runtime.render({ source, notation }).status, 'failure', source);
  }
});

test('messages from malformed fences are plain text', () => {
  for (const [source, notation] of [['[$(<script>)]', 'smarts'], ['C<svg/onload=alert(1)>', 'smiles'], ['C(C))', 'smiles'],
    ['[C;$(C<b>)]', 'smarts'], ['C1CC', 'smiles'], ['[Na+].[Cl-]]', 'smiles']] as const) {
    const result = runtime.render({ source, notation });
    assert.equal(result.status, 'failure', source);
    if (result.status !== 'failure') continue;
    assert.doesNotMatch(result.message, /<\/?[A-Za-z]|&\w+;|\/Users|\/home|node_modules|openchemlib|Class\$/, `${source}: ${result.message}`);
  }
});

test('every element and attribute OpenChemLib draws survives sanitizing, as the extension shows it', async () => {
  const { Molecule } = await import('openchemlib');
  const fences: [string, 'smiles' | 'smarts'][] = [
    ['C[C@H](N)C(=O)O', 'smiles'], ['C/C=C/C', 'smiles'], ['[13CH4]', 'smiles'], ['[Na+].[Cl-]', 'smiles'],
    ['Cn1cnc2c1c(=O)n(C)c(=O)n2C', 'smiles'], ['C1CC[C@@H]2CCCC[C@H]2C1', 'smiles'], ['C#N', 'smiles'],
    ['[C,N;!H0]~*', 'smarts'], ['[#6]1~[#6]~[#6]~[#6]~[#6]~[#6]~1', 'smarts'], ['[NX3;H2,H1;!$(NC=O)]', 'smarts'], ['c:c', 'smarts']
  ];
  const elements = new Set<string>();
  for (const [source, notation] of fences) {
    // The extension's depiction, straight from OpenChemLib, without the editor's hit targets.
    const raw = Molecule.fromSmiles(source, { smartsMode: notation }).toSVG(600, 400, 'ocl', {
      autoCrop: true, autoCropMargin: 6, fontWeight: 'normal', ...(notation === 'smarts' ? { maxAVBL: 36 } : {})
    });
    const drawing = (svg: string) => [...svg.matchAll(/<(text|line|circle|polygon)\b([^>]*)>([^<]*)/g)]
      .filter((m) => !/class="event"/.test(m[2]!))
      .map((m) => `${m[1]}${[...m[2]!.matchAll(/\s([\w-]+)="([^"]*)"/g)].map((a) => ` ${a[1]}=${a[2]}`).sort().join('')} ${m[3]!.trim()}`);
    const result = runtime.render({ source, notation });
    assert.equal(result.status, 'success', source);
    if (result.status !== 'success') continue;
    assert.deepEqual(drawing(result.output), drawing(raw), source);
    for (const line of drawing(raw)) elements.add(line.slice(0, line.indexOf(' ')));
  }
  assert.deepEqual([...elements].sort(), ['circle', 'line', 'polygon', 'text']);
});

test('blank lines and Windows line endings are skipped, and lines keep their fence numbers', () => {
  const result = runtime.render({ source: '\r\nCCO\r\n\r\n  \r\nCCC\r\n', notation: 'smiles' });
  assert.equal(result.status, 'success');
  assert.ok(result.status === 'success' && cells(result.output).structures.length === 2);
  assert.deepEqual(runtime.render({ source: '\r\nCCO\r\n\r\nQ\r\n', notation: 'smiles' }), {
    status: 'failure', message: 'unknown element label found.', line: 4, column: 1
  });
});
