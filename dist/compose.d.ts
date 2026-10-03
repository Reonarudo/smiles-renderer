/** Thrown when the composed SVG would exceed the output limit. */
export declare class OutputTooLarge extends Error {
}
/** One depicted molecule: OpenChemLib's SVG and the label written after it, if any. */
export interface Cell {
    svg: string;
    label?: string;
}
/**
 * Compose every structure of a fence into one inline-ready SVG. A single unlabelled structure
 * stands alone; several, or a labelled one, sit side by side in one row, top-aligned, each label
 * centred beneath its structure. The root's id and the `<style>` scoped to it carry `prefix`, so
 * no output can address or restyle another. Throws `OutputTooLarge` past the limit.
 */
export declare function compose(cells: Cell[], prefix: string, outputBytes: number): string;
