# nova-canvas

> Applicable for Docker image version 0.0.20 and above

This Provider implements various image processing and generation capabilities of the nova-canvas model.

## Configuration

```json
{
  "regions": ["us-east-1"],
  "s3Bucket": "<your-bucket>",
  "s3Prefix": "<your-prefix>",
  "s3Region": "us-east-1",
  "paintModelId": "amazon.nova-canvas-v1:0",
  "localLlmModel": "claude-haiku-5-5-chat"
}
```

| Key | Type | Required | Default Value | Description |
|-----|------|----------|---------------|-------------|
| localLlmModel | string | Yes | - | Choose a local model that supports **function calling** |
| paintModelId | string | Yes | amazon.nova-canvas-v1:0 | Currently only this value is supported |
| s3Bucket | string | Yes | - | For storing generated images, ensure correct IAM permissions |
| s3Prefix | string | No | - | S3 prefix, combines with date to form the final S3 key |
| s3Region | string | Yes | - | Region of the S3 bucket |
| regions | string[] | No | ["us-east-1"] | Available regions for paintModelId |
| price_per_image | number | No | 0 | The price of one image, in the model's currency. Set it so that image generation is billed; see [Billing](#billing) |

## Feature Overview

Supports multi-turn image processing dialogues using natural language. Main features include:

| Feature | Task Type | Example | Notes |
|---------|-----------|---------|-------|
| Text-to-Image | TEXT_IMAGE | "Generate a cute kitten" | - |
| Image-to-Image | TEXT_IMAGE | "Generate a kitten based on this image: https(s3)://url..." | May trigger IMAGE_VARIATION |
| Background Removal | BACKGROUND_REMOVAL | "Remove the background from this image: https(s3)://url..." | - |
| Change Foreground | INPAINTING | "Replace the female model in the image with an Asian model" | Clearly specify the foreground object to change. In multi-turn conversations, if the foreground can be inferred, it doesn't need to be specified. |
| Change Background | OUTPAINTING | "Change the background of the female model to an indoor scene" | - |
| Generate Variations | IMAGE_VARIATION | "Generate some variations based on the above image" | - |
| Image Colorization | COLOR_GUIDED_GENERATION | "Add red and orange tones to the image" | - |

Additionally, you can specify the number and dimensions of images to generate during the conversation.

For detailed examples, please refer to: <https://docs.aws.amazon.com/nova/latest/userguide/image-gen-access.html>

## Billing

- Each image task is billed at `price_per_image` for each image the model returns, in the model's currency. For example, `"price_per_image": 0.04` bills 0.08 for a task that returns 2 images.
- `price_per_image` is per **image**, not per token. When it is missing, blank, negative or not a number, images are recorded at 0, so set it to bill image generation, for example to the price of `paintModelId` in your Region on the [Amazon Bedrock pricing page](https://aws.amazon.com/bedrock/pricing/).
- The call that chooses the task and its parameters goes to `localLlmModel` and is billed as a call to that model, at its prices.

## Additional Notes

When making API requests, if the `stream` parameter is set to `false`, the output will be in the following format:

```json
{
  "model": "some-model",
  "choices": [
    {
      "index": 0,
      "message": {
        "content": "I'll help you generate an image of a cat in the style of Qi Baishi, the renowned Chinese painter known for his watercolor works with bold, expressive brushstrokes and a distinctive traditional Chinese artistic style.\n\nLet me use the txt2img function to create this image. I'll craft a prompt that captures both the cat and Qi Baishi's artistic style.",
        "role": "assistant"
      }
    },
    {
      "message": {
        "tool_calls": [
          {
            "type": "function",
            "function": {
              "name": "txt2img",
              "arguments": {
                "prompt": "A lovely cat painted in Qi Baishi style, traditional Chinese ink and wash painting, expressive brushstrokes, minimalist composition, elegant and graceful, watercolor technique",
                "width": 512,
                "height": 512,
                "negative_prompt": "nsfw, photorealistic, western art style, digital art"
              }
            }
          }
        ]
      }
    }
  ],
  "usage": {
    "completion_tokens": 235,
    "prompt_tokens": 2529,
    "total_tokens": 2764
  },
  "images": [
    "https://a-s3-signed-url"
  ]
}
```
