-- Claude 5.5 on bedrock-converse. These are the Chat Completions (and Converse-backed /v1/messages) Claude
-- models, e.g. for BRClient; the claude-*-5-5 bedrock-runtime-anthropic presets are /v1/messages passthrough
-- only. Prices match those presets (us-east-1 global on-demand, per token). Each model inserted here is bound
-- to group 1 if that group exists; a name that already exists is left unchanged and not bound.
WITH inserted AS (
INSERT INTO eiai_model (name, multiple, provider, config, price_in, price_out)
VALUES
('claude-opus-5-5-chat', 1, 'bedrock-converse', '{"modelId": "global.anthropic.claude-opus-5-5"}', 4e-6, 20e-6),
('claude-sonnet-5-5-chat', 1, 'bedrock-converse', '{"modelId": "global.anthropic.claude-sonnet-5-5"}', 2e-6, 10e-6),
('claude-haiku-5-5-chat', 1, 'bedrock-converse', '{"modelId": "global.anthropic.claude-haiku-5-5"}', 0.1e-6, 0.5e-6)
ON CONFLICT (name) DO NOTHING
RETURNING id
)
INSERT INTO eiai_group_model (model_id, group_id)
SELECT id, 1 FROM inserted
WHERE EXISTS (SELECT 1 FROM eiai_group WHERE id = 1)
ON CONFLICT (model_id, group_id) DO NOTHING;
