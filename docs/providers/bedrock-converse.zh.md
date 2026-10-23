# bedrock-converse

> Since Docker image version 0.0.6

Amazon Bedrock LLM 统一调用。

将消息发送到指定的 Amazon Bedrock 模型。Converse提供了一个与支持消息的所有模型兼容的统一接口。这允许您只编写一次代码,并将其用于不同的模型。如果某个模型具有独特的推理参数,您也可以将这些独特的参数传递给该模型。

## 参数配置

通过亚马逊Bedrock Converse API调用模型。您可以使用此提供程序配置所有支持的模型。

[这个网址](https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference.html) 解释了如何使用 Bedrock Converse API 以及他支持的特性。

**提示词缓存**

[这个网址](https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-caching.html) 可以看到支持模型和用法。
请注意，总的提示缓存数量不要超出文档中的描述。其中：system 算一个，tools 算一个，messagePositions 的算多个，这些总和不要超出限制。

建议使用这个 Provider 来支持 Bedrock 的大语言模型。

| Key     | Type      | Required     | Default value | Description |
| ------------- | -------| ------------- | ------------- | ------------- |
| modelId  | string   | Y    |  |   Model id, [点这里查看列表](https://docs.aws.amazon.com/bedrock/latest/userguide/model-ids.html)  |
| regions  | string[] or string   | N     | ["us-east-1"] |   如果您已经申请并指定了多个地区,那么将会随机选择一个地区进行调用。这个功能可以有效缓解性能瓶颈。  |
| maxTokens  |  number   | N     | 1024 | 默认最大 tokens 数量，对应标准 API 的 max_tokens 参数。 如果 API 请求中不指定，则使用此值。  |
| thinking  |  boolen   | N     | false | 是否开启 reason/think 功能  |
| thinkBudget  |  number   | N     | 1024 | 在开启 thinking 的情况下，推理部分允许的最大 tokens 数量 |
| promptCache.fields  |  string[]   | N     |  | 在什么位置开启提示词缓存，支持三个字符串："system", "messages", "tools"|
| promptCache.messagePositions  |  int[]   | N     |  |多轮对话中，可以指定 messages 缓存的加载位置 |
| price_cache_read  |  number   | N     | `price_in` | 提示词缓存读取的单价，**按每 token 计**（不是每百万 token） |
| price_cache_write  |  number   | N     | `price_in` | 提示词缓存写入的单价，**按每 token 计**（不是每百万 token） |
| maxRetries  |  number   | N     |  | 当访问 bedrock 出错的时候，会持续尝试，如果存在多组 aksk，则会排除当前的 key 再尝试 |
| credentials  |  object[]   | N     |  | 多组 AKSK 的配置，具体参见下面的配置 |

此 provider 的 Claude 预置模型：`claude-opus-5-5-chat`、`claude-sonnet-5-5-chat`、`claude-haiku-5-5-chat`（`modelId` 为 `global.anthropic.claude-<opus|sonnet|haiku>-5-5`，价格与对应的 `claude-*-5-5` 预置模型相同）。Chat Completions 客户端请用这几个。[bedrock-runtime-anthropic](bedrock-runtime-anthropic.md) 上的 `claude-*-5-5` 预置模型只做 `/v1/messages` 透传，供 Claude Code 使用。已有数据库也会在启动时通过迁移加上它们。

新安装不再创建 Claude 3、3.5 和 3.7 的预置模型，因为 Bedrock 已将它们下线。如果数据库里已有这些模型，可以在管理后台删除。

bedrock-converse 的配置示例如下：

```json
{
  "modelId": "global.anthropic.claude-sonnet-5-5",
  "regions": [
    "us-east-1"
  ],
  "thinking": false,
  "maxTokens": 32000,
  "maxRetries": 3,
  "price_cache_read": 0.0000001,
  "price_cache_write": 0.0000025,
  "credentials": [
    {
      "accessKeyId": "a0",
      "secretAccessKey": "xxx"
    },
    {
      "accessKeyId": "a1",
      "secretAccessKey": "bbb"
    },
    {
      "accessKeyId": "a2",
      "secretAccessKey": "bbb"
    },
    {
      "accessKeyId": "a3",
      "secretAccessKey": "bbb"
    },
    {
      "accessKeyId": "a4",
      "secretAccessKey": "bbb"
    }
  ],
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

使用这个模型时，在管理页面里把提示词价格（Price-In）填 `2`，输出价格（Price-Out）填 `10`。

## 计费

Converse 把从提示词缓存读取和写入缓存的 token 与其他输入 token 分开报告。一次调用的费用是：

- 输入 token（不含缓存读取和缓存写入的部分）按 `price_in` 计；
- 缓存读取 token 按 `price_cache_read` 计；
- 缓存写入 token 按 `price_cache_write` 计。1 小时缓存写入也按这个价格计，与 5 分钟缓存写入相同；
- 输出 token 按 `price_out` 计。

记录的输入 token 数等于输入、缓存读取和缓存写入 token 之和。

自己创建的 converse 模型如果使用提示词缓存，请在 config 里设置 `price_cache_read` 和 `price_cache_write`。不设置时，缓存 token 按 `price_in` 计。缓存价格缺失、为空或不是有限数字时，视为未设置。

对 `claude-opus-5-5-chat`、`claude-sonnet-5-5-chat` 和 `claude-haiku-5-5-chat` 这三个预置模型，新建数据库和升级时，启动时的迁移都会补上 config 里还没有的缓存价格。价格由各模型自己的 `price_in` 按 Bedrock 对这些模型的费率算出：

- 缓存读取：Opus 和 Sonnet 为 `price_in` 的 0.05 倍，Haiku 为 0.1 倍；
- 缓存写入：`price_in` 的 1.25 倍。

已经设置过的价格保持不变。按预置价格算出的缓存价格与 [bedrock-runtime-anthropic](bedrock-runtime-anthropic.md) 预置模型表里对应的 `claude-*-5-5` 模型相同。

> **两类价格的单位不同。** 管理页面里的提示词价格（Price-In）和输出价格（Price-Out）按每**百万** token 填写；config 里的 `price_cache_read` 和 `price_cache_write` 按每 **token** 填写。如果把缓存价格按每百万 token 填写，例如填了 `0.1` 而不是 `0.0000001`，缓存 token 的费用会多算一百万倍。

## 输出结果

输出中增加了 reasoning_content 字段，与 deepseek 的输出保持一致。如下：

```json
data: {"id":"3","created":1740468210,"object":"text_completion","choices":[{"index":0,"delta":{"role":"assistant","content":"","reasoning_content":"你好"},"finish_reason":null,"logprobs":null}],"model":"sonnet37-think"}
...

```
