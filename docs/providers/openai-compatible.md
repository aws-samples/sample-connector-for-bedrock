# openai-compatible

> Applies to Docker image version 0.0.21 and above

This Provider allows you to reconfigure third-party models that have already been adapted to the OpenAI API into BRConnector.

## Configuration

```json
{
  "model": "qwen-plus",
  "apiKey": "sk-...",
  "baseURL": "https://some-url/v1"
}
```

| Key      | Type   | Required | Default | Description         |
|----------|--------|----------|---------|---------------------|
| baseURL  | string | Yes      |         | Base URL            |
| apiKey   | string | Yes      |         | API key             |
| model    | string | Yes      |         | Third-party model name |
| streamUsage | boolean | No    | true    | Ask the upstream for usage on streams (`stream_options.include_usage`), so that streamed calls are billed. Set `false` only for an upstream that rejects `stream_options`. |

## Billing

- A non-stream call is billed from the `usage` in the response.
- A stream sends `stream_options: {"include_usage": true}` to the upstream, unless `streamUsage` is `false`. The call is billed once, after the stream ends, from the last usage the upstream sent, whatever the finish reason (`stop`, `tool_calls`, `length` and so on).
- The usage-only chunk (empty `choices`) is forwarded to the client only if the client asked for it with `stream_options.include_usage`.
- If a stream ends without usage, for example with `streamUsage: false`, the call is recorded with 0 tokens and a warning naming the model is logged.
- Input tokens are billed at `price_in` and output tokens at `price_out`.

## Samples
- [[../user-manual/scenarios/cursor|cursor]]
