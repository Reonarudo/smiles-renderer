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
export declare function parseMolecules(source: string): MoleculeLine[];
