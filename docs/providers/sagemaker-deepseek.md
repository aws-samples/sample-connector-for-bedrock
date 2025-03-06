# sagemaker-deepseek

> Since Docker image version 0.0.27

This provider is designed to adapt DeepSeek R1 class models deployed in SageMaker.

## Deployment Scenarios

The following methods for deploying DeepSeek-R1 models in SageMaker have been tested:

**1. Deployment using the lmi engine**

It directly outputs content, and in most cases includes a `</think>` tag.

Please refer to the deployment script:

<https://github.com/aws-samples/sample-connector-for-bedrock/tree/main/notebook/SageMaker>

**2. Direct deployment using JumpStart**

Using JumpStart will directly output the standard DeepSeek format, which includes content with the `reasoning_content` attribute. Please set the platform to `deepseek`.

**3. Deployment using Bedrock**

It directly outputs content, and in most cases includes a `</think>` tag.

Another difference is that it outputs information like `data:`. This provider has already handled these differences.

## Configuration

```json
{
  "regions": [
    "us-east-1"
  ],
  "endpointName": "<your-sagemaker-endpoint-name>",
  "thinking": true,
  "platform": "deepseek"
}
```

| Key     | Type      | Required     | Default value | Description |
| ------------- | -------| ------------- | ------------- | ------------- |
| endpointName  | string   | Y    |  |   SageMaker endpoint name  |
| regions  | string[] or string   | N     | ["us-east-1"] |   You can deploy the model in multiple availability zones to increase model availability. |
| platform  | string  | N     |  |   If using JumpStart, fill in `deepseek`. For other cases, this is not required. |
| thinking  | boolean  | N     | false |   In lmi mode, enabling thinking will force adding a `<think>` tag after the prompt |
