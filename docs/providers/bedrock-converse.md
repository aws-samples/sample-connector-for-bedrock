# bedrock-converse

> Since Docker image version 0.0.6

LLM Consistent Interface.

Sends messages to the specified Amazon Bedrock model. `Converse` provides a consistent interface that works with all models that support messages. This allows you to write code once and use it with different models. If a model has unique inference parameters, you can also pass those unique parameters to the model.

## Configuration

Invoke model via Amazon Bedrock Converse API. You can config all supported models with this provider.

[This page](https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference.html) explains how to use Bedrock Converse API, and what features it supports.

It is recommended to use this provider, which can uniformly configure Bedrock models and support function calling.

| Key     | Type      | Required     | Default value | Description |
| ------------- | -------| ------------- | ------------- | ------------- |
| modelId  | string   | Y    |  |   Model id, See [Bedrock doc](https://docs.aws.amazon.com/bedrock/latest/userguide/model-ids.html)  |
| regions  | string[] or string   | N     | ["us-east-1"] |   If you have applied and specified multiple regions, then a region will be randomly selected for the call. This feature can effectively alleviate performance bottlenecks.  |

The configuration example:

```json
{
  "modelId": "anthropic.claude-3-sonnet-20240229-v1:0",
  "regions": [
    "us-east-1",
    "us-west-2"
  ]
}
```
