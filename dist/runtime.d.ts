/** The line notation a fence is written in: `smiles` describes a molecule, `smarts` a pattern. */
export type Notation = 'smiles' | 'smarts';
export interface RuntimeOptions {
    /** Milliseconds per render; default 3000. */
    timeout?: number;
    /** Milliseconds per engine start; default 10000. */
    startupTimeout?: number;
    limits?: {
        /** Whole fence body, in string length; default 64000. */
        sourceChars?: number;
        /** Success output, in UTF-8 bytes; default 4 MiB. */
        outputBytes?: number;
        /** One line of the fence, in string length; default 4000. */
        lineChars?: number;
    };
}
export interface RenderInput {
    /** The whole fence body, one molecule per line. */
    source: string;
    notation: Notation;
}
export type RenderResult = {
    status: 'success';
    output: string;
    notes: string[];
} | {
    status: 'failure';
    message: string;
    line?: number;
    column?: number;
} | {
    status: 'timeout';
    budget: number;
} | {
    status: 'unavailable';
    reason: string;
};
export interface Runtime {
    render(input: RenderInput): RenderResult;
    dispose(): Promise<void>;
}
export declare function createRuntime(options?: RuntimeOptions): Promise<Runtime>;
