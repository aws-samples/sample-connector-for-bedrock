import { describe, it, expect } from 'vitest';

// The Dockerfiles copy ./dist and run `npm install --omit=dev`. npm still resolves the full tree,
// devDependencies included, so their peer conflicts break the image build (ERESOLVE). The build
// therefore writes a package.json to dist/ that keeps only what the server needs at runtime.
import { makeRuntimePackage } from '../scripts/prepare-dist-package.mjs';

describe('makeRuntimePackage', () => {
    it('drops devDependencies', () => {
        const out = makeRuntimePackage({
            name: 'x',
            version: '1.0.0',
            dependencies: { koa: '^2.0.0' },
            devDependencies: { vite: '^6.3.3', 'vue-router': '^5.0.2' },
        });
        expect(out.devDependencies).toBeUndefined();
    });

    it('keeps every runtime dependency unchanged', () => {
        const deps = { koa: '^2.16.3', pg: '^8.18.0', sharp: '0.34.5' };
        const out = makeRuntimePackage({ name: 'x', version: '1.0.0', dependencies: deps, devDependencies: { vite: '^6.3.3' } });
        expect(out.dependencies).toEqual({ koa: '^2.16.3', pg: '^8.18.0', sharp: '0.34.5' });
    });

    it('keeps version, which the server reads at runtime', () => {
        const out = makeRuntimePackage({ name: 'x', version: '0.0.41', dependencies: {} });
        expect(out.version).toBe('0.0.41');
    });

    it('drops scripts and other build-only fields', () => {
        const out = makeRuntimePackage({
            name: 'x',
            version: '1.0.0',
            dependencies: {},
            scripts: { build: 'tsc' },
            packageManager: 'pnpm@10.34.5',
            pnpm: { onlyBuiltDependencies: ['sharp'] },
        });
        expect(Object.keys(out).sort()).toEqual(['dependencies', 'name', 'version']);
    });

    it('keeps main and license when present', () => {
        const out = makeRuntimePackage({ name: 'x', version: '1.0.0', main: 'index.js', license: 'MIT', dependencies: {} });
        expect(out.main).toBe('index.js');
        expect(out.license).toBe('MIT');
    });
});
