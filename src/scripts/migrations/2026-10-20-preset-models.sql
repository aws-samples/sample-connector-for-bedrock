-- Presets added after 0.0.5. patch-0.0.5.sql only runs on a new database; as a migration they also
-- reach existing ones. Each model inserted here is bound to group 1, as patch-0.0.5 binds every
-- preset; a name that already exists is left unchanged and not bound.
WITH inserted AS (
INSERT INTO eiai_model (name, multiple, provider, config, price_in, price_out)
VALUES
-- OpenAI-format models on bedrock-runtime (Chat Completions). Prices are us-east-1 on-demand, per token.
('kimi-k3', 1, 'bedrock-runtime-openai', '{"modelId": "global.moonshotai.kimi-k3", "price_cache_read": 0.3e-6, "price_cache_write": 3.75e-6}', 3e-6, 15e-6),
('kimi-k2-5', 1, 'bedrock-runtime-openai', '{"modelId": "moonshotai.kimi-k2.5"}', 0.6e-6, 3e-6),
('glm-5', 0, 'bedrock-runtime-openai', '{"modelId": "zai.glm-5"}', 1e-6, 3.2e-6),
('deepseek-v3-2', 0, 'bedrock-runtime-openai', '{"modelId": "deepseek.v3.2"}', 0.62e-6, 1.85e-6),
('gpt-oss-120b', 0, 'bedrock-runtime-openai', '{"modelId": "openai.gpt-oss-120b-1:0"}', 0.15e-6, 0.6e-6),
('qwen3-coder-next', 0, 'bedrock-runtime-openai', '{"modelId": "qwen.qwen3-coder-next"}', 0.5e-6, 1.2e-6),
('minimax-m2-5', 0, 'bedrock-runtime-openai', '{"modelId": "minimax.minimax-m2.5"}', 0.3e-6, 1.2e-6),

-- OpenAI GPT models on bedrock-runtime (Chat Completions). Prices are Global CRIS, standard tier, short context
-- (272K input tokens or fewer), per token.
('gpt-6-1-sol', 1, 'bedrock-runtime-openai', '{"modelId": "global.openai.gpt-6.1-sol", "price_cache_read": 0.1e-6, "price_cache_write": 2.5e-6}', 2e-6, 10e-6),
('gpt-6-sol', 1, 'bedrock-runtime-openai', '{"modelId": "global.openai.gpt-6-sol", "price_cache_read": 0.2e-6, "price_cache_write": 2.5e-6}', 2e-6, 10e-6),
('gpt-6-astra', 1, 'bedrock-runtime-openai', '{"modelId": "global.openai.gpt-6-astra", "price_cache_read": 1e-6, "price_cache_write": 12.5e-6}', 10e-6, 50e-6),
('gpt-6-luna', 1, 'bedrock-runtime-openai', '{"modelId": "global.openai.gpt-6-luna", "price_cache_read": 0.01e-6, "price_cache_write": 0.125e-6}', 0.1e-6, 0.5e-6),
('gpt-5-6-sol', 1, 'bedrock-runtime-openai', '{"modelId": "global.openai.gpt-5.6-sol", "price_cache_read": 0.4e-6, "price_cache_write": 5e-6}', 4e-6, 20e-6),
('gpt-5-6-terra', 1, 'bedrock-runtime-openai', '{"modelId": "global.openai.gpt-5.6-terra", "price_cache_read": 0.2e-6, "price_cache_write": 2.5e-6}', 2e-6, 12e-6),
('gpt-5-6-luna', 1, 'bedrock-runtime-openai', '{"modelId": "global.openai.gpt-5.6-luna", "price_cache_read": 0.02e-6, "price_cache_write": 0.25e-6}', 0.2e-6, 1.2e-6),

-- Claude models on bedrock-runtime's native Messages API. Prices are us-east-1 global on-demand, per token.
('claude-opus-5-5', 1, 'bedrock-runtime-anthropic', '{"modelId": "global.anthropic.claude-opus-5-5", "price_cache_read": 0.2e-6, "price_cache_write": 5e-6, "price_cache_write_1h": 8e-6}', 4e-6, 20e-6),
('claude-sonnet-5-5', 1, 'bedrock-runtime-anthropic', '{"modelId": "global.anthropic.claude-sonnet-5-5", "price_cache_read": 0.1e-6, "price_cache_write": 2.5e-6, "price_cache_write_1h": 4e-6}', 2e-6, 10e-6),
('claude-haiku-5-5', 1, 'bedrock-runtime-anthropic', '{"modelId": "global.anthropic.claude-haiku-5-5", "price_cache_read": 0.01e-6, "price_cache_write": 0.125e-6, "price_cache_write_1h": 0.2e-6}', 0.1e-6, 0.5e-6),
('claude-opus-4-8', 1, 'bedrock-runtime-anthropic', '{"modelId": "global.anthropic.claude-opus-4-8", "price_cache_read": 0.5e-6, "price_cache_write": 6.25e-6, "price_cache_write_1h": 10e-6}', 5e-6, 25e-6),
('claude-sonnet-4-6', 1, 'bedrock-runtime-anthropic', '{"modelId": "global.anthropic.claude-sonnet-4-6", "price_cache_read": 0.3e-6, "price_cache_write": 3.75e-6, "price_cache_write_1h": 6e-6}', 3e-6, 15e-6),
('claude-haiku-4-5', 1, 'bedrock-runtime-anthropic', '{"modelId": "global.anthropic.claude-haiku-4-5-20251001-v1:0", "price_cache_read": 0.1e-6, "price_cache_write": 1.25e-6, "price_cache_write_1h": 2e-6}', 1e-6, 5e-6)
ON CONFLICT (name) DO NOTHING
RETURNING id
)
INSERT INTO eiai_group_model (model_id, group_id)
SELECT id, 1 FROM inserted
WHERE EXISTS (SELECT 1 FROM eiai_group WHERE id = 1)
ON CONFLICT (model_id, group_id) DO NOTHING;
