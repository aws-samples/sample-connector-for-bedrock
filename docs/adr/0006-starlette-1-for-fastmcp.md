# 0006. Starlette 1.x in the Claude Code Web backend for fastmcp 3.4.10

Status: Accepted.

## Context

The Claude Code Web backend gets fastmcp and fastmcp-slim through `mcp-proxy-for-aws`. fastmcp-slim 3.4.10 requires `starlette>=1.0.1`. The backend locked starlette 0.50.0, because fastapi 0.128.0 requires `starlette<0.51.0`. The 0.0.45 changelog kept starlette on 0.50.0 although it has known vulnerabilities, because their fixes are only in Starlette 1.x and fastapi held it back.

The backend is a FastAPI application. Starlette 1.0 removes deprecated APIs: the `on_startup` and `on_shutdown` parameters, `on_event()`, `add_event_handler()`, the `route`, `websocket_route`, `exception_handler` and `middleware` decorators, the old `TemplateResponse(name, context)` signature and the `method` argument of `FileResponse`.

## Decision

- Lock fastmcp and fastmcp-slim 3.4.10, and take the starlette and fastapi versions that `uv lock --upgrade-package` chooses: starlette 1.10.0 and fastapi 0.162.7. These are the newest releases that the other locked packages allow.
- `pyproject.toml` does not change. Apart from starlette and fastapi, this decision moves no other locked package.

## Consequences

- The backend uses none of the removed APIs. It uses `lifespan`, `add_middleware` and `FileResponse` without `method`. Its 93 tests pass.
- The starlette vulnerabilities that 0.0.45 kept are fixed.
- `CORSMiddleware` with `allow_origins=["*"]` and `allow_credentials=True` now answers a request with an `Origin` header with that origin instead of `*`. Browsers do not see this, because the gateway reaches the backend only through the AgentCore invoke API.
- The tests print a deprecation warning: `starlette.testclient` with `httpx` is deprecated in favor of `httpx2`. It does not affect the server.
- FastAPI 0.132 and later check the `Content-Type` of a JSON body. A request without the header now gets 422, and before it was parsed as JSON. This affects `POST /invocations`, whose body is a JSON object. A local test of that route gives 200 with `Content-Type: application/json` on FastAPI 0.128.0 and 0.162.7, and without the header it gives 200 on 0.128.0 and 422 on 0.162.7.
- The gateway sends `content-type: application/json` on every `InvokeAgentRuntime` request (`src/controller/runtime/claude_code_web.ts`, `src/claude_code_web/agentcore_client.ts`). The AgentCore HTTP contract describes `/invocations` as a JSON endpoint and shows its requests with `Content-Type: application/json`. The template gives the runtime no session endpoints and grants invoke permission only to the BRConnector role, so in a deployed stack the gateway is the only caller of `/invocations` that the template sets up, and AgentCore itself calls only `GET /ping`. That AgentCore passes the caller's `Content-Type` on to the container has not been checked on a deployed runtime. A direct `InvokeAgentRuntime` call without a content type, for example from the AWS CLI, could therefore fail; AgentCore reports a 4xx from the container as `RuntimeClientError` (HTTP 424).
- To restore the old behavior, pass `strict_content_type=False` to the `APIRouter` in `backend/api/invocations.py`. A local test with that change gives the same three responses as FastAPI 0.128.0 (200 with JSON, 200 without the header, 422 for `text/plain`). The other way back is to keep fastmcp on 3.4.0, which keeps fastapi 0.128.0.
- The other breaking changes from FastAPI 0.129 to 0.162.7 do not reach the backend. Python 3.9 and 3.10 support is dropped, and the image runs Python 3.12. The `**extra` keyword arguments of the parameter functions and `openapi_prefix` are removed, the backend uses neither, and the server starts. `root_path`, `ORJSONResponse` and `UJSONResponse` are deprecated and not used. `router.routes` is now a tree, and the backend does not read it. Automatic OpenTelemetry exporter setup now needs an opt-in, and the backend does not use it. Defaults, form fields, unselected files and JSON `null` are handled differently, but `/invocations` builds the request models itself and calls the other route functions directly, so FastAPI parses only its JSON object. The routes parse their own parameters only when called as REST routes, which a deployed runtime does not expose.

## Alternatives considered

- **Keep fastmcp on 3.4.0.** It keeps Starlette 0.50.0 and its known vulnerabilities, and fastmcp keeps the vulnerability that 3.4.10 fixes.
- **Lock the lowest versions that allow fastmcp 3.4.10**, starlette 1.0.1 and the first fastapi release that accepts it. The jump to Starlette 1.x and its removed APIs is the same, and starlette 1.0.1 still has the vulnerabilities fixed in 1.1.0 and 1.3.1.
