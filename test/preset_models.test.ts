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
            ['gpt-6-1-sol', 1, 'global.openai.gpt-6.1-sol', 2e-6, 10e-6],
            ['gpt-6-sol', 1, 'global.openai.gpt-6-sol', 2e-6, 10e-6],
            ['gpt-6-astra', 1, 'global.openai.gpt-6-astra', 10e-6, 50e-6],
            ['gpt-6-luna', 1, 'global.openai.gpt-6-luna', 0.1e-6, 0.5e-6],
            ['gpt-5-6-sol', 1, 'global.openai.gpt-5.6-sol', 4e-6, 20e-6],
            ['gpt-5-6-terra', 1, 'global.openai.gpt-5.6-terra', 2e-6, 12e-6],
            ['gpt-5-6-luna', 1, 'global.openai.gpt-5.6-luna', 0.2e-6, 1.2e-6],
        ]);
    });
    it('give the GPT models their Global CRIS cache prices', () => {
        const cache = Object.fromEntries(rows.filter((r) => r.name.startsWith('gpt-') && r.name !== 'gpt-oss-120b')
            .map((r) => [r.name, [r.config.price_cache_read, r.config.price_cache_write]]));
        expect(cache).toEqual({
            'gpt-6-1-sol': [0.1e-6, 2.5e-6],
            'gpt-6-sol': [0.2e-6, 2.5e-6],
            'gpt-6-astra': [1e-6, 12.5e-6],
            'gpt-6-luna': [0.01e-6, 0.125e-6],
            'gpt-5-6-sol': [0.4e-6, 5e-6],
            'gpt-5-6-terra': [0.2e-6, 2.5e-6],
            'gpt-5-6-luna': [0.02e-6, 0.25e-6],
        });
    });
    it('give Kimi K3 its cache prices', () => {
        expect(rows.find((r) => r.name === 'kimi-k3')?.config).toEqual({ modelId: 'global.moonshotai.kimi-k3', price_cache_read: 0.3e-6, price_cache_write: 3.75e-6 });
    });
    it('seed the Claude models on bedrock-runtime-anthropic with their model ids and us-east-1 prices', () => {
        const seeded = rows.filter((r) => r.provider === 'bedrock-runtime-anthropic')
            .map((r) => [r.name, r.multiple, r.config, r.priceIn, r.priceOut]);
        const cfg = (modelId: string, read: number, write: number, write1h: number) =>
            ({ modelId, price_cache_read: read, price_cache_write: write, price_cache_write_1h: write1h });
        expect(seeded).toEqual([
            ['claude-opus-5-5', 1, cfg('global.anthropic.claude-opus-5-5', 0.2e-6, 5e-6, 8e-6), 4e-6, 20e-6],
            ['claude-sonnet-5-5', 1, cfg('global.anthropic.claude-sonnet-5-5', 0.1e-6, 2.5e-6, 4e-6), 2e-6, 10e-6],
            ['claude-haiku-5-5', 1, cfg('global.anthropic.claude-haiku-5-5', 0.01e-6, 0.125e-6, 0.2e-6), 0.1e-6, 0.5e-6],
            ['claude-opus-4-8', 1, cfg('global.anthropic.claude-opus-4-8', 0.5e-6, 6.25e-6, 10e-6), 5e-6, 25e-6],
            ['claude-sonnet-4-6', 1, cfg('global.anthropic.claude-sonnet-4-6', 0.3e-6, 3.75e-6, 6e-6), 3e-6, 15e-6],
            ['claude-haiku-4-5', 1, cfg('global.anthropic.claude-haiku-4-5-20251001-v1:0', 0.1e-6, 1.25e-6, 2e-6), 1e-6, 5e-6],
        ]);
    });
    it('only use registered providers and unique names', () => {
        // Every INSERT is parsed, so a row the pattern misses cannot slip past these checks.
        expect(rows).toHaveLength(sql.match(/INSERT INTO eiai_model/g)!.length);
        const registered = Object.keys(providers);
        expect(rows.filter((r) => !registered.includes(r.provider)).map((r) => r.name)).toEqual([]);
        expect(new Set(rows.map((r) => r.name)).size).toBe(rows.length);
    });
});
