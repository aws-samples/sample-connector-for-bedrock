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
  "localLlmModel": "claude35"
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

## Feature Overview

Supports multi-turn image processing dialogues using natural language. Main features include:

| Feature | Task Type | Example | Notes |
|---------|-----------|---------|-------|
| Text-to-Image | TEXT_IMAGE | "Generate a cute kitten" | - |
| Image-to-Image | TEXT_IMAGE | "Generate a kitten based on this image: https(s3)://url..." | May trigger IMAGE_VARIATION |
| Background Removal | BACKGROUND_REMOVAL | "Remove the background from this image: https(s3)://url..." | - |
| Change Foreground | INPAINTING | "Replace the female model in the image with an Asian model" | Clearly specify the foreground object to change |
| Change Background | OUTPAINTING | "Change the background of the female model to an indoor scene" | - |
| Generate Variations | IMAGE_VARIATION | "Generate some variations based on the above image" | - |
| Image Colorization | COLOR_GUIDED_GENERATION | "Add red and orange tones to the image" | - |

Additionally, you can specify the number and dimensions of images to generate during the conversation.

For detailed examples, please refer to: <https://docs.aws.amazon.com/nova/latest/userguide/image-gen-access.html>

## Additional Notes

When making API requests, if the stream parameter is set to false, the output will be in the following format:

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
