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

