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
VALUES ('claude-3-sonnet', 1, 'bedrock-claude3', '{"model_id": "anthropic.claude-3-sonnet-20240229-v1:0", "anthropic_version":"bedrock-2023-05-31"}', 3e-6, 15e-6 ) ON CONFLICT (name) DO NOTHING;
INSERT INTO eiai_model (name, multiple, provider, config, price_in, price_out) 
VALUES ('claude-3-haiku', 1, 'bedrock-claude3','{"model_id": "anthropic.claude-3-haiku-20240307-v1:0", "anthropic_version":"bedrock-2023-05-31"}', 0.25e-6, 1.25e-6 ) ON CONFLICT (name) DO NOTHING;
INSERT INTO eiai_model (name, multiple, provider, config, price_in, price_out) 
VALUES ('claude-3-opus', 1, 'bedrock-claude3','{"model_id": "anthropic.claude-3-opus-20240229-v1:0", "anthropic_version":"bedrock-2023-05-31"}', 15e-6, 75e-6 ) ON CONFLICT (name) DO NOTHING;
INSERT INTO eiai_model (name, multiple, provider, config, price_in, price_out) 
VALUES ('mistral-7b', 1, 'bedrock-mistral', '{"model_id": "mistral.mistral-7b-instruct-v0:2"}', 0.15e-6, 0.2e-6) ON CONFLICT (name) DO NOTHING;
INSERT INTO eiai_model (name, multiple, provider, config, price_in, price_out) 
VALUES ('mistral-8x7b', 1, 'bedrock-mistral', '{"model_id": "mistral.mixtral-8x7b-instruct-v0:1"}', 0.45e-6, 0.7e-6) ON CONFLICT (name) DO NOTHING;
INSERT INTO eiai_model (name, multiple, provider, config, price_in, price_out) 
VALUES ('mistral-large', 1, 'bedrock-mistral','{"model_id": "mistral.mistral-large-2402-v1:0"}', 8e-6, 24e-6) ON CONFLICT (name) DO NOTHING;
INSERT INTO eiai_model (name, multiple, provider, config, price_in, price_out) 
VALUES ('mistral-small', 1, 'bedrock-mistral','{"model_id": "mistral.mistral-small-2402-v1:0"}', 1e-6, 3e-6) ON CONFLICT (name) DO NOTHING;
INSERT INTO eiai_model (name, multiple, provider, config, price_in, price_out) 
VALUES ('llama3-8b', 1, 'bedrock-llama3','{"model_id": "meta.llama3-8b-instruct-v1:0"}', 0.4e-6, 0.6e-6) ON CONFLICT (name) DO NOTHING;
INSERT INTO eiai_model (name, multiple, provider, config, price_in, price_out) 
VALUES ('llama3-70b', 1, 'bedrock-llama3','{"model_id": "meta.llama3-70b-instruct-v1:0"}', 2.65e-6, 3.5e-6) ON CONFLICT (name) DO NOTHING;


INSERT INTO eiai_group (name) VALUES ('group 1');

INSERT INTO eiai_group_model (model_id, group_id) 
SELECT id, 1 FROM eiai_model ON CONFLICT (model_id, group_id) DO NOTHING;