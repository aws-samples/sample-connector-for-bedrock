WITH inserted AS (
INSERT INTO eiai_model (name, multiple, provider, config, price_in, price_out)
VALUES
('painter', 1, 'painter', '{"paintModelId": "stability.stable-image-ultra-v1:1", "localLlmModel": "claude-sonnet-5-5-chat"}', 0, 0)
ON CONFLICT (name) DO NOTHING
RETURNING id
)
INSERT INTO eiai_group_model (model_id, group_id)
SELECT id, 1 FROM inserted
WHERE EXISTS (SELECT 1 FROM eiai_group WHERE id = 1)
ON CONFLICT (model_id, group_id) DO NOTHING;
