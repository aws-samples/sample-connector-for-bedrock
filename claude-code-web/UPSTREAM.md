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
  a JWT `sub`; the `jwt` import is removed.
- `pyproject.toml`, `uv.lock`: `pyjwt` removed from the direct dependencies (nothing imports `jwt`
  any more); it stays in the lock as a dependency of `mcp`. The lock was regenerated with
  `uv lock` (uv 0.13.1): only the two root `pyjwt` lines go, and the lock format `revision` goes from 3
  to 5; no package version changes.
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
- `backend/core/paths.py` (new), `backend/api/mcp_servers.py`, `backend/api/plugins.py`,
  `backend/core/session.py`, `backend/core/workspace_sync.py`: upstream hardcodes `/root/.claude`
  (and `/root` as the `HOME` fallback), which fails for the non-root `node` user
  (`Permission denied: '/root/.claude/mcp.json'`). Added `claude_dir()` / `mcp_config_path()`,
  resolved at call time from `HOME`; the MCP endpoints and session loader use them. In
  `plugins.py` the import-time constants (`CLAUDE_DIR`, `CLAUDE_PLUGINS_DIR`, `INSTALLED_PLUGINS_PATH`,
  `KNOWN_MARKETPLACES_PATH`, `MARKETPLACES_DIR`, `SETTINGS_PATH`) became functions
  (`_plugins_dir()`, ...). `workspace_sync.py` falls back to `os.path.expanduser("~")`. Docstrings updated.
  Tests in `backend/tests/test_home_paths.py`.
- `Dockerfile` (upstream `deploy/Dockerfile`): rewritten. Pinned versions, checked
  on 2026-10-19: base image `public.ecr.aws/docker/library/node:24.22.0-trixie-slim`
  (current LTS line "Krypton"; tag confirmed in public ECR), `@anthropic-ai/claude-code@2.1.303`
  (npm latest), `ghcr.io/astral-sh/uv:0.13.1` (GitHub latest; manifest confirmed).
  uv is copied with `COPY --from` instead of `curl | sh`; `apt` installs only
  `git git-lfs curl ca-certificates vim` (no `gh`, no `wget`).
- Claude Code versions in the image: the global `@anthropic-ai/claude-code@2.1.303` is what `claude`
  runs in the terminal. The chat agent does not use it: `claude-agent-sdk` (0.1.19 in `uv.lock`)
  starts the CLI bundled in its wheel before looking on `PATH`, and that CLI is 2.1.1
  (`claude_agent_sdk/_cli_version.py`, checked on 2026-10-19 in the locked
  `manylinux_2_17_aarch64` wheel). Upgrading the chat agent's Claude Code means upgrading
  `claude-agent-sdk` in `uv.lock`.
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
  instead of `VITE_DEFAULT_MODEL`, and auto-connect waits for it; the header GitHub button is hidden;
  the default background model is the BRConnector model name `claude-haiku-5-5` instead of a Bedrock
  model id.
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
- `web_client/src/api/client.js`: a failed `_invoke` and both `stopAgentCoreSession` copies throw an
  error whose message is the response's `detail` (BRConnector BFF `{ error, detail }` or FastAPI
  `{ detail }`; upstream showed only `Invocation failed: <path>`), keeping `status`, `statusText` and
  `detail` on it. Built by `web_client/src/utils/responseError.js` (new; pure, tested from the
  BRConnector root suite).
- `web_client/.env.production`: new; fixed build settings for the `/cc` deployment (server URL
  `/cc/api`, invocations mode, settings button hidden, workspace mode).
- `web_client/package.json`, `web_client/package-lock.json`: removed `aws-amplify` and
  `@aws-amplify/ui-react` (only Cognito used them).
- `web_client/src/components/Signup.jsx`, `web_client/src/config/cognito.js`,
  `web_client/src/components/OAuthCallback.jsx`: deleted (Cognito sign-up and config, GitHub
  OAuth callback page).
- `backend/api/oauth.py`: `get_github_oauth_token` and `github_oauth_callback` take the user id from
  the session id header (via `parse_session_and_user_from_headers`) instead of an unverified
  `jwt.decode(..., verify_signature=False)`; the `jwt` use is removed. The callback passes
  `userIdentifier={"userId": ...}` to `complete_resource_token_auth` instead of the JWT. Tests:
  `backend/tests/test_oauth_identity.py`. The `get_github_oauth_token` docstring no longer says the
  JWT user is sent as `sessionUri` (no `sessionUri` was ever sent): the user comes from the session id
  header and is only required and logged.
- `backend/api/git.py`, `backend/core/s3_client.py`, `backend/core/workspace_sync.py`,
  `backend/api/shell.py`: inline `# nosemgrep` comments naming `dangerous-asyncio-create-exec-audit`
  and `dangerous-asyncio-shell-audit`, each with its reason. `s3_client.py`, `workspace_sync.py`: exec
  form with an argument list, no shell. `git.py`: no shell, but cwd, remote, branch and file paths come
  from the caller and git may read them as options (e.g. `--receive-pack=<cmd>`); accepted because it
  runs in that user's own single-user microVM, where the shell feature already runs any command.
  `shell.py`: the remote shell is the product feature; it runs in that user's own single-user AgentCore
  microVM, which holds the user's API key and workspace credentials and also the runtime role (see
  `docs/user-manual/scenarios/claude-code-web.md`). No behaviour change.
- `web_client/src/components/FilePreview.jsx`: `// nosemgrep` for `insecure-innerhtml` and
  `insecure-document-method` on the highlight.js output (hljs escapes its input).
- `backend/tests/test_brc_identity.py`, `backend/tests/test_oauth_identity.py`,
  `backend/tests/forged_jwt.py` (new): the forged bearer value is an unsigned JWT for another user,
  built at run time by `forged_jwt()` so no JWT literal sits in the repo (`detected-jwt-token`). It
  decodes as a JWT, so a regression that reads its `sub` again fails the tests that prove
  `Authorization` is ignored.
- `Dockerfile`: added `HEALTHCHECK` (curl on `/ping`).
- `web_client/src/components/ChatContainer.jsx`, `web_client/src/utils/inputHeight.js`: the chat input
  box defaulted to 120px and could be dragged down to 60px, but its contents (24+16 padding, model
  selector row, 8px gap, 90px textarea minimum) need ~167px, so the textarea overflowed the bottom of
  the window. Default and drag lower bound are now the computed `INPUT_AREA_MIN_HEIGHT` (named
  constants); max stays 400. Dragging now clamps instead of ignoring out-of-range moves. Test:
  `test/claude_code_web_input_height.test.ts`.
- Paste / drop images into the chat (upstream sends text only):
  - `web_client/src/utils/imageAttachments.js` (new; pure, tested from the BRConnector root suite in
    `test/claude_code_web_image_attachments.test.ts`): PNG/JPEG/GIF/WebP allowlist, max 5 images per
    message, long edge downscaled to 1568 px, PNG kept up to 1 MB else re-encoded as JPEG quality 0.85,
    an image over 3.75 MB of base64 rejected, a send over 4.5 MB (image base64 plus the text's UTF-8
    bytes) rejected (the BFF caps /cc/api request bodies at 8 MiB). Every model call resends the whole conversation, so
    the images of one session (already in the chat plus pending) share a 4.5 MB base64 budget
    (`sessionImageBase64`, `fitSessionBudget`, `sessionBudgetError`); adding or sending past it is refused
    with "Image budget for this session is used up (4.5 MB). Start a new session to send more images."
    `buildUserMessage` returns the plain string when there are no images (the text
    path is unchanged), otherwise `{role: 'user', content: [...image blocks, text block]}` without an
    empty text block. Canvas/ImageBitmap use is injected (`browserImageCodec`).
  - `web_client/src/components/ChatContainer.jsx`: `onPaste` on the textarea (image files in
    `clipboardData.files` are attached even when `text/plain` is present, e.g. a file copied in Finder;
    plain text with no image file is left to the browser) and drag-and-drop onto the input area add
    images; pending thumbnails with a remove button sit above the textarea, errors show in the same row
    with a dismiss button; Enter/send sends them and clears the list. `web_client/src/utils/inputHeight.js`: `INPUT_ATTACHMENT_ROW_HEIGHT` and
    `inputAreaHeight` grow the input box by that row so the textarea keeps its height.
  - `web_client/src/hooks/useClaudeAgent.js`: `sendMessage` accepts that dict; user messages (live and
    from history) keep the text in `content` and the image data URLs in `images`.
    `web_client/src/components/Message.jsx` renders `images` as `<img src>` only for `data:` URLs of the
    allowed types; the text still goes through the escaping formatter. `web_client/src/style.css`:
    attachment and message image styles.
  - `web_client/src/main.jsx`: calls `preventFileDropNavigation(document)` (`imageAttachments.js`), which
    cancels the browser's default for file dragover/drop anywhere on the page, so a file dropped outside
    the input area no longer opens in the tab and loses the chat. Text drags and the input area's own
    handler are untouched.
  - `backend/api/sessions.py`: the history endpoint keeps a user message that has image blocks as one
    message whose `content` is its image and text blocks (upstream dropped image blocks).
  - `backend/core/message_log.py` (new): `summarize_message`. `backend/core/session.py` and
    `backend/api/messages.py` log a dict message as block types and byte sizes instead of printing it
    (with its base64 data); the role is coerced to a string of at most 32 characters. The `start` stream
    event echoes that summary instead of the dict (the client reads only its `session_id`); a string
    message is still echoed as is. Tests: `backend/tests/test_message_log.py`.
- `backend/core/user_settings.py` (new): `apply_default_user_settings` adds `"skipWebFetchPreflight": true` to
  `~/.claude/settings.json` when the key is missing (creates the file if absent), so Claude Code does not send
  the hostname of each WebFetch to api.anthropic.com for a domain check. Other keys and an explicit value are
  left as they are; a file that is not a JSON object is left unchanged and logged. The write is atomic
  (temp file, then rename). `backend/core/session.py`: `connect()` calls it just before the SDK client is
  created, so it runs after the per-user `.claude` restore from S3 and the later backup keeps the key.
  Tests: `backend/tests/test_web_fetch_preflight_default.py`.
- `backend/core/session.py`: added `web_search_mcp_server()`. When `AGENTCORE_WEB_SEARCH_GATEWAY_URL` is an https
  `<id>.gateway.bedrock-agentcore.<region>.amazonaws.com` URL, `connect()` adds a stdio MCP server `web-search` to the
  session's `mcp_servers`: `<venv scripts dir>/mcp-proxy-for-aws <url> --service bedrock-agentcore --region <region from
  the host>`. It is passed to the SDK per session and never written to `~/.claude/mcp.json`. A user server named
  `web-search` replaces it only when it is selected for the session; one that is only defined in `mcp.json` does not.
  Its `env` sets `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_SESSION_TOKEN` to
  empty strings: the CLI starts MCP servers with its own environment plus `env`, so the per-request workspace
  credentials (fixed when the CLI starts, expiring within the hour) are replaced, and boto3 uses the runtime role from
  the microVM metadata service (MMDS), fetched for every signed request. Unset, blank or any other URL adds nothing
  (another URL is logged). Tests: `backend/tests/test_web_search_mcp.py`.
  Because the proxy signs with the runtime role and not the per-key credentials: CloudTrail attributes the gateway calls
  to the runtime role, not to the key; web search cannot be turned off for a single key; a microVM that is still
  running after its key is revoked can keep calling the gateway until the microVM ends; and searches cost about
  $7 per 1,000 queries (AgentCore Web Search pricing) outside BRConnector's quotas and cost tracking.
- `backend/core/session.py`: when the session's MCP servers include one named `web-search` (the preconfigured one or a
  selected user server), `connect()` adds `WebSearch` to `disallowed_tools` (kept with any existing entries, as
  `--disallowedTools`), and `permission_callback` denies `WebSearch` instead of auto-allowing it, even when
  `AUTO_ALLOW_TOOLS` lists it. Claude Code treats the BRConnector base URL as the first-party API and offers its built-in
  `WebSearch`, which sends a `web_search_20250305` server tool that Bedrock does not serve; hiding it leaves the MCP
  tool as the only web search. Without a `web-search` server nothing changes. Tests: `backend/tests/test_web_search_mcp.py`.
- `backend/tests/test_files_upload.py` (new): `/files/upload` with a multipart body (file plus `directory` form field)
  writes the file; covers the `python-multipart` update below.
- `pyproject.toml`, `uv.lock`: added `mcp-proxy-for-aws==1.7.0` (MCP Proxy for AWS, console script `mcp-proxy-for-aws`
  = `mcp_proxy_for_aws.server:main`) with `uv add` (uv 0.13.1). Not `mcp-proxy-for-aws-cli`: that wheel holds no code,
  only exact pins for every dependency plus a `mcp-proxy-for-aws-cli` script for the same function, and its
  `packaging==26.1` pin cannot resolve with `langfuse>=2,<3`. The lock gains 39 packages (`fastmcp` 3.4.0 and its
  dependencies); `python-multipart` goes from 0.0.22 to 0.0.32; no other locked version changes. Every new package has a
  `py3-none-any` or `manylinux` aarch64 wheel. `Dockerfile` unchanged: `uv sync --frozen --no-dev` installs the script
  in `/app/.venv/bin`, so nothing is downloaded at runtime.
