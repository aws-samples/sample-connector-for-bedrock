-- bedrock-converse now bills prompt-cache tokens at price_cache_read and price_cache_write from the model config,
-- and at price_in when they are missing. The claude-*-5-5-chat presets came without them, so each key the config
-- does not have yet is added, per token and from the row's own price_in, at Bedrock's rates for these models: a
-- cache read is 0.05 of the input price for Opus 5.5 and Sonnet 5.5 and 0.1 for Haiku 5.5, and a 5-minute cache
-- write is 1.25 of it. A price an admin has set is kept.
UPDATE eiai_model
SET config = config || jsonb_build_object('price_cache_read', price_in * CASE name WHEN 'claude-haiku-5-5-chat' THEN 0.1 ELSE 0.05 END)
WHERE provider = 'bedrock-converse'
    AND name IN ('claude-opus-5-5-chat', 'claude-sonnet-5-5-chat', 'claude-haiku-5-5-chat')
    AND jsonb_typeof(config) = 'object'
    AND NOT (config ? 'price_cache_read');

UPDATE eiai_model
SET config = config || jsonb_build_object('price_cache_write', price_in * 1.25)
WHERE provider = 'bedrock-converse'
    AND name IN ('claude-opus-5-5-chat', 'claude-sonnet-5-5-chat', 'claude-haiku-5-5-chat')
    AND jsonb_typeof(config) = 'object'
    AND NOT (config ? 'price_cache_write');
