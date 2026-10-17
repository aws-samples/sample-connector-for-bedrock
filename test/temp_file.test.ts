import { describe, it, expect } from 'vitest';
import os from 'os';
import path from 'path';
import { tempFilePath } from '../src/util/temp_file';

describe('tempFilePath', () => {
    it('puts the file in the system temp directory, which a non-root process can write', () => {
        const p = tempFilePath('report_1.pdf');
        expect(path.dirname(p)).toBe(os.tmpdir());
        expect(path.basename(p)).toBe('report_1.pdf');
    });

    it('keeps a file name that carries directory parts inside the temp directory', () => {
        const p = tempFilePath('../../etc/cron.d/job');
        expect(path.dirname(p)).toBe(os.tmpdir());
        expect(path.basename(p)).toBe('job');
    });
});
