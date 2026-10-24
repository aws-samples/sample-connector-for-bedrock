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
| price_cache_read  |  number   | N     | `price_in` | Price **per token** (not per million tokens) for prompt-cache reads |
| price_cache_write  |  number   | N     | `price_in` | Price **per token** (not per million tokens) for prompt-cache writes |

Claude preset models on this provider: `claude-opus-5-5-chat`, `claude-sonnet-5-5-chat` and `claude-haiku-5-5-chat` (`modelId` `global.anthropic.claude-<opus|sonnet|haiku>-5-5`, same prices as the matching `claude-*-5-5` presets). Use these for Chat Completions clients. The `claude-*-5-5` presets on [bedrock-runtime-anthropic](bedrock-runtime-anthropic.md) are `/v1/messages` passthrough only, for Claude Code. They are added to existing databases too, by a migration at startup.

New installations no longer create the Claude 3, 3.5 and 3.7 preset models, because Bedrock has retired them. If your database already has them, you can delete them in the manager.

The configuration example:

```json
{
  "modelId": "global.anthropic.claude-sonnet-5-5",
  "regions": [
    "us-east-1"
  ],
  "thinking": true,
  "maxTokens": 32000,
  "price_cache_read": 0.0000001,
  "price_cache_write": 0.0000025,
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

With this model, set `Price-In` to `2` and `Price-Out` to `10` in the admin page.

## Billing

Converse reports the tokens read from and written to the prompt cache apart from the other input tokens. The fee of a call is:

- input tokens (those that were not read from or written to the cache) at `price_in`;
- cache-read tokens at `price_cache_read`;
- cache-write tokens at `price_cache_write`. 1-hour cache writes are billed at this rate too, the same as 5-minute ones;
- output tokens at `price_out`.

The recorded input tokens are the sum of input, cache-read and cache-write tokens.

Set `price_cache_read` and `price_cache_write` on each of your own converse models that uses prompt caching. Without them, its cache tokens bill at `price_in`. A cache price that is missing, blank or not a finite number counts as not set.

For the `claude-opus-5-5-chat`, `claude-sonnet-5-5-chat` and `claude-haiku-5-5-chat` presets, a migration at startup, on a new database and on an upgrade, fills in whichever of the two prices their config does not have, from each model's own `price_in`, at Bedrock's rates for these models:

- a cache read at 0.05 of `price_in` for Opus and Sonnet, and 0.1 for Haiku;
- a cache write at 1.25 of `price_in`.

A price you have set is kept. With the preset prices, these are the same cache prices as the matching `claude-*-5-5` presets on [bedrock-runtime-anthropic](bedrock-runtime-anthropic.md#preset-models).

> **The two kinds of price use different units.** The admin page takes `Price-In` and `Price-Out` per **million** tokens. The config takes `price_cache_read` and `price_cache_write` per **token**. A cache price entered per million tokens, for example `0.1` instead of `0.0000001`, bills cache tokens a million times too much.

## Output Results

The output adds a reasoning_content field, consistent with deepseek's output. As follows:

```json
data: {"id":"3","created":1740468210,"object":"text_completion","choices":[{"index":0,"delta":{"role":"assistant","content":"","reasoning_content":"hello"},"finish_reason":null,"logprobs":null}],"model":"sonnet37-think"}
...

```
