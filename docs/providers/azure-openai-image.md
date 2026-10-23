# azure-openai-image

> Since Docker image version 0.0.33

Azure OpenAI Image Generation Interface.

This provider allows you to generate images using Azure OpenAI's image generation models like GPT-4o with vision capabilities. It connects to Azure OpenAI deployments and makes them available through the Sample Connector for Bedrock.

## Configuration

Invoke image generation models via Azure OpenAI API. You can configure Azure OpenAI image model deployments with this provider.

[Azure OpenAI Service documentation](https://learn.microsoft.com/en-us/azure/ai-services/openai/) explains how to use Azure OpenAI API, and what features it supports for image generation.

| Key | Type | Required | Default value | Description |
| --- | --- | --- | --- | --- |
| model | string | Y | | The image model to use (e.g., "gpt-image-1") |
| apiKey | string | Y | | Your Azure OpenAI API key |
| baseURL | string | Y | | The base URL for your Azure OpenAI deployment, including the deployment name (e.g., "<https://your-resource-name.openai.azure.com/openai/deployments/your-deployment-name>") |
| apiVersion | string | Y | | The Azure OpenAI API version to use (e.g., "2023-05-15" or "2025-01-01-preview") |
| price_per_image | number | N | 0 | The price of one image, in the model's currency. Set it so that image generation is billed; see [Billing](#billing) |

The configuration example:

```json
{
  "model": "gpt-image-1",
  "apiKey": "<your-key>",
  "baseURL": "https://your-resource-name.openai.azure.com/openai/deployments/your-deployment-name",
  "apiVersion": "2025-01-01-preview"
}
```

## Output Results

The output follows the standard OpenAI API format for image generation:

```json
{
  "created": 1713184000,
  "data": [
    {
      "b64_json": "iV...."
    }
  ]
}
```

## Billing

- Each request is billed at `price_per_image` for each image in the response's `data`, in the model's currency. For example, `"price_per_image": 0.04` bills 0.08 for a response with 2 images.
- `price_per_image` is per **image**, not per token. When it is missing, blank or not a number, images are recorded at 0, so set it to bill image generation, for example to your deployment's price for the size and quality you allow.

## Usage

To generate an image, send a request with a prompt describing the image you want to create. You can also specify parameters like image size, quality, and style.

Example request:

```bash
curl http://localhost:8866/v1/images/generations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ............" \
  -d '{
    "model": "azure-image",
    "prompt": "A cute cate",
    "n": 1,
    "size": "1024x1024"
  }'
```
