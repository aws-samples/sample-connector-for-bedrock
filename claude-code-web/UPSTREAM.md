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
- `Dockerfile` (upstream `deploy/Dockerfile`): rewritten. Pinned versions, checked
  on 2026-10-19: base image `public.ecr.aws/docker/library/node:24.22.0-trixie-slim`
  (current LTS line "Krypton"; tag confirmed in public ECR), `@anthropic-ai/claude-code@2.1.303`
  (npm latest), `ghcr.io/astral-sh/uv:0.13.1` (GitHub latest; manifest confirmed).
  uv is copied with `COPY --from` instead of `curl | sh`; `apt` installs only
  `git git-lfs curl ca-certificates vim` (no `gh`, no `wget`).
- `Dockerfile` user: reuses the node image's `node` user (UID 1000) instead of
  creating `cc`; `HOME=/home/node`; `/app`, `/workspace` and `/opt/uv-python` are
  owned by it, and `USER node` applies to the build `uv sync --frozen --no-dev`
  and to runtime. The upstream `.bashrc` venv activation moved to `/home/node/.bashrc`.
- `Dockerfile` Python: no `.python-version` is added. The Node base has no system
  Python, so `UV_PYTHON=3.12` makes `uv sync` download a managed CPython 3.12 into
  `UV_PYTHON_INSTALL_DIR=/opt/uv-python` (outside HOME, readable at runtime). After the
  build, `UV_PYTHON_DOWNLOADS=never`, `UV_FROZEN=1` and `UV_NO_DEV=1` keep the
  `uv run` in `/app/serve` offline (no download, no re-lock, no dev group).
- `.dockerignore`: new; excludes `web_client`, `**/__pycache__`, `.venv`, `backend/tests`.
