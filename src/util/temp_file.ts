import os from 'os';
import path from 'path';

// Where to put a short-lived file. The app directory is not writable when the container runs as a non-root user,
// and on Lambda only /tmp is writable at all, so the system temp directory is used. Only the base name is kept,
// so a name with directory parts cannot place the file anywhere else.
export function tempFilePath(fileName: string): string {
    return path.join(os.tmpdir(), path.basename(fileName));
}
