# painter

> Since Docker image version 0.0.9
> Updated in Docker image version 0.0.12

Draw using the bedrock paint model.

## Configuration

```json
{
  "regions": [
    "us-east-1",
    "us-west-2"
  ],
  "s3Bucket": "<your-bucket>",
  "s3Prefix": "<your-prefix>",
  "s3Region": "us-east-1",
  "paintModelId": "amazon.titan-image-generator-v2:0",
  "localLlmModel": "claude35"
}
```

| Key     | Type      | Required     | Default value | Description |
| ------------- | -------| ------------- | ------------- | ------------- |
| localLlmModel  | string   | N    |   | You should choose a native model for **function calling** |
| paintModelId  | string   | N    | "stability.stable-diffusion-xl-v1" |  Bedrock image gen model id. This provider can be one of "stability.stable-diffusion-xl-v1", "amazon.titan-image-generator-v1" and "amazon.titan-image-generator-v2:0".  |
| s3Bucket  | string   | Y    |  | S3 is for storing the generated images, please set the IAM permissions to meet access requirements.  |
| s3Prefix  | string   | N    | "" |   The S3 prefix combined with the date will ultimately form the S3 key.  |
| s3Region  | string   | Y     | | S3 bucket region  |
| regions  | string   | N     | ["us-east-1"] |   If you have applied and specified multiple regions, then a region will be randomly selected for the call. This feature can effectively alleviate performance bottlenecks.  |

Then grant this model to  group or apikey.

## Features and Screenshots in BRClient

Features:

- Supports natural language conversation
- Supports multi-turn conversation to refine prompts
- Supports multiple languages
- Supports image size and aspect ratio ratio

Screenshots in BRClient:

![demo dish](./screenshots/demo-dish-1.png)

![demo dish](./screenshots/demo-dish-2.png)
