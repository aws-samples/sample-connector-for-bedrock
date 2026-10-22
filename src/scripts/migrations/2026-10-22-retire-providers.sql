-- The aws-executor, urls-reader and web-miner providers were removed in 0.0.43; Claude Code Web (/cc)
-- covers them. Remove the models on those providers and their key and group bindings, as deleting a
-- model in the admin UI does. Threads and sessions are kept; their model_id is left as it was.
DELETE FROM eiai_key_model WHERE model_id IN (SELECT id FROM eiai_model WHERE provider IN ('aws-executor', 'urls-reader', 'web-miner'));
DELETE FROM eiai_group_model WHERE model_id IN (SELECT id FROM eiai_model WHERE provider IN ('aws-executor', 'urls-reader', 'web-miner'));
DELETE FROM eiai_model WHERE provider IN ('aws-executor', 'urls-reader', 'web-miner');
