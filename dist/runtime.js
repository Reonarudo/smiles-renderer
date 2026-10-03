import { Worker } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import { ENGINE, FAILED, HEADER, LENGTH, READY, STARTED, STARTING } from './protocol.js';
import { parseMolecules } from './molecules.js';
/** A runtime-wide option: absent for its default, else a finite positive number. */
function option(value, name, fallback) {
    if (value === undefined)
        return fallback;
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        throw new TypeError(`${name} must be a finite positive number`);
    }
    return value;
}
/** What a fence of each notation holds, for messages. */
const wording = { smiles: 'molecule', smarts: 'pattern' };
export async function createRuntime(options = {}) {
    if (typeof options !== 'object' || options === null)
        throw new TypeError('options must be an object');
    if (options.limits !== undefined && (typeof options.limits !== 'object' || options.limits === null)) {
        throw new TypeError('limits must be an object');
    }
    const timeout = option(options.timeout, 'timeout', 3000);
    const startupTimeout = option(options.startupTimeout, 'startupTimeout', 10000);
    const sourceChars = option(options.limits?.sourceChars, 'limits.sourceChars', 64000);
    const outputBytes = option(options.limits?.outputBytes, 'limits.outputBytes', 4 * 1024 * 1024);
    const lineChars = option(options.limits?.lineChars, 'limits.lineChars', 4000);
    // JSON at most doubles the SVG (quotes escape to two bytes); the slack holds the envelope and a
    // failure message.
    const capacity = 2 * outputBytes + 65536;
    let worker;
    let state;
    let bytes;
    let disposed = false;
    const spawn = () => {
        // Each worker gets its own buffer: a terminated worker still finishing a depiction must not
        // be able to write its late answer where its replacement's answer is expected.
        const buffer = new SharedArrayBuffer(HEADER + capacity);
        state = new Int32Array(buffer, 0, HEADER / 4);
        bytes = new Uint8Array(buffer, HEADER);
        worker = new Worker(new URL('./worker.js', import.meta.url), {
            workerData: { buffer },
            env: {},
            stdout: true,
            stderr: true,
            resourceLimits: { maxOldGenerationSizeMb: 256 }
        });
        worker.stdout.resume();
        worker.stderr.resume();
        // A crash surfaces to the waiting render as a timeout; this only keeps it from being fatal.
        worker.on('error', () => { });
        worker.unref();
        return worker;
    };
    const stop = () => {
        void worker?.terminate();
        worker = undefined;
    };
    const payload = () => new TextDecoder().decode(bytes.slice(0, Atomics.load(state, LENGTH)));
    // Start the first engine now, so the first fence does not wait for it. Not fatal if it fails:
    // the next render starts a fresh one.
    spawn();
    await new Promise((resolve) => {
        const started = worker;
        const timer = setTimeout(done, startupTimeout);
        function done() {
            clearTimeout(timer);
            started.off('message', done);
            resolve();
        }
        started.on('message', done);
    });
    return {
        render(input) {
            if (disposed)
                throw new Error('render() called after dispose()');
            if (typeof input !== 'object' || input === null || typeof input.source !== 'string' ||
                (input.notation !== 'smiles' && input.notation !== 'smarts')) {
                throw new TypeError("render() takes { source: string, notation: 'smiles' | 'smarts' }");
            }
            const { source, notation } = input;
            if (source.length > sourceChars) {
                return { status: 'failure', message: `${notation} source exceeds the ${sourceChars}-character limit` };
            }
            const long = source.split('\n').findIndex((line) => line.length > lineChars);
            if (long !== -1) {
                return { status: 'failure', message: `${notation} line exceeds the ${lineChars}-character limit`, line: long + 1 };
            }
            const molecules = parseMolecules(source);
            if (molecules.length === 0) {
                return { status: 'failure', message: `the fence contains no ${wording[notation]}` };
            }
            if (!worker)
                spawn();
            if (Atomics.load(state, ENGINE) === STARTING)
                Atomics.wait(state, ENGINE, STARTING, startupTimeout);
            const engine = Atomics.load(state, ENGINE);
            if (engine !== STARTED) {
                const why = engine === FAILED ? payload() : `OpenChemLib did not start within ${startupTimeout} ms`;
                stop();
                return { status: 'unavailable', reason: why };
            }
            Atomics.store(state, READY, 0);
            // The same string means different things in the two notations, so both are in the digest.
            const digest = createHash('sha256').update(`${notation}\0${source}`).digest('hex');
            const prefix = `smiles-${digest.slice(0, 8)}-`;
            worker.postMessage({ notation, molecules, prefix, outputBytes });
            if (Atomics.wait(state, READY, 0, timeout) === 'timed-out') {
                stop();
                return { status: 'timeout', budget: timeout };
            }
            const { discard, ...result } = JSON.parse(payload());
            if (discard)
                stop();
            return result;
        },
        async dispose() {
            disposed = true;
            const last = worker;
            worker = undefined;
            await last?.terminate();
        }
    };
}
