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
- `backend/api/invocations.py`: added `enforce_session_user` and `build_session_payload`.
  `invocations()` calls the former right after parsing the headers, overwriting `user_id`
  in `path_params`, `payload` and `query_params` (only where the key already exists) with the
  session-derived id; session creation always uses that id instead of keeping a client value.
  Covers `list_projects`, `/github/create-project`, session creation and workspace payloads.
  Added `require_session_user`: session creation, `/workspace/projects` (POST, `/backup`, GET)
  and `/github/create-project` fail closed with HTTP 400 `missing BRConnector session user`
  when no session user exists; the two project POST branches always set `user_id` to it.
- `backend/tests/`: new tests (`test_brc_identity.py`, `test_brc_user_override.py`); upstream has none.
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
- `web_client/vite.config.js`: added `base: '/cc/'` so built asset URLs are served under
  the BRConnector `/cc/` mount.
- `web_client/src/utils/authUtils.js`: the bearer token is the BRConnector API key kept in
  localStorage (`brc-cc-api-key`) instead of a Cognito access token; added `setApiKey` and
  `clearApiKey`; `getAgentCoreSessionId` returns the placeholder `me@workspace` (BRConnector
  replaces it); `isAuthError` checks only `status` 401/403. All upstream export names are kept.
- `web_client/src/hooks/useAuth.jsx`: rewritten without Amplify; `login(key)` checks the key with
  BRConnector `GET /v1/models` and also exposes the key's `models` and `defaultModel`.
- `web_client/src/components/Login.jsx`: a single API key field replaces username/password and
  the sign-up link.
- `web_client/src/main.jsx`: `BrowserRouter basename="/cc"`; the `/oauth/callback` route is removed.
- `web_client/src/App.jsx`: no sign-up view; the default model comes from the key's model list
  instead of `VITE_DEFAULT_MODEL`, and auto-connect waits for it; the header GitHub button is hidden.
- `web_client/src/components/SettingsModal.jsx`, `web_client/src/components/ChatContainer.jsx`:
  model options come from the key's model list instead of `VITE_AVAILABLE_MODELS`.
- `web_client/src/components/ProjectSwitcher.jsx`: the "From GitHub" import button is removed
  (GitHub is not offered).
- `web_client/src/utils/brcModels.js`: new; picks the key's `bedrock-runtime-anthropic` models
  and the default model (pure, tested from the BRConnector root suite).
- `web_client/src/components/Message.jsx`: user and assistant text is HTML-escaped before the
  inline-code, bold and newline formatting (upstream inserted it unescaped via
  `dangerouslySetInnerHTML`, an XSS on the origin `/cc` shares with `/manager`). The formatter
  moved to `web_client/src/utils/formatMessage.js` (new; pure, tested from the BRConnector root suite).
- `web_client/.env.production`: new; fixed build settings for the `/cc` deployment (server URL
  `/cc/api`, invocations mode, settings button hidden, workspace mode).
- `web_client/package.json`, `web_client/package-lock.json`: removed `aws-amplify` and
  `@aws-amplify/ui-react` (only Cognito used them).
- `web_client/src/components/Signup.jsx`, `web_client/src/config/cognito.js`,
  `web_client/src/components/OAuthCallback.jsx`: deleted (Cognito sign-up and config, GitHub
  OAuth callback page).
