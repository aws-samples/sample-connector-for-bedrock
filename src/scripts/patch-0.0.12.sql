CREATE TABLE IF NOT EXISTS eiai_bot_connector (
    id serial PRIMARY KEY,
    name varchar(64) NOT NULL,
    provider varchar(64),
    config jsonb NOT NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
