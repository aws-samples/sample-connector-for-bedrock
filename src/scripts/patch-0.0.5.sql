CREATE TABLE IF NOT EXISTS eiai_group (
    id serial PRIMARY KEY,
    name varchar(64) NOT NULL,
    key varchar(64),
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS eiai_group_model (
    id serial PRIMARY KEY,
    model_id int NOT NULL,
    group_id int NOT NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE eiai_model
ADD COLUMN multiple int DEFAULT 0,
ADD COLUMN model_type int DEFAULT 1,
ADD COLUMN price_in decimal(10, 10) NOT NULL DEFAULT 0.00,
ADD COLUMN price_out decimal(10, 10) NOT NULL DEFAULT 0.00,
ADD COLUMN provider VARCHAR(255);

ALTER TABLE eiai_model ADD CONSTRAINT model_name_uniqe UNIQUE (name);

ALTER TABLE eiai_group_model ADD CONSTRAINT model_group_id_uniqe UNIQUE (model_id, group_id);

INSERT INTO eiai_model (name, multiple, provider, config, price_in, price_out) 
VALUES ('amazon-nova-pro', 1, 'bedrock-converse', '{"modelId": "amazon.nova-pro-v1:0"}', 0.8e-6, 3.2e-6 ) ON CONFLICT (name) DO NOTHING;
INSERT INTO eiai_model (name, multiple, provider, config, price_in, price_out) 
VALUES ('amazon-nova-lite', 1, 'bedrock-converse', '{"modelId": "amazon.nova-lite-v1:0"}', 0.06e-6, 0.24e-6 ) ON CONFLICT (name) DO NOTHING;
INSERT INTO eiai_model (name, multiple, provider, config, price_in, price_out) 
VALUES ('amazon-nova-micro', 1, 'bedrock-converse', '{"modelId": "amazon.nova-micro-v1:0"}', 0.035e-6, 0.14e-6 ) ON CONFLICT (name) DO NOTHING;
INSERT INTO eiai_model (name, multiple, provider, config, price_in, price_out) 
VALUES ('claude-3-7-sonnet', 1, 'bedrock-converse', '{"modelId": "anthropic.claude-3-7-sonnet-20250219-v1:0"}', 3e-6, 15e-6 ) ON CONFLICT (name) DO NOTHING;
INSERT INTO eiai_model (name, multiple, provider, config, price_in, price_out) 
VALUES ('cr-claude-3-7-sonnet', 1, 'bedrock-converse', '{"modelId": "us.anthropic.claude-3-7-sonnet-20250219-v1:0"}', 3e-6, 15e-6 ) ON CONFLICT (name) DO NOTHING;
INSERT INTO eiai_model (name, multiple, provider, config, price_in, price_out) 
VALUES ('claude-3-5-sonnet-v2', 1, 'bedrock-converse', '{"modelId": "anthropic.claude-3-5-sonnet-20241022-v2:0"}', 3e-6, 15e-6 ) ON CONFLICT (name) DO NOTHING;
INSERT INTO eiai_model (name, multiple, provider, config, price_in, price_out) 
VALUES ('claude-3-5-sonnet', 1, 'bedrock-converse', '{"modelId": "anthropic.claude-3-5-sonnet-20240620-v1:0"}', 3e-6, 15e-6 ) ON CONFLICT (name) DO NOTHING;
INSERT INTO eiai_model (name, multiple, provider, config, price_in, price_out) 
VALUES ('cr-claude-3-5-sonnet-v2', 1, 'bedrock-converse', '{"modelId": "us.anthropic.claude-3-5-sonnet-20241022-v2:0"}', 3e-6, 15e-6 ) ON CONFLICT (name) DO NOTHING;
INSERT INTO eiai_model (name, multiple, provider, config, price_in, price_out) 
VALUES ('cr-claude-3-5-sonnet', 1, 'bedrock-converse', '{"modelId": "us.anthropic.claude-3-5-sonnet-20240620-v1:0"}', 3e-6, 15e-6 ) ON CONFLICT (name) DO NOTHING;
INSERT INTO eiai_model (name, multiple, provider, config, price_in, price_out) 
VALUES ('claude-3-5-haiku', 1, 'bedrock-converse', '{"modelId": "anthropic.claude-3-5-haiku-20241022-v1:0"}', 0.8e-6, 4e-6 ) ON CONFLICT (name) DO NOTHING;
INSERT INTO eiai_model (name, multiple, provider, config, price_in, price_out) 
VALUES ('claude-3-sonnet', 1, 'bedrock-converse', '{"modelId": "anthropic.claude-3-sonnet-20240229-v1:0"}', 3e-6, 15e-6 ) ON CONFLICT (name) DO NOTHING;
INSERT INTO eiai_model (name, multiple, provider, config, price_in, price_out) 
VALUES ('claude-3-haiku', 1, 'bedrock-converse','{"modelId": "anthropic.claude-3-haiku-20240307-v1:0"}', 0.25e-6, 1.25e-6 ) ON CONFLICT (name) DO NOTHING;
INSERT INTO eiai_model (name, multiple, provider, config, price_in, price_out) 
VALUES ('claude-3-opus', 1, 'bedrock-converse','{"modelId": "anthropic.claude-3-opus-20240229-v1:0"}', 15e-6, 75e-6 ) ON CONFLICT (name) DO NOTHING;
INSERT INTO eiai_model (name, multiple, provider, config, price_in, price_out) 
VALUES ('mistral-7b', 0, 'bedrock-converse', '{"modelId": "mistral.mistral-7b-instruct-v0:2"}', 0.15e-6, 0.2e-6) ON CONFLICT (name) DO NOTHING;
INSERT INTO eiai_model (name, multiple, provider, config, price_in, price_out) 
VALUES ('mistral-8x7b', 0, 'bedrock-converse', '{"modelId": "mistral.mixtral-8x7b-instruct-v0:1"}', 0.45e-6, 0.7e-6) ON CONFLICT (name) DO NOTHING;
INSERT INTO eiai_model (name, multiple, provider, config, price_in, price_out) 
VALUES ('mistral-large', 0, 'bedrock-converse','{"modelId": "mistral.mistral-large-2402-v1:0"}', 8e-6, 24e-6) ON CONFLICT (name) DO NOTHING;
INSERT INTO eiai_model (name, multiple, provider, config, price_in, price_out) 
VALUES ('mistral-small', 0, 'bedrock-converse','{"modelId": "mistral.mistral-small-2402-v1:0"}', 1e-6, 3e-6) ON CONFLICT (name) DO NOTHING;
INSERT INTO eiai_model (name, multiple, provider, config, price_in, price_out) 
VALUES ('llama3-8b', 0, 'bedrock-converse','{"modelId": "meta.llama3-8b-instruct-v1:0"}', 0.4e-6, 0.6e-6) ON CONFLICT (name) DO NOTHING;
INSERT INTO eiai_model (name, multiple, provider, config, price_in, price_out) 
VALUES ('llama3-70b', 0, 'bedrock-converse','{"modelId": "meta.llama3-70b-instruct-v1:0"}', 2.65e-6, 3.5e-6) ON CONFLICT (name) DO NOTHING;

-- OpenAI-format models on bedrock-runtime (Chat Completions). Prices are us-east-1 on-demand, per token.
INSERT INTO eiai_model (name, multiple, provider, config, price_in, price_out)
VALUES ('kimi-k3', 1, 'bedrock-runtime-openai', '{"modelId": "global.moonshotai.kimi-k3", "price_cache_read": 0.3e-6, "price_cache_write": 3.75e-6}', 3e-6, 15e-6) ON CONFLICT (name) DO NOTHING;
INSERT INTO eiai_model (name, multiple, provider, config, price_in, price_out)
VALUES ('kimi-k2-5', 1, 'bedrock-runtime-openai', '{"modelId": "moonshotai.kimi-k2.5"}', 0.6e-6, 3e-6) ON CONFLICT (name) DO NOTHING;
INSERT INTO eiai_model (name, multiple, provider, config, price_in, price_out)
VALUES ('glm-5', 0, 'bedrock-runtime-openai', '{"modelId": "zai.glm-5"}', 1e-6, 3.2e-6) ON CONFLICT (name) DO NOTHING;
INSERT INTO eiai_model (name, multiple, provider, config, price_in, price_out)
VALUES ('deepseek-v3-2', 0, 'bedrock-runtime-openai', '{"modelId": "deepseek.v3.2"}', 0.62e-6, 1.85e-6) ON CONFLICT (name) DO NOTHING;
INSERT INTO eiai_model (name, multiple, provider, config, price_in, price_out)
VALUES ('gpt-oss-120b', 0, 'bedrock-runtime-openai', '{"modelId": "openai.gpt-oss-120b-1:0"}', 0.15e-6, 0.6e-6) ON CONFLICT (name) DO NOTHING;
INSERT INTO eiai_model (name, multiple, provider, config, price_in, price_out)
VALUES ('qwen3-coder-next', 0, 'bedrock-runtime-openai', '{"modelId": "qwen.qwen3-coder-next"}', 0.5e-6, 1.2e-6) ON CONFLICT (name) DO NOTHING;
INSERT INTO eiai_model (name, multiple, provider, config, price_in, price_out)
VALUES ('minimax-m2-5', 0, 'bedrock-runtime-openai', '{"modelId": "minimax.minimax-m2.5"}', 0.3e-6, 1.2e-6) ON CONFLICT (name) DO NOTHING;

-- Claude models on bedrock-runtime's native Messages API. Prices are us-east-1 global on-demand, per token.
INSERT INTO eiai_model (name, multiple, provider, config, price_in, price_out)
VALUES ('claude-opus-5-5', 1, 'bedrock-runtime-anthropic', '{"modelId": "global.anthropic.claude-opus-5-5", "price_cache_read": 0.2e-6, "price_cache_write": 5e-6, "price_cache_write_1h": 8e-6}', 4e-6, 20e-6) ON CONFLICT (name) DO NOTHING;
INSERT INTO eiai_model (name, multiple, provider, config, price_in, price_out)
VALUES ('claude-sonnet-5-5', 1, 'bedrock-runtime-anthropic', '{"modelId": "global.anthropic.claude-sonnet-5-5", "price_cache_read": 0.1e-6, "price_cache_write": 2.5e-6, "price_cache_write_1h": 4e-6}', 2e-6, 10e-6) ON CONFLICT (name) DO NOTHING;
INSERT INTO eiai_model (name, multiple, provider, config, price_in, price_out)
VALUES ('claude-haiku-5-5', 1, 'bedrock-runtime-anthropic', '{"modelId": "global.anthropic.claude-haiku-5-5", "price_cache_read": 0.01e-6, "price_cache_write": 0.125e-6, "price_cache_write_1h": 0.2e-6}', 0.1e-6, 0.5e-6) ON CONFLICT (name) DO NOTHING;
INSERT INTO eiai_model (name, multiple, provider, config, price_in, price_out)
VALUES ('claude-opus-4-8', 1, 'bedrock-runtime-anthropic', '{"modelId": "global.anthropic.claude-opus-4-8", "price_cache_read": 0.5e-6, "price_cache_write": 6.25e-6, "price_cache_write_1h": 10e-6}', 5e-6, 25e-6) ON CONFLICT (name) DO NOTHING;
INSERT INTO eiai_model (name, multiple, provider, config, price_in, price_out)
VALUES ('claude-sonnet-4-6', 1, 'bedrock-runtime-anthropic', '{"modelId": "global.anthropic.claude-sonnet-4-6", "price_cache_read": 0.3e-6, "price_cache_write": 3.75e-6, "price_cache_write_1h": 6e-6}', 3e-6, 15e-6) ON CONFLICT (name) DO NOTHING;
INSERT INTO eiai_model (name, multiple, provider, config, price_in, price_out)
VALUES ('claude-haiku-4-5', 1, 'bedrock-runtime-anthropic', '{"modelId": "global.anthropic.claude-haiku-4-5-20251001-v1:0", "price_cache_read": 0.1e-6, "price_cache_write": 1.25e-6, "price_cache_write_1h": 2e-6}', 1e-6, 5e-6) ON CONFLICT (name) DO NOTHING;


INSERT INTO eiai_group (name) VALUES ('group 1');

INSERT INTO eiai_group_model (model_id, group_id) 
SELECT id, 1 FROM eiai_model ON CONFLICT (model_id, group_id) DO NOTHING;



CREATE OR REPLACE VIEW eiai_v_group_model AS
SELECT gm.*, g.name group_name, m.name model_name, m.multiple, m.price_in, m.price_out, m.provider, m.config from eiai_group_model gm 
LEFT JOIN eiai_group g ON gm.group_id=g.id
LEFT JOIN eiai_model m ON gm.model_id=m.id;


CREATE OR REPLACE VIEW eiai_v_key_model AS
SELECT km.*, k.name key_name, m.name model_name, m.multiple, m.price_in, m.price_out, m.provider, m.config from eiai_key_model km
LEFT JOIN eiai_key k ON km.key_id=k.id
LEFT JOIN eiai_model m ON km.model_id=m.id;

CREATE OR REPLACE VIEW eiai_v_key_group AS
SELECT k.*, g.name group_name from eiai_key k
LEFT JOIN eiai_group g ON k.group_id=g.id;


