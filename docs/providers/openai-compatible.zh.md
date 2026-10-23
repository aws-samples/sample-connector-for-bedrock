# openai-compatible

> 适用于 Docker 镜像版本 0.0.21 及以上

此 Provider 可以将那些已经适配过 OpenAI API 的第三方模型重新配置到 BRConnector 中。

## 配置

```json
{
  "model": "qwen-plus",
  "apiKey": "sk-...",
  "baseURL": "https://some-url/v1"
}
```

| 键名 | 类型 | 是否必填 | 默认值 | 描述 |
|------|------|----------|--------|------|
| baseURL| string | 是 | |   基础 url|
| apiKey | string | 是 |  | api key |
| model | string | 是 |  | 第三方的模型名称 |
| streamUsage | boolean | 否 | true | 流式调用时向上游要求返回 usage（`stream_options.include_usage`），用于计费。只有上游不接受 `stream_options` 时才设为 `false`。 |

## 计费

- 非流式调用按响应里的 `usage` 计费。
- 流式调用会向上游发送 `stream_options: {"include_usage": true}`，除非 `streamUsage` 设为 `false`。流结束后按上游最后一次发来的 usage 计费一次，不论结束原因是什么（`stop`、`tool_calls`、`length` 等）。
- 只有客户端通过 `stream_options.include_usage` 要求了，才会把只含 usage 的数据块（`choices` 为空）转发给客户端。
- 如果流结束时没有 usage（例如设置了 `streamUsage: false`），这次调用按 0 token 记录，并记录一条带模型名称的警告日志。
- 输入 token 按 `price_in` 计，输出 token 按 `price_out` 计。

## 示例
- [[../user-manual/scenarios/cursor.zh|cursor]]

