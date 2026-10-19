import { Readable, Transform } from 'stream';

const KEEPALIVE = ': keepalive\n\n';

// Passes source through and writes an SSE comment when it has been quiet for intervalMs. A comment is only
// written when the bytes already emitted end with a blank line, so it never lands inside a half-written event.
export function withSseKeepalive(source: Readable, opts: { intervalMs?: number } = {}): Readable {
    const intervalMs = opts.intervalMs ?? 15000;
    // Starts as a boundary: with nothing written yet, a comment cannot split an event.
    let tail = '\n\n';
    let timer: NodeJS.Timeout | undefined;

    const out = new Transform({
        transform(chunk, _enc, cb) {
            const s = Buffer.isBuffer(chunk) ? chunk.toString('latin1') : String(chunk);
            tail = (tail + s).slice(-2);
            arm();
            cb(null, chunk);
        },
        // Runs when the source has ended, before the consumer drains: no push may follow EOF.
        flush(cb) {
            stop();
            cb();
        },
    });

    function stop(): void {
        if (timer) clearTimeout(timer);
        timer = undefined;
    }
    function arm(): void {
        stop();
        timer = setTimeout(() => {
            timer = undefined;
            if (tail === '\n\n') out.push(KEEPALIVE);
            arm();
        }, intervalMs);
    }

    out.on('end', stop);
    out.on('close', () => {
        stop();
        if (!source.destroyed) source.destroy();
    });
    source.on('error', (err) => {
        stop();
        out.destroy(err);
    });
    source.pipe(out);
    arm();
    return out;
}
