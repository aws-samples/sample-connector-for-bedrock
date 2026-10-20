# bedrock-runtime-anthropic

把 Anthropic Messages 请求透传给 Amazon Bedrock `bedrock-runtime` 上的 Claude 原生端点（`/anthropic/v1/messages`）。适合通过 BRConnector 让 Claude Code 或其他 Anthropic Messages 客户端使用 Bedrock 上的 Claude。`system`、`tools`、`messages` 和 thinking 块都按客户端发送的内容转发，所以提示词缓存和 thinking 签名可以正常工作。

它只提供 `POST /v1/messages`。`POST /v1/chat/completions` 和 `POST /v1/completions` 会返回 HTTP 400，并提示改用 `/v1/messages`。如果要用 OpenAI 风格的 API 访问 Claude，请继续使用 [bedrock-converse](bedrock-converse.md)。

## 参数配置

| Key | Type | Required | Default value | Description |
| --- | --- | --- | --- | --- |
| modelId | string | Y | | Bedrock 模型 id。当前的 Claude 模型只能通过跨区域推理使用，所以请使用推理配置文件 id，例如 `global.anthropic.claude-sonnet-5-5`。 |
| regions | string[] or string | N | `AWS_DEFAULT_REGION`，没有则为 `us-east-1` | 每次尝试选择一个区域。字符串可以用逗号分隔多个区域。 |
| bearerToken | string | N | | Bedrock API key。优先于 `credentials`。 |
| credentials | object[] | N | | `[{ "accessKeyId", "secretAccessKey" }]`。配置多组时每次尝试选一组，重试时换用另一组。 |
| maxRetries | number | N | `3` | 遇到 429、500、502、503、504 响应，或收到响应之前的网络错误，且尚未向客户端输出任何内容时的重试次数。必须是大于等于 0 的整数，其他值一律按 `3` 处理。 |
| price_cache_read | number | N | `price_in` | 提示词缓存读取的单价，**按每 token 计**（不是每百万 token）。 |
| price_cache_write | number | N | `price_in` | 5 分钟提示词缓存写入的单价，**按每 token 计**。 |
| price_cache_write_1h | number | N | `price_cache_write` | 1 小时提示词缓存写入的单价，**按每 token 计**。 |

没有配置 `bearerToken` 或 `credentials` 时，如果设置了环境变量 `AWS_BEARER_TOKEN_BEDROCK` 就使用它，否则使用默认的 AWS 凭证链。

如果设置了 `HTTPS_PROXY` 或 `HTTP_PROXY`，访问 Bedrock 的请求会通过该代理。

## Claude Code 设置

用环境变量让 Claude Code 指向 BRConnector：

```bash
export ANTHROPIC_BASE_URL=https://<your-brconnector-host>
export ANTHROPIC_AUTH_TOKEN=<BRConnector API key>
export ANTHROPIC_DEFAULT_OPUS_MODEL=claude-opus-5-5
export ANTHROPIC_DEFAULT_SONNET_MODEL=claude-sonnet-5-5
export ANTHROPIC_DEFAULT_HAIKU_MODEL=claude-haiku-5-5
# 可选：不让 Claude Code 发送实验性的 beta 标志
export CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1
```

上面的模型名是[预置模型](#预置模型)。如果你自己添加了模型，请使用你在管理后台里起的名字。

### 模型名

Claude Code 根据模型名决定请求的写法。例如 Haiku 4.5 使用 `thinking: enabled` 加 `budget_tokens`，而 4.6 和 5.x 使用 `thinking: adaptive` 加 `output_config.effort`。如果模型名和 `modelId` 不是同一代，Bedrock 会返回 400，例如 `"thinking.type.enabled" is not supported for this model`。

所以模型名请用 Anthropic 的模型 ID，并保证它指向同一代的 `modelId`。请求里只能写模型名：`model` 值里带 `/` 会被拒绝并返回 HTTP 400，发给 Bedrock 的模型 id 始终取自 `modelId`。

## 行为

- 只改写 `model` 字段（换成 Bedrock 模型 id）。`system`、`tools`、`messages` 和 thinking 块都不动。`metadata` 会被删除，因为 Bedrock 会拒绝 Claude Code 发送的 `metadata.user_id`。
- **会话固定。** 请求带有 `session-id` 或 `x-claude-code-session-id` 请求头时，区域和凭证按会话 id 的稳定哈希选定，这样同一个 Claude Code 会话能持续命中同一份提示词缓存。重试时换到下一个区域或凭证。没有会话 id 时随机选择。会话 id 最长 128 个字符，更长的会在调用 Bedrock 之前被拒绝，返回 HTTP 400。
- **Beta。** `anthropic-beta` 的值原样透传，没有白名单。如果 Bedrock 因为某些 beta 值返回 400，Provider 会把这些值去掉，重新发送一次，并在进程重启之前，按 Bedrock `modelId` 记住它们，之后对该模型的请求一开始就不带这些值。去掉之后仍然失败的话，错误原样返回。
- **错误。** `/v1/messages` 上的错误以 Anthropic 格式返回，即 `{"type":"error","error":{"type":"...","message":"..."}}`，HTTP 状态码与之对应。Bedrock 返回了 `retry-after` 响应头时会一并传给客户端。
- **重试。** 限流（429）、500、502、503、504，以及收到响应之前的网络错误，最多重试 `maxRetries` 次。已经向客户端输出内容之后不再重试。每次重试之前会随机等待一段不超过 200 毫秒的时间，这个上限每重试一次翻一倍，最多 2 秒；如果 Bedrock 给了 `retry-after`，就等待它要求的时间，最多 5 秒。
- **流式。** Server-sent events 按 Bedrock 发来的内容原样转发。上游 15 秒没有数据时会发一个 `ping` 事件，避免长时间 thinking 触发空闲超时。客户端离开后不再向它写入任何内容，但仍会把 Bedrock 的流读完并计费。

## 计费

在管理页面里，提示词价格（Price-In）和输出价格（Price-Out）按每百万 token 填写，BRConnector 内部按每 token 保存。三个缓存价格写在模型的 config 里，始终按每 token 计。

> **两类价格的单位不同。** 管理页面里的提示词价格（Price-In）和输出价格（Price-Out）按每**百万** token 填写；config 里的 `price_cache_read`、`price_cache_write` 和 `price_cache_write_1h` 按每 **token** 填写。如果把缓存价格按每百万 token 填写，缓存 token 的费用会多算一百万倍。

一次调用的费用是：

- 输入 token（不含缓存读取和缓存写入的部分）按 `price_in` 计；
- 缓存读取 token 按 `price_cache_read` 计；
- 5 分钟缓存写入 token 按 `price_cache_write` 计；
- 1 小时缓存写入 token 按 `price_cache_write_1h` 计；
- 输出 token 按 `price_out` 计。

记录的输入 token 数等于输入、缓存读取和缓存写入 token 之和。缓存价格缺失、为空或不是有限数字时，视为未配置：缓存读取价或 5 分钟写入价缺失时按 `price_in` 计，1 小时写入价缺失时按 5 分钟写入价计。

对话的每一轮会存一行 thread，其 `whole_prompt` 保存这次请求完整的 `messages`。所以它会随会话增长，总存储量大约随轮数的平方增长。`system` 和 `tools` 不会存储。设置 `PERFORMANCE_MODE=true` 时什么都不存。

## IAM

对推理配置文件，以及它所路由到的基础模型，授予 `bedrock:InvokeModel` 和 `bedrock:InvokeModelWithResponseStream`。使用 Bedrock API key 时，该 key 对应的身份还需要 `bedrock:CallWithBearerToken`。

## 配置示例

```json
{
  "modelId": "global.anthropic.claude-sonnet-5-5",
  "regions": ["us-east-1", "us-west-2"],
  "price_cache_read": 0.0000001,
  "price_cache_write": 0.0000025,
  "price_cache_write_1h": 0.000004
}
```

这个模型在管理页面里把提示词价格（Price-In）填 `2`，输出价格（Price-Out）填 `10`。

## 预置模型

这里的 `claude-*-5-5` 模型只做 `/v1/messages` 透传（Claude Code）。Chat Completions 客户端请使用 [bedrock-converse](bedrock-converse.md) 上的 `claude-*-5-5-chat` 预置模型。

BRConnector 会在这个 provider 上创建下面这些模型（`src/scripts/migrations/2026-10-20-preset-models.sql`）：新数据库安装时创建，已有数据库在升级时补上。新加入的模型会绑定到 group 1（如果该 group 存在）；同名模型已存在时保持不变。价格是 us-east-1 global 按需价格，单位是每 100 万 token。

| 模型名 | `modelId` | 输入 | 输出 | 缓存读 | 缓存写（5 分钟） | 缓存写（1 小时） |
|---|---|---|---|---|---|---|
| `claude-opus-5-5` | `global.anthropic.claude-opus-5-5` | 4.00 | 20.00 | 0.20 | 5.00 | 8.00 |
| `claude-sonnet-5-5` | `global.anthropic.claude-sonnet-5-5` | 2.00 | 10.00 | 0.10 | 2.50 | 4.00 |
| `claude-haiku-5-5` | `global.anthropic.claude-haiku-5-5` | 0.10 | 0.50 | 0.01 | 0.125 | 0.20 |
| `claude-opus-4-8` | `global.anthropic.claude-opus-4-8` | 5.00 | 25.00 | 0.50 | 6.25 | 10.00 |
| `claude-sonnet-4-6` | `global.anthropic.claude-sonnet-4-6` | 3.00 | 15.00 | 0.30 | 3.75 | 6.00 |
| `claude-haiku-4-5` | `global.anthropic.claude-haiku-4-5-20251001-v1:0` | 1.00 | 5.00 | 0.10 | 1.25 | 2.00 |

## 已知限制

- **Haiku 5.5 的长上下文价格。** 输入超过 Haiku 5.5 的长上下文门槛时，Bedrock 按标准价的 5 倍收费，而 BRConnector 仍按标准价计费，所以这类调用会少算钱。价目表没有给出门槛数值。如果你要对外转售 Haiku 5.5，请留意这一点，或避免在它上面使用特别长的提示词。
- **没有 `count_tokens`。** 不提供 token 计数端点，Claude Code 会改用自己的估算值。
- **没有服务端工具。** Bedrock 原生端点对 `web_search` 和 `web_fetch` 返回 400，所以 Claude Code 的 WebSearch 在这个 provider 上不可用。请改用 MCP 搜索工具。
- **请求时长。** 单个请求能运行多久取决于 BRConnector 的部署方式，例如 ALB 的空闲超时，或 Web Functions 的 900 秒上限。如果长时间生成被中断，请在你那一侧调高限制。
- **更换凭证后的 thinking。** Sonnet 5.5 和 Haiku 5.5 会静默丢弃在其他账号下产生的 thinking 块。同一会话内会话固定会一直使用同一份凭证，所以不会发生这种情况。但如果 `credentials` 跨多个 AWS 账号，而重试换到了另一个账号，那一轮之前的 thinking 会被丢掉。请使用同一个账号的凭证，或接受那一轮的损失。
