# azure-openai

> Since Docker image version 0.0.32

Azure OpenAI Service Interface.

Sends messages to the specified Azure OpenAI model. This provider allows you to connect to Azure OpenAI deployments and use them through the Sample Connector for Bedrock.

## Configuration

Invoke models via Azure OpenAI API. You can configure Azure OpenAI deployments with this provider.

[Azure OpenAI Service documentation](https://learn.microsoft.com/en-us/azure/ai-services/openai/) explains how to use Azure OpenAI API, and what features it supports.

It is recommended to use this provider to connect to Azure OpenAI deployments.

| Key | Type | Required | Default value | Description |
| --- | --- | --- | --- | --- |
| apiKey | string | Y | | Your Azure OpenAI API key |
| baseURL | string | Y | | The base URL for your Azure OpenAI deployment, including the deployment name (e.g., "<https://your-resource-name.openai.azure.com/openai/deployments/your-deployment-name>") |
| apiVersion | string | Y | | The Azure OpenAI API version to use (e.g., "2025-01-01-preview"). Streams send `stream_options`; for an API version that rejects it, set `streamUsage` to `false` |
| streamUsage | boolean | N | true | Ask Azure OpenAI for usage on streams (`stream_options.include_usage`), so that streamed calls are billed. Set `false` only for an API version that rejects `stream_options`. |

The configuration example:

```json
{
  "apiKey": "<your-key>",
  "baseURL": "https://your-resource-name.openai.azure.com/openai/deployments/your-deployment-name",
  "apiVersion": "2025-01-01-preview"
}
```

## Billing

- A non-stream call is billed from the `usage` in the response.
- A stream sends `stream_options: {"include_usage": true}` to the upstream, unless `streamUsage` is `false`. The call is billed once, after the stream ends, from the last usage the upstream sent, whatever the finish reason (`stop`, `tool_calls`, `length` and so on).
- The usage-only chunk (empty `choices`) is forwarded to the client only if the client asked for it with `stream_options.include_usage`.
- If a stream ends without usage, for example with `streamUsage: false`, the call is recorded with 0 tokens and a warning naming the model is logged.
- Input tokens are billed at `price_in` and output tokens at `price_out`.

## Output Results

The output follows the standard OpenAI API format:

```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1677858242,
  "model": "gpt-4o",
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "This is the response from the Azure OpenAI model."
      },
      "finish_reason": "stop",
      "index": 0
    }
  ],
  "usage": {
    "prompt_tokens": 13,
    "completion_tokens": 7,
    "total_tokens": 20
  }
}
```
