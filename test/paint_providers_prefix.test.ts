import { describe, it, expect, beforeEach, vi } from 'vitest';
import providers from '../src/providers/provider';
import { HERMETIC_ENV } from './helpers/hermetic_env';

const modelData = { name: 'paint', config: { paintModelId: 'p', localLlmModel: 'l', s3Bucket: 'b', s3Region: 'us-east-1', s3Prefix: 'images/' } };
const makeCtx = () => ({ headers: {}, set: vi.fn(), state: {} as any, logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() } });

describe('paint providers', () => {
    beforeEach(() => {
        for (const [name, value] of Object.entries(HERMETIC_ENV)) vi.stubEnv(name, value);
    });

    for (const name of ['painter', 'nova-canvas']) {
        it(`${name} trims a trailing slash from s3Prefix`, async () => {
            const provider: any = providers.createProvider(name);
            provider.setModelData(modelData);
            provider.toPaintPrompt = vi.fn().mockRejectedValue(new Error('stop before network'));
            const request: any = { model: 'paint', stream: true, messages: [{ role: 'user', content: 'a cat' }] };
            await expect(provider.chat(request, undefined, makeCtx())).rejects.toThrow('stop before network');
            expect(provider.s3Prefix).toBe('images');
        });
    }
});
