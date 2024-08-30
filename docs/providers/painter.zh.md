# painter

> Since Docker image version 0.0.9

使用 Bedrock 画图模型

## 配置

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

然后将此模型授予组或 apikey。

## BRClient 中的功能和截图

您可以在对话中包含如下信息：

- 支持自然语言对话
- 支持多轮对话以细化提示
- 支持多种语言
- 支持图像大小和宽高比

BRClient 中的截图：

![demo dish](./screenshots/demo-dish-1.png)

![demo dish](./screenshots/demo-dish-2.png)