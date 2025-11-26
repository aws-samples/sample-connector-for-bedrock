# bedrock-converse

> Since Docker image version 0.0.6

Amazon Bedrock LLM Unified Interface.

Sends messages to the specified Amazon Bedrock model. `Converse` provides a consistent interface that works with all models that support messages. This allows you to write code once and use it with different models. If a model has unique inference parameters, you can also pass those unique parameters to the model.

## Configuration

Invoke model via Amazon Bedrock Converse API. You can config all supported models with this provider.

[This page](https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference.html) explains how to use Bedrock Converse API, and what features it supports.

**Prompt Caching**
[This page](https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-caching.html) shows the supported models and usage.
Please note that the total number of prompt caches should not exceed the limit described in the documentation. Among them: system counts as one, tools counts as one, messagePositions counts as multiple, and the sum of these should not exceed the limit.

It is recommended to use this provider to support Bedrock's large language models.

| Key     | Type      | Required     | Default value | Description |
| ------------- | -------| ------------- | ------------- | ------------- |
| modelId  | string   | Y    |  |   Model id or ARN, See [Bedrock doc](https://docs.aws.amazon.com/bedrock/latest/userguide/model-ids.html)  |
| baseModelId  | string   | N    |  |   Source model id when using an inference profile ARN. This would be the model referenced from the infererence profile |
| regions  | string[] or string   | N     | ["us-east-1"] |   If you have applied and specified multiple regions, then a region will be randomly selected for the call. This feature can effectively alleviate performance bottlenecks.  |
| maxTokens  |  number   | N     | 1024 | The default maximum number of tokens, corresponding to the max_tokens parameter in the standard API. If not specified in the API request, this value will be used.   |
| thinking  |  boolean   | N     | false | Whether to enable the reason/think functionality  |
| thinkBudget  |  number   | N     | 1024 | When thinking is enabled, the maximum number of tokens allowed for the reasoning part |
| promptCache.fields  |  string[]   | N     |  | Where to enable prompt caching, supports three strings: "system", "messages", "tools" |
| promptCache.messagePositions  |  int[]   | N     |  | In multi-turn conversations, you can specify the loading positions for messages caching |

The configuration example:

```json
{
  "modelId": "us.anthropic.claude-3-7-sonnet-20250219-v1:0",
  "regions": [
    "us-east-1"
  ],
  "thinking": true,
  "maxTokens": 32000,
  "promptCache": {
    "fields": [
      "system",
      "messages",
      "tools"
    ],
    "messagePositions": [
      0,
      1
    ]
  },
  "thinkBudget": 2000
}
```

## Output Results

The output adds a reasoning_content field, consistent with deepseek's output. As follows:

```json
data: {"id":"3","created":1740468210,"object":"text_completion","choices":[{"index":0,"delta":{"role":"assistant","content":"","reasoning_content":"hello"},"finish_reason":null,"logprobs":null}],"model":"sonnet37-think"}
...

```
