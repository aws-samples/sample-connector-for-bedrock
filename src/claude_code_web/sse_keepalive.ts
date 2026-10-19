import { Readable, Transform } from 'stream';

const KEEPALIVE = ': keepalive\n\n';
// Same shape as the backend's own stream error event, so the client shows it and closes the stream.
const UPSTREAM_CLOSED = 'data: {"type":"error","error":"upstream closed"}\n\n';

// Passes source through and writes an SSE comment when it has been quiet for intervalMs. A comment is only
// written when the bytes already emitted end with a blank line, so it never lands inside a half-written event.
// If the source fails or closes before it ends, the output gets an error event and ends instead of hanging;
// onSourceStopped receives the error (undefined for a close without one). Neither happens when the consumer
// destroyed the output itself.
export function withSseKeepalive(
    source: Readable,
    opts: { intervalMs?: number; onSourceStopped?: (err: Error | undefined) => void } = {},
): Readable {
    const intervalMs = opts.intervalMs ?? 15000;
    // Starts as a boundary: with nothing written yet, a comment cannot split an event.
    let tail = '\n\n';
    let timer: NodeJS.Timeout | undefined;
    let stopped = false;

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
    function sourceStopped(err: Error | undefined): void {
        if (stopped || out.destroyed || out.writableEnded) return;
        stopped = true;
        stop();
        source.unpipe(out);
        // Terminate a half-written event first so the error event parses on its own.
        out.end((tail === '\n\n' ? '' : '\n\n') + UPSTREAM_CLOSED);
        opts.onSourceStopped?.(err);
    }

    out.on('end', stop);
    out.on('close', () => {
        stop();
        if (!source.destroyed) source.destroy();
    });
    source.on('error', (err) => sourceStopped(err));
    source.on('close', () => {
        if (!source.readableEnded) sourceStopped(undefined);
    });
    source.pipe(out);
    arm();
    return out;
}
