import { DOMParser } from '@xmldom/xmldom';
import type { Element } from '@xmldom/xmldom';

/**
 * OpenChemLib draws a structure from these elements alone, with numbers and `rgb()` colours as
 * attribute values. Anything else — and any value of any other shape — is dropped, so nothing
 * that runs script, fetches a resource or reaches outside the diagram can come through.
 */
const svgNamespace = 'http://www.w3.org/2000/svg';
const allowed: Record<string, ReadonlySet<string>> = {
  text: new Set(['x', 'y', 'stroke', 'font-weight', 'font-size', 'fill']),
  line: new Set(['x1', 'y1', 'x2', 'y2', 'stroke', 'stroke-width']),
  circle: new Set(['cx', 'cy', 'r', 'fill', 'stroke', 'stroke-width']),
  polygon: new Set(['points', 'fill', 'stroke', 'stroke-width'])
};
const passive = /^(?:-?\d+(?:\.\d+)?(?:px)?|rgb\(\d{1,3},\d{1,3},\d{1,3}\)|none|normal|bold|(?:-?\d+(?:\.\d+)?[ ,]?)+)$/;
const viewBox = /^-?\d+(?:\.\d+)? -?\d+(?:\.\d+)? \d+(?:\.\d+)? \d+(?:\.\d+)?$/;

const refused = 'OpenChemLib produced SVG that could not be sanitized';

/** Row layout, after the extension's preview stylesheet: 1em gaps, .25em above a label. */
const GAP = 16;
const LABEL_GAP = 4;
const LABEL_SIZE = 14;
/** Room a label line takes below its gap: the font size plus its descent. */
const LABEL_HEIGHT = 18;
/** A generous average glyph width for sans-serif, as a share of the font size. */
const GLYPH = 0.6;

/** Thrown when the composed SVG would exceed the output limit. */
export class OutputTooLarge extends Error {}

/** One depicted molecule: OpenChemLib's SVG and the label written after it, if any. */
export interface Cell {
  svg: string;
  label?: string;
}

const escapeText = (text: string): string =>
  // Characters XML 1.0 cannot carry at all are dropped rather than escaped.
  text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** One structure as passive SVG: its `viewBox` and size, and its drawing as markup. */
function structure(source: string): { box: string; width: number; height: number; body: string } {
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error(refused);
  let root: Element | null;
  try {
    root = new DOMParser({ onError: () => { throw new Error(); } }).parseFromString(source, 'image/svg+xml').documentElement;
  } catch {
    throw new Error(refused);
  }
  if (!root || root.tagName !== 'svg' || root.namespaceURI !== svgNamespace) throw new Error(refused);
  const box = root.getAttribute('viewBox') ?? '';
  if (!viewBox.test(box)) throw new Error(refused);
  const [, , width, height] = box.split(' ').map(Number) as [number, number, number, number];

  let body = '';
  for (const child of Array.from(root.childNodes)) {
    if (child.nodeType !== 1) continue;
    const element = child as Element;
    const attributes = element.namespaceURI === svgNamespace ? allowed[element.tagName] : undefined;
    // OpenChemLib's own <style> is dropped; the composed root carries a scoped one instead.
    if (!attributes) continue;
    const kept = Array.from(element.attributes)
      .filter(({ name, value }) => attributes.has(name) && passive.test(value))
      .map(({ name, value }) => ` ${name}="${value}"`).join('');
    body += element.tagName === 'text'
      ? `<text${kept}>${escapeText(element.textContent ?? '')}</text>`
      : `<${element.tagName}${kept}/>`;
  }
  return { box, width, height, body };
}

/**
 * Compose every structure of a fence into one inline-ready SVG. A single unlabelled structure
 * stands alone; several, or a labelled one, sit side by side in one row, top-aligned, each label
 * centred beneath its structure. The root's id and the `<style>` scoped to it carry `prefix`, so
 * no output can address or restyle another. Throws `OutputTooLarge` past the limit.
 */
export function compose(cells: Cell[], prefix: string, outputBytes: number): string {
  const parts = cells.map(({ svg, label }) => {
    const drawn = structure(svg);
    const labelWidth = label === undefined ? 0 : Math.ceil(label.length * LABEL_SIZE * GLYPH);
    return { ...drawn, label, cellWidth: Math.max(drawn.width, labelWidth) };
  });

  let x = 0;
  let height = 0;
  let body = '';
  for (const part of parts) {
    const left = x + Math.floor((part.cellWidth - part.width) / 2);
    body += `<svg x="${left}" y="0" width="${part.width}" height="${part.height}" viewBox="${part.box}">${part.body}</svg>`;
    let bottom = part.height;
    if (part.label !== undefined) {
      const centre = x + part.cellWidth / 2;
      body += `<text x="${centre}" y="${part.height + LABEL_GAP + LABEL_SIZE}" font-size="${LABEL_SIZE}" ` +
        `text-anchor="middle" fill="rgb(0,0,0)">${escapeText(part.label)}</text>`;
      bottom += LABEL_GAP + LABEL_HEIGHT;
    }
    height = Math.max(height, bottom);
    x += part.cellWidth + GAP;
  }
  const width = x - GAP;

  const id = `${prefix}root`;
  const style = `<style>#${id} text{font-family:sans-serif}#${id} line{stroke-linecap:round}` +
    `#${id} polygon{stroke-linejoin:round}</style>`;
  const output = `<svg xmlns="${svgNamespace}" viewBox="0 0 ${width} ${height}" class="smiles" id="${id}">${style}${body}</svg>`;
  if (Buffer.byteLength(output, 'utf8') > outputBytes) throw new OutputTooLarge();
  return output;
}
