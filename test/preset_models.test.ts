import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import providers from '../src/providers/provider';

// patch-0.0.5.sql seeds the original presets on a fresh database; the bedrock-runtime presets come
// from a migration, which also reaches existing databases (src/install.ts).
const scripts = join(__dirname, '../src/scripts');
const patchSql = readFileSync(join(scripts, 'patch-0.0.5.sql'), 'utf8');
const migrationPath = join(scripts, 'migrations/2026-10-20-preset-models.sql');
const migrationSql = readFileSync(migrationPath, 'utf8');
const parse = (sql: string) => [...sql.matchAll(/\('([^']+)',\s*(\d),\s*'([^']+)',\s*'([^']+)',\s*([0-9.e-]+),\s*([0-9.e-]+)\s*\)/g)]
    .map(([, name, multiple, provider, config, priceIn, priceOut]) => ({ name, multiple: Number(multiple), provider, config: JSON.parse(config), priceIn: Number(priceIn), priceOut: Number(priceOut) }));
const patchRows = parse(patchSql);
const rows = parse(migrationSql);

// The presets moved out of patch-0.0.5.sql, in their original order.
const MOVED = [
    'kimi-k3', 'kimi-k2-5', 'glm-5', 'deepseek-v3-2', 'gpt-oss-120b', 'qwen3-coder-next', 'minimax-m2-5',
    'gpt-6-1-sol', 'gpt-6-sol', 'gpt-6-astra', 'gpt-6-luna', 'gpt-5-6-sol', 'gpt-5-6-terra', 'gpt-5-6-luna',
    'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5',
];

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
        // Every row is parsed, so a row the pattern misses cannot slip past these checks.
        expect(patchRows).toHaveLength(patchSql.match(/INSERT INTO eiai_model/g)!.length);
        expect(rows).toHaveLength(migrationSql.match(/^\('/gm)?.length ?? 0);
        const all = [...patchRows, ...rows];
        const registered = Object.keys(providers);
        expect(all.filter((r) => !registered.includes(r.provider)).map((r) => r.name)).toEqual([]);
        expect(new Set(all.map((r) => r.name)).size).toBe(all.length);
    });
});

describe('preset-model migration', () => {
    it('hold exactly the presets moved out of patch-0.0.5.sql', () => {
        expect(rows.map((r) => r.name)).toEqual(MOVED);
        expect(patchRows.filter((r) => MOVED.includes(r.name))).toEqual([]);
        expect(patchSql).not.toMatch(/bedrock-runtime-/);
    });
    it('insert the presets in one statement and bind only the ones it inserted to an existing group 1', () => {
        expect(migrationSql.match(/INSERT INTO eiai_model/g)).toHaveLength(1);
        expect(migrationSql).toMatch(/ON CONFLICT \(name\) DO NOTHING\s+RETURNING id/);
        expect(migrationSql).toMatch(/INSERT INTO eiai_group_model \(model_id, group_id\)\s+SELECT id, 1 FROM inserted\s+WHERE EXISTS \(SELECT 1 FROM eiai_group WHERE id = 1\)\s+ON CONFLICT \(model_id, group_id\) DO NOTHING;/);
    });
});
