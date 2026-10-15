# bedrock-runtime-openai

Passes OpenAI Chat Completions requests through to Amazon Bedrock's `bedrock-runtime` endpoint (`/openai/v1/chat/completions`). Use it for models whose model card lists Chat Completions on `bedrock-runtime`: Kimi, GLM, GPT-5.6 and later, gpt-oss, DeepSeek, Qwen and MiniMax. [This page](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-chat-completions.html) describes the API.

Claude is not supported by this provider. Keep Claude models on [bedrock-converse](bedrock-converse.md).

It serves `POST /v1/chat/completions` only. `POST /v1/messages` and `POST /v1/completions` return HTTP 400.

## Configuration

| Key | Type | Required | Default value | Description |
| --- | --- | --- | --- | --- |
| modelId | string | Y | | Bedrock model id. For models that are only available through cross-Region inference, use the inference profile id from the model card, for example `global.moonshotai.kimi-k3` or `global.zai.glm-5.3`. |
| regions | string[] or string | N | `AWS_DEFAULT_REGION`, or `us-east-1` | One region is picked at random for each attempt. A string may hold several regions separated by commas. |
| bearerToken | string | N | | Bedrock API key. Takes precedence over `credentials`. |
| credentials | object[] | N | | `[{ "accessKeyId", "secretAccessKey" }]`. When several are given, one is picked at random, and a retry uses a different one. |
| maxRetries | number | N | `3` | Retries on 429, 500, 502, 503 and 504 responses, and on network errors raised before a response arrives, as long as no output has been sent. Must be a whole number of 0 or more; any other value is replaced by `3`. |
| price_cache_read | number | N | `price_in` | Price **per token** (not per million tokens) for prompt-cache reads. |
| price_cache_write | number | N | `price_in` | Price **per token** (not per million tokens) for prompt-cache writes. |

Without `bearerToken` or `credentials`, the provider uses `AWS_BEARER_TOKEN_BEDROCK` if it is set, and otherwise the default AWS credential chain.

If `HTTPS_PROXY` or `HTTP_PROXY` is set, requests to Bedrock go through that proxy.

## Behavior

- The request body is passed through unchanged, and no default parameters are added. Fields that only Bedrock models understand, such as `prompt_cache_options` and `prompt_cache_breakpoint`, reach Bedrock as sent.
- Send the model name alone. A request such as `name/modelId` is rejected with HTTP 400; the model id always comes from `modelId`.
- The `Session-Id` header can be at most 128 characters. A request with a longer one is rejected with HTTP 400 before Bedrock is called.
- `service_tier` is removed, so requests run on the Standard tier.
- Streaming usage is requested from Bedrock automatically for billing, and is forwarded to the client only if the client asked for it with `stream_options.include_usage`.
- `top_p` is removed for Kimi K3, which accepts only 0.95.
- `max_tokens` is sent as `max_completion_tokens` for GPT-5.6, GPT-6 and GPT-6.1. If the client already sent `max_completion_tokens`, that value is kept.
- These two adjustments are matched on the model id, after removing one cross-Region prefix such as `global.` or `us.`. They do not apply when `modelId` is an application inference profile ARN, so clients of such a model must send parameters the model accepts.
- Bedrock's error status is passed through to the client, including 401 and 403, with Bedrock's error message.
- Throttling (429), 500, 502, 503 and 504 responses, and network errors before a response arrives, are retried up to `maxRetries` times. Each retry picks a new region and, if several `credentials` are configured, a different key. Other errors are not retried, and nothing is retried once output has been sent to the client.
- Before each retry the provider waits a random time below 200 ms, a limit that doubles with each retry up to 2 seconds. When Bedrock sends a `retry-after` header in seconds, it waits that long instead, up to 5 seconds.
- A network error that outlasts the retries returns HTTP 504 if it was a timeout and 502 otherwise. A response that breaks off before the client has received anything also returns 502.
- If a client disconnects during a stream, the provider stops sending to it but keeps reading the response from Bedrock to the end, and records the real usage. The key is billed for the whole call, as with `bedrock-converse`. There is no idle timeout, so an abandoned long generation runs until Bedrock finishes.
- If a stream ends without a usage report, the call is billed as zero tokens and a warning with Bedrock's request id is logged.

## Prices

In the admin page, enter `Price-In` and `Price-Out` per million tokens, for example `3` and `15`. BRConnector stores them per token (`0.000003` and `0.000015`). `price_cache_read` and `price_cache_write` are set in the model's config and are always per token.

> **The two kinds of price use different units.** The admin page takes `Price-In` and `Price-Out` per **million** tokens. The config takes `price_cache_read` and `price_cache_write` per **token**. A cache price entered per million tokens, for example `0.3` instead of `0.0000003`, bills cache tokens a million times too much.

The fee of a call is:

- uncached input tokens at `price_in`. Bedrock's `prompt_tokens` already includes the cached and cache-write tokens, so uncached input is `prompt_tokens` minus the cache-read tokens minus the cache-write tokens;
- cache-read tokens at `price_cache_read`;
- cache-write tokens at `price_cache_write`;
- output tokens at `price_out`.

A cache price that is missing, blank, or not a finite number is treated as not configured, and those tokens are billed at `price_in`.

## IAM

Grant `bedrock:InvokeModel` and `bedrock:InvokeModelWithResponseStream` on the inference profile and on the foundation models it routes to, as for any `bedrock-runtime` inference. When you use a Bedrock API key, its identity also needs `bedrock:CallWithBearerToken`.

## Examples

Kimi K3. Set `Price-In` to `3` and `Price-Out` to `15` (that is `0.000003` and `0.000015` per token). These are the Global cross-Region prices from the K3 model card; the `us.` profile costs 10% more.

```json
{
  "modelId": "global.moonshotai.kimi-k3",
  "regions": ["us-east-1", "us-west-2"],
  "price_cache_read": 0.0000003,
  "price_cache_write": 0.00000375
}
```

GLM 5.3. It is available only to eligible accounts; ask your AWS account team.

```json
{
  "modelId": "global.zai.glm-5.3",
  "regions": ["us-east-1"]
}
```

## Preset models

A new installation creates these models on this provider (`src/scripts/patch-0.0.5.sql`). Existing databases are not changed; add the models in the admin console if you want them. Prices are us-east-1 on-demand prices per 1 million tokens. The in-Region model ids must be available in the Region BRConnector calls.

| Model name | `modelId` | Input | Output |
|---|---|---|---|
| `kimi-k3` | `global.moonshotai.kimi-k3` | 3.00 | 15.00 (cache read 0.30, cache write 3.75) |
| `kimi-k2-5` | `moonshotai.kimi-k2.5` | 0.60 | 3.00 |
| `glm-5` | `zai.glm-5` | 1.00 | 3.20 |
| `deepseek-v3-2` | `deepseek.v3.2` | 0.62 | 1.85 |
| `gpt-oss-120b` | `openai.gpt-oss-120b-1:0` | 0.15 | 0.60 |
| `qwen3-coder-next` | `qwen.qwen3-coder-next` | 0.50 | 1.20 |
| `minimax-m2-5` | `minimax.minimax-m2.5` | 0.30 | 1.20 |
