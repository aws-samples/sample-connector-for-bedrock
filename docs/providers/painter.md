# painter: Draw using the bedrock paint model

## Configuration

Add a model in the /manager UI.

![config](./screenshots/painter001.jpg)

- Name: Any words
- Provider: painter
- Multiple: disable
- Price-in: any number
- Price-out: any number
- Config: Please see the sample below.

```json
{
  "regions": [
    "us-east-1", "us-west-2"
  ],
  "s3Bucket": "<your-bucket>",
  "s3Prefix": "<your-prefix>",
  "s3Region": "us-east-1",
  "sdModelId": "stability.stable-diffusion-xl-v1",
  "llmModelId": "anthropic.claude-3-sonnet-20240229-v1:0"
}
```

Then grant this model to  group or apikey.

## Features and Screenshots in BRClient

Features:

- Supports natural language conversation
- Supports multi-turn conversation to refine prompts
- Supports multiple languages
- Supports image size and aspect ratio ratio

Screenshots in BRClient:

> BRClient has been built into the Docker image (since version 0.0.8). Access address: your-host:8866/brclient/

![demo dish](./screenshots/demo-dish-1.png)

![demo dish](./screenshots/demo-dish-2.png)
