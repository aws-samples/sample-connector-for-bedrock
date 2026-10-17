# bedrock-runtime-openai

把 OpenAI Chat Completions 请求透传给 Amazon Bedrock 的 `bedrock-runtime` 端点（`/openai/v1/chat/completions`）。适用于模型卡上列出 `bedrock-runtime` 支持 Chat Completions 的模型：Kimi、GLM、GPT-5.6 及以后、gpt-oss、DeepSeek、Qwen 和 MiniMax。[这个网址](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-chat-completions.html) 介绍了该 API。

这个 Provider 不支持 Claude。Claude 模型请继续使用 [bedrock-converse](bedrock-converse.md)。

它只提供 `POST /v1/chat/completions`。`POST /v1/messages` 和 `POST /v1/completions` 会返回 HTTP 400。

## 参数配置

| Key | Type | Required | Default value | Description |
| --- | --- | --- | --- | --- |
| modelId | string | Y | | Bedrock 模型 id。对于只能通过跨区域推理使用的模型，请使用模型卡上的推理配置文件 id，例如 `global.moonshotai.kimi-k3` 或 `global.zai.glm-5.3`。 |
| regions | string[] or string | N | `AWS_DEFAULT_REGION`，没有则为 `us-east-1` | 每次尝试随机选择一个区域。字符串可以用逗号分隔多个区域。 |
| bearerToken | string | N | | Bedrock API key。优先于 `credentials`。 |
| credentials | object[] | N | | `[{ "accessKeyId", "secretAccessKey" }]`。配置多组时随机选一组，重试时换用另一组。 |
| maxRetries | number | N | `3` | 遇到 429、500、502、503、504 响应，或收到响应之前的网络错误，且尚未向客户端输出任何内容时的重试次数。必须是大于等于 0 的整数，其他值一律按 `3` 处理。 |
| price_cache_read | number | N | `price_in` | 提示词缓存读取的单价，**按每 token 计**（不是每百万 token）。 |
| price_cache_write | number | N | `price_in` | 提示词缓存写入的单价，**按每 token 计**（不是每百万 token）。 |

没有配置 `bearerToken` 或 `credentials` 时，如果设置了环境变量 `AWS_BEARER_TOKEN_BEDROCK` 就使用它，否则使用默认的 AWS 凭证链。

如果设置了 `HTTPS_PROXY` 或 `HTTP_PROXY`，访问 Bedrock 的请求会通过该代理。

## 行为

- 请求体原样透传，不添加任何默认参数。只有 Bedrock 模型认识的字段，例如 `prompt_cache_options` 和 `prompt_cache_breakpoint`，也会按客户端发送的内容送达 Bedrock。
- 请求里只能写模型名。`name/modelId` 这种写法会被拒绝并返回 HTTP 400，发给 Bedrock 的模型 id 始终取自 `modelId`。
- `Session-Id` 请求头最长 128 个字符。超过的请求会在调用 Bedrock 之前被拒绝，返回 HTTP 400。
- `service_tier` 会被删除，所以请求都按 Standard 档运行。
- 流式请求会自动向 Bedrock 要求返回 usage 用于计费；只有客户端通过 `stream_options.include_usage` 要求了，才会把 usage 转发给客户端。
- 对 Kimi K3 会删除 `top_p`，因为它只接受 0.95。
- 对 GPT-5.6、GPT-6 和 GPT-6.1，`max_tokens` 会改为 `max_completion_tokens` 发送。如果客户端已经发了 `max_completion_tokens`，则保留客户端的值。
- 这两项调整按模型 id 匹配，匹配前会先去掉一个跨区域前缀，例如 `global.` 或 `us.`。当 `modelId` 是应用推理配置文件（application inference profile）的 ARN 时不会生效，因此使用这类模型的客户端必须自己发送该模型接受的参数。
- Bedrock 返回的错误状态码会原样传给客户端，包括 401 和 403，并附带 Bedrock 的错误信息。
- 限流（429）、500、502、503、504，以及收到响应之前的网络错误，最多重试 `maxRetries` 次。每次重试会重新选区域；如果配置了多组 `credentials`，会换用另一组 key。其他错误不重试，已经向客户端输出内容之后也不再重试。
- 每次重试之前会随机等待一段不超过 200 毫秒的时间，这个上限每重试一次翻一倍，最多 2 秒。如果 Bedrock 返回了以秒为单位的 `retry-after` 响应头，就改为等待它要求的时间，最多 5 秒。
- 重试用完仍然是网络错误时，超时返回 HTTP 504，其他情况返回 502。客户端还没收到任何内容时响应就中断了，也返回 502。
- 流式调用中客户端断开时，Provider 不再向它发送数据，但会继续读完 Bedrock 的响应并记录真实用量。这次调用会按完整用量向该 key 计费，与 `bedrock-converse` 一致。这里没有空闲超时，所以被放弃的长时间生成会一直运行到 Bedrock 结束。
- 如果流结束时没有 usage，这次调用按 0 token 计费，并记录一条带 Bedrock 请求 id 的警告日志。

## 价格

在管理页面里，提示词价格（Price-In）和输出价格（Price-Out）按每百万 token 填写，例如 `3` 和 `15`。BRConnector 内部按每 token 保存（`0.000003` 和 `0.000015`）。`price_cache_read` 和 `price_cache_write` 写在模型的 config 里，始终按每 token 计。

> **两类价格的单位不同。** 管理页面里的提示词价格（Price-In）和输出价格（Price-Out）按每**百万** token 填写；config 里的 `price_cache_read` 和 `price_cache_write` 按每 **token** 填写。如果把缓存价格按每百万 token 填写，例如填了 `0.3` 而不是 `0.0000003`，缓存 token 的费用会多算一百万倍。

一次调用的费用是：

- 未缓存的输入 token 按 `price_in` 计。Bedrock 返回的 `prompt_tokens` 已经包含缓存读取和缓存写入的 token，所以未缓存输入等于 `prompt_tokens` 减去缓存读取 token 再减去缓存写入 token；
- 缓存读取 token 按 `price_cache_read` 计；
- 缓存写入 token 按 `price_cache_write` 计；
- 输出 token 按 `price_out` 计。

缓存价格缺失、为空或不是有限数字时，视为未配置，这部分 token 按 `price_in` 计费。

## IAM

对推理配置文件，以及它所路由到的基础模型，授予 `bedrock:InvokeModel` 和 `bedrock:InvokeModelWithResponseStream`，与其他 `bedrock-runtime` 推理一样。使用 Bedrock API key 时，该 key 对应的身份还需要 `bedrock:CallWithBearerToken`。

## 配置示例

Kimi K3。提示词价格（Price-In）填 `3`，输出价格（Price-Out）填 `15`（即每 token `0.000003` 和 `0.000015`）。这是 K3 模型卡上的 Global 跨区域价格；使用 `us.` 配置文件会贵 10%。

```json
{
  "modelId": "global.moonshotai.kimi-k3",
  "regions": ["us-east-1", "us-west-2"],
  "price_cache_read": 0.0000003,
  "price_cache_write": 0.00000375
}
```

GLM 5.3。只对符合条件的账号开放，请联系你的 AWS 账户团队。

```json
{
  "modelId": "global.zai.glm-5.3",
  "regions": ["us-east-1"]
}
```

## 预置模型

新安装会在这个 provider 上创建下面这些模型（`src/scripts/patch-0.0.5.sql`）。已有的数据库不会改动；需要的话请在管理后台自行添加。价格是 us-east-1 按需价格，单位是每 100 万 token。In-Region 的 model id 必须在 BRConnector 调用的 Region 里可用。

| 模型名 | `modelId` | 输入 | 输出 |
|---|---|---|---|
| `kimi-k3` | `global.moonshotai.kimi-k3` | 3.00 | 15.00（缓存读 0.30，缓存写 3.75） |
| `kimi-k2-5` | `moonshotai.kimi-k2.5` | 0.60 | 3.00 |
| `glm-5` | `zai.glm-5` | 1.00 | 3.20 |
| `deepseek-v3-2` | `deepseek.v3.2` | 0.62 | 1.85 |
| `gpt-oss-120b` | `openai.gpt-oss-120b-1:0` | 0.15 | 0.60 |
| `qwen3-coder-next` | `qwen.qwen3-coder-next` | 0.50 | 1.20 |
| `minimax-m2-5` | `minimax.minimax-m2.5` | 0.30 | 1.20 |
| `gpt-6-1-sol` | `global.openai.gpt-6.1-sol` | 2.00 | 10.00（缓存读 0.10，缓存写 2.50） |
| `gpt-6-sol` | `global.openai.gpt-6-sol` | 2.00 | 10.00（缓存读 0.20，缓存写 2.50） |
| `gpt-6-astra` | `global.openai.gpt-6-astra` | 10.00 | 50.00（缓存读 1.00，缓存写 12.50） |
| `gpt-6-luna` | `global.openai.gpt-6-luna` | 0.10 | 0.50（缓存读 0.01，缓存写 0.125） |
| `gpt-5-6-sol` | `global.openai.gpt-5.6-sol` | 4.00 | 20.00（缓存读 0.40，缓存写 5.00） |
| `gpt-5-6-terra` | `global.openai.gpt-5.6-terra` | 2.00 | 12.00（缓存读 0.20，缓存写 2.50） |
| `gpt-5-6-luna` | `global.openai.gpt-5.6-luna` | 0.20 | 1.20（缓存读 0.02，缓存写 0.25） |

GPT 的价格是 Global CRIS、标准档、输入不超过 272K token 时的价格。输入超过 272K token 时，Bedrock 对整个请求按更高的长上下文价格计费（例如 GPT-6 Sol：输入 4.00 而不是 2.00，输出 15.00 而不是 10.00），BRConnector 仍按短上下文价格记账。GPT-5.6 及以后的模型不接受 `max_tokens`，这个 provider 会把它改成 `max_completion_tokens`。
