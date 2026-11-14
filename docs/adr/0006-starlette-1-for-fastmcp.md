# 0006. Starlette 1.x in the Claude Code Web backend for fastmcp 3.4.10

Status: Accepted.

## Context

The Claude Code Web backend gets fastmcp and fastmcp-slim through `mcp-proxy-for-aws`. fastmcp-slim 3.4.10 requires `starlette>=1.0.1`. The backend locked starlette 0.50.0, because fastapi 0.128.0 requires `starlette<0.51.0`. The 0.0.45 changelog kept starlette on 0.50.0 although it has known vulnerabilities, because their fixes are only in Starlette 1.x and fastapi held it back.

The backend is a FastAPI application. Starlette 1.0 removes deprecated APIs: the `on_startup` and `on_shutdown` parameters, `on_event()`, `add_event_handler()`, the `route`, `websocket_route`, `exception_handler` and `middleware` decorators, the old `TemplateResponse(name, context)` signature and the `method` argument of `FileResponse`.

## Decision

- Lock fastmcp and fastmcp-slim 3.4.10, and take the starlette and fastapi versions that `uv lock --upgrade-package` chooses: starlette 1.10.0 and fastapi 0.162.7. These are the newest releases that the other locked packages allow.
- `pyproject.toml` does not change. No other locked version changes.

## Consequences

- The backend uses none of the removed APIs. It uses `lifespan`, `add_middleware` and `FileResponse` without `method`. Its 93 tests pass.
- The starlette vulnerabilities that 0.0.45 kept are fixed.
- `CORSMiddleware` with `allow_origins=["*"]` and `allow_credentials=True` now answers a request with an `Origin` header with that origin instead of `*`. Browsers do not see this, because the gateway reaches the backend only through the AgentCore invoke API.
- The tests print a deprecation warning: `starlette.testclient` with `httpx` is deprecated in favor of `httpx2`. It does not affect the server.

## Alternatives considered

- **Keep fastmcp on 3.4.0.** It keeps Starlette 0.50.0 and its known vulnerabilities, and fastmcp keeps the vulnerability that 3.4.10 fixes.
- **Lock the lowest versions that allow fastmcp 3.4.10**, starlette 1.0.1 and the first fastapi release that accepts it. The jump to Starlette 1.x and its removed APIs is the same, and starlette 1.0.1 still has the vulnerabilities fixed in 1.1.0 and 1.3.1.
