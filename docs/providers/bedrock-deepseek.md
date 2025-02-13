# bedrock-deepseek

> Since Docker image version 0.0.23

LLM Consistent Interface.

Sends messages to DeepSeek models deployed on Amazon Bedrock. This provider supports Think tags which are rendered as markdown blockquotes in the output.

## Configuration

Invoke DeepSeek model via Amazon Bedrock API. This provider allows you to configure and use DeepSeek models deployed on Bedrock.

| Key     | Type      | Required     | Default value | Description |
| ------------- | -------| ------------- | ------------- | ------------- |
| modelId  | string   | Y    |  |   Model ARN for the deployed DeepSeek model  |
| regions  | string[] or string   | N     | ["us-east-1"] |   If you have applied and specified multiple regions, then a region will be randomly selected for the call. This feature can effectively alleviate performance bottlenecks.  |
| maxTokens  |  number   | N     | 8192 | The default maximum number of tokens, corresponding to the max_tokens parameter in the standard API. If not specified in the API, this value will be used.   |

The configuration example:

```json
{
  "modelId": "arn:aws:sagemaker:region:xxxxx:endpoint/ds-endpoint",
  "regions": [
    "us-west-2"
  ],
  "maxTokens": 8192
}
```
