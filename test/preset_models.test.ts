import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import providers from '../src/providers/provider';

// Preset models are seeded by patch-0.0.5.sql on a fresh database (src/install.ts).
const sql = readFileSync(join(__dirname, '../src/scripts/patch-0.0.5.sql'), 'utf8');
const rows = [...sql.matchAll(/INSERT INTO eiai_model \(name, multiple, provider, config, price_in, price_out\)\s*VALUES \('([^']+)',\s*(\d),\s*'([^']+)',\s*'([^']+)',\s*([0-9.e-]+),\s*([0-9.e-]+)\s*\)/g)]
    .map(([, name, multiple, provider, config, priceIn, priceOut]) => ({ name, multiple: Number(multiple), provider, config: JSON.parse(config), priceIn: Number(priceIn), priceOut: Number(priceOut) }));

describe('preset models', () => {
    it('seed the OpenAI-format models on bedrock-runtime with their model ids and us-east-1 prices', () => {
        const seeded = rows.filter((r) => r.provider === 'bedrock-runtime-openai')
            .map((r) => [r.name, r.multiple, r.config.modelId, r.priceIn, r.priceOut]);
        expect(seeded).toEqual([
            ['kimi-k3', 1, 'global.moonshotai.kimi-k3', 3e-6, 15e-6],
            ['kimi-k2-5', 1, 'moonshotai.kimi-k2.5', 0.6e-6, 3e-6],
            ['glm-5', 0, 'zai.glm-5', 1e-6, 3.2e-6],
            ['deepseek-v3-2', 0, 'deepseek.v3.2', 0.62e-6, 1.85e-6],
            ['gpt-oss-120b', 0, 'openai.gpt-oss-120b-1:0', 0.15e-6, 0.6e-6],
            ['qwen3-coder-next', 0, 'qwen.qwen3-coder-next', 0.5e-6, 1.2e-6],
            ['minimax-m2-5', 0, 'minimax.minimax-m2.5', 0.3e-6, 1.2e-6],
        ]);
    });
    it('give Kimi K3 its cache prices', () => {
        expect(rows.find((r) => r.name === 'kimi-k3')?.config).toEqual({ modelId: 'global.moonshotai.kimi-k3', price_cache_read: 0.3e-6, price_cache_write: 3.75e-6 });
    });
    it('only use registered providers and unique names', () => {
        // Every INSERT is parsed, so a row the pattern misses cannot slip past these checks.
        expect(rows).toHaveLength(sql.match(/INSERT INTO eiai_model/g)!.length);
        const registered = Object.keys(providers);
        expect(rows.filter((r) => !registered.includes(r.provider)).map((r) => r.name)).toEqual([]);
        expect(new Set(rows.map((r) => r.name)).size).toBe(rows.length);
    });
});
