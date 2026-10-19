# Upstream

This directory is a fork of
[aws-samples/sample-claude-code-web-agent-on-bedrock-agentcore](https://github.com/aws-samples/sample-claude-code-web-agent-on-bedrock-agentcore).

- Commit: `0416d92`
- License: MIT-0 (see `LICENSE`)

## Imported

`backend/`, `web_client/`, `serve`, `pyproject.toml`, `uv.lock`, `LICENSE`, and
`Dockerfile` (upstream `deploy/Dockerfile`).

## Not imported

`cli_client/`, `claude/`, `docs/`, the scripts under `deploy/`,
`web_client/test_api_modes.sh`, `web_client/test_invocations.html`, and the
upstream root `README*` and `CLAUDE.md`.

## Modifications

Changes relative to upstream commit `0416d92`. Every change inside this
directory must be listed here.

- `backend/api/invocations.py`: `parse_session_and_user_from_headers` takes the
  user id from the session id (the part before `@workspace`) instead of decoding
  a JWT `sub`; the `jwt` import is removed (`pyjwt` stays in `pyproject.toml`).
- `backend/api/invocations.py`: added `BRC_ENV_HEADERS` and
  `apply_brc_request_env`, called first in `invocations()`, which copies the four
  BRConnector custom headers into `ANTHROPIC_AUTH_TOKEN`, `AWS_ACCESS_KEY_ID`,
  `AWS_SECRET_ACCESS_KEY`, and `AWS_SESSION_TOKEN`. Only variable names are logged.
- `backend/tests/`: new tests (`test_brc_identity.py`); upstream has none.
