/**
 * Split a fence into molecules, one per non-blank line, in the convention of `.smi` files: the
 * line notation ends at the first whitespace and anything after it names the molecule.
 *
 * Nothing here can fail; a fence with no non-blank line yields no molecules.
 */
export function parseMolecules(source) {
    const molecules = [];
    source.split('\n').forEach((text, index) => {
        const trimmed = text.trim();
        if (!trimmed)
            return;
        const column = text.length - text.trimStart().length + 1;
        const split = /\s/.exec(trimmed);
        if (!split) {
            molecules.push({ smiles: trimmed, line: index + 1, column });
        }
        else {
            molecules.push({ smiles: trimmed.slice(0, split.index), label: trimmed.slice(split.index).trim(), line: index + 1, column });
        }
    });
    return molecules;
}
