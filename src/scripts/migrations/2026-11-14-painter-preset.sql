-- painter, ready to grant to a key or group. It draws with Stable Image Ultra and plans with the Claude Sonnet 5.5
-- chat preset. Its config names no S3 bucket, so it uses the one the BRConnector stack sets (EnablePainter). Painter
-- bills each picture and its chat calls at their own prices, so its token prices are 0. The model inserted here is
-- bound to group 1 if that group exists; a model named painter that already exists is left unchanged and not bound.
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
