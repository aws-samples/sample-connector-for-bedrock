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
| apiVersion | string | Y | | The Azure OpenAI API version to use (e.g., "2023-05-15" or "2025-01-01-preview") |

The configuration example:

```json
{
  "apiKey": "<your-key>",
  "baseURL": "https://your-resource-name.openai.azure.com/openai/deployments/your-deployment-name",
  "apiVersion": "2025-01-01-preview"
}
```

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
