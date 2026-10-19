# bedrock-runtime-anthropic

Passes Anthropic Messages requests through to Amazon Bedrock's native Claude endpoint on `bedrock-runtime` (`/anthropic/v1/messages`). Use it to run Claude Code, or any other Anthropic Messages client, against Claude on Bedrock through BRConnector. `system`, `tools`, `messages` and thinking blocks are forwarded as sent, so prompt caching and thinking signatures keep working.

It serves `POST /v1/messages` only. `POST /v1/chat/completions` and `POST /v1/completions` return HTTP 400 with a message that points to `/v1/messages`. For Claude through the OpenAI-style API, keep using [bedrock-converse](bedrock-converse.md).

## Configuration

| Key | Type | Required | Default value | Description |
| --- | --- | --- | --- | --- |
| modelId | string | Y | | Bedrock model id. Current Claude models are only available through cross-Region inference, so use the inference profile id, for example `global.anthropic.claude-sonnet-5-5`. |
| regions | string[] or string | N | `AWS_DEFAULT_REGION`, or `us-east-1` | One region is picked for each attempt. A string may hold several regions separated by commas. |
| bearerToken | string | N | | Bedrock API key. Takes precedence over `credentials`. |
| credentials | object[] | N | | `[{ "accessKeyId", "secretAccessKey" }]`. When several are given, one is picked for each attempt, and a retry uses a different one. |
| maxRetries | number | N | `3` | Retries on 429, 500, 502, 503 and 504 responses, and on network errors raised before a response arrives, as long as no output has been sent. Must be a whole number of 0 or more; any other value is replaced by `3`. |
| price_cache_read | number | N | `price_in` | Price **per token** (not per million tokens) for prompt-cache reads. |
| price_cache_write | number | N | `price_in` | Price **per token** for 5-minute prompt-cache writes. |
| price_cache_write_1h | number | N | `price_cache_write` | Price **per token** for 1-hour prompt-cache writes. |

Without `bearerToken` or `credentials`, the provider uses `AWS_BEARER_TOKEN_BEDROCK` if it is set, and otherwise the default AWS credential chain.

If `HTTPS_PROXY` or `HTTP_PROXY` is set, requests to Bedrock go through that proxy.

## Claude Code setup

Point Claude Code at BRConnector with environment variables:

```bash
export ANTHROPIC_BASE_URL=https://<your-brconnector-host>
export ANTHROPIC_AUTH_TOKEN=<BRConnector API key>
export ANTHROPIC_DEFAULT_OPUS_MODEL=claude-opus-5-5
export ANTHROPIC_DEFAULT_SONNET_MODEL=claude-sonnet-5-5
export ANTHROPIC_DEFAULT_HAIKU_MODEL=claude-haiku-5-5
# Optional: stop Claude Code from sending experimental beta flags
export CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1
```

The model names above are the [preset models](#preset-models). If you add your own, use the names you gave them in the admin console.

### Model names

Claude Code decides how to write the request from the model name. For example, Haiku 4.5 gets `thinking: enabled` with `budget_tokens`, while 4.6 and 5.x get `thinking: adaptive` with `output_config.effort`. If the name and the `modelId` are from different generations, Bedrock answers 400, for example `"thinking.type.enabled" is not supported for this model`.

So name a model after the Anthropic model id, and make sure it points to a `modelId` of the same generation. Send the model name alone: a `model` value that contains `/` is rejected with HTTP 400, and the model id always comes from `modelId`.

## Behavior

- Only the `model` field is rewritten (to the Bedrock model id). `system`, `tools`, `messages` and thinking blocks are not touched. `metadata` is dropped, because Bedrock rejects the `metadata.user_id` that Claude Code sends.
- **Session stickiness.** When the request has a `session-id` or `x-claude-code-session-id` header, the region and the credential are chosen by a stable hash of the session id, so one Claude Code session keeps hitting the same prompt cache. A retry moves on to the next region or credential. Without a session id, the choice is random. The session id can be at most 128 characters; a longer one is rejected with HTTP 400 before Bedrock is called.
- **Betas.** The `anthropic-beta` values are passed through, with no allowlist. If Bedrock rejects specific beta values with a 400, the provider removes them, resends the request once, and remembers them for that Bedrock `modelId` until the process restarts, so later requests leave them out from the start. If the request still fails, the error is returned as is.
- **Errors.** Errors on `/v1/messages` come back in Anthropic format, `{"type":"error","error":{"type":"...","message":"..."}}`, with the matching HTTP status. When Bedrock sends a `retry-after` header, it is passed on.
- **Retries.** Throttling (429), 500, 502, 503 and 504 responses, and network errors before a response arrives, are retried up to `maxRetries` times. Nothing is retried once output has been sent to the client. Before each retry the provider waits a random time below 200 ms, a limit that doubles with each retry up to 2 seconds, or the `retry-after` time from Bedrock (at most 5 seconds).
- **Streaming.** Server-sent events are relayed as Bedrock sends them. A `ping` event is sent after 15 seconds without upstream data, so that long thinking does not trip idle timeouts. If the client leaves, nothing more is written to it, but the stream from Bedrock is still read to the end and billed.

## Billing

In the admin page, enter `Price-In` and `Price-Out` per million tokens. BRConnector stores them per token. The three cache prices are set in the model's config and are always per token.

> **The two kinds of price use different units.** The admin page takes `Price-In` and `Price-Out` per **million** tokens. The config takes `price_cache_read`, `price_cache_write` and `price_cache_write_1h` per **token**. A cache price entered per million tokens bills cache tokens a million times too much.

The fee of a call is:

- input tokens (those that were not read from or written to the cache) at `price_in`;
- cache-read tokens at `price_cache_read`;
- 5-minute cache-write tokens at `price_cache_write`;
- 1-hour cache-write tokens at `price_cache_write_1h`;
- output tokens at `price_out`.

The recorded input tokens are the sum of input, cache-read and cache-write tokens. A cache price that is missing, blank or not a finite number is treated as not configured: a missing cache-read or 5-minute write price falls back to `price_in`, and a missing 1-hour write price falls back to the 5-minute write price.

Each turn of a conversation is stored as one thread row, and its `whole_prompt` holds the full `messages` of the request. It therefore grows with the session, and total storage grows roughly with the square of the number of turns. `system` and `tools` are not stored. With `PERFORMANCE_MODE=true`, nothing is stored.

## IAM

Grant `bedrock:InvokeModel` and `bedrock:InvokeModelWithResponseStream` on the inference profile and on the foundation models it routes to. When you use a Bedrock API key, its identity also needs `bedrock:CallWithBearerToken`.

## Example

```json
{
  "modelId": "global.anthropic.claude-sonnet-5-5",
  "regions": ["us-east-1", "us-west-2"],
  "price_cache_read": 0.0000001,
  "price_cache_write": 0.0000025,
  "price_cache_write_1h": 0.000004
}
```

With this model, set `Price-In` to `2` and `Price-Out` to `10` in the admin page.

## Preset models

These `claude-*-5-5` models are for `/v1/messages` passthrough (Claude Code). For Chat Completions clients use the `claude-*-5-5-chat` presets on [bedrock-converse](bedrock-converse).

BRConnector creates these models on this provider (`src/scripts/migrations/2026-10-20-preset-models.sql`) on a new database, and adds them to an existing database on upgrade. Each model it adds is bound to group 1 if that group exists; a model whose name already exists is left unchanged. Prices are us-east-1 global on-demand prices per 1 million tokens.

| Model name | `modelId` | Input | Output | Cache read | Cache write (5 min) | Cache write (1 h) |
|---|---|---|---|---|---|---|
| `claude-opus-5-5` | `global.anthropic.claude-opus-5-5` | 4.00 | 20.00 | 0.20 | 5.00 | 8.00 |
| `claude-sonnet-5-5` | `global.anthropic.claude-sonnet-5-5` | 2.00 | 10.00 | 0.10 | 2.50 | 4.00 |
| `claude-haiku-5-5` | `global.anthropic.claude-haiku-5-5` | 0.10 | 0.50 | 0.01 | 0.125 | 0.20 |
| `claude-opus-4-8` | `global.anthropic.claude-opus-4-8` | 5.00 | 25.00 | 0.50 | 6.25 | 10.00 |
| `claude-sonnet-4-6` | `global.anthropic.claude-sonnet-4-6` | 3.00 | 15.00 | 0.30 | 3.75 | 6.00 |
| `claude-haiku-4-5` | `global.anthropic.claude-haiku-4-5-20251001-v1:0` | 1.00 | 5.00 | 0.10 | 1.25 | 2.00 |

## Known limitations

- **Haiku 5.5 long-context pricing.** When the input is above Haiku 5.5's long-context threshold, Bedrock charges 5 times the standard rates. BRConnector still bills at the standard rates, so such calls are under-billed. The price list does not give the threshold. Keep this in mind if you resell Haiku 5.5, or avoid very long prompts on it.
- **No `count_tokens`.** The token-counting endpoint is not provided, so Claude Code falls back to its own estimate.
- **No server-side tools.** Bedrock's native endpoint answers 400 for `web_search` and `web_fetch`, so Claude Code's WebSearch does not work through this provider. Use an MCP search tool instead.
- **Request duration.** How long one request may run is limited by how you deploy BRConnector, for example the idle timeout of an ALB, or the 900-second limit of Web Functions. Raise the limit on your side if long generations are cut off.
- **Thinking after a credential change.** Sonnet 5.5 and Haiku 5.5 silently drop thinking blocks that were produced under another account. Within a session, stickiness keeps one credential, so this does not happen. But if `credentials` spans several AWS accounts and a retry moves to another account, the earlier thinking is dropped for that turn. Use credentials from one account, or accept that turn's loss.
