# continue-coder

> Since Docker image version 0.0.13

本 Provider 可适配 AI 辅助编程插件 [Continue](https://www.continue.dev/) 的[自动完成功能](https://docs.continue.dev/features/tab-autocomplete)。

## 模型配置

```json
{
  "localLlmModel": "claude-3-haiku"
}
```

| Key     | Type      | Required     | Default value | Description |
| ------------- | -------| ------------- | ------------- | ------------- |
| localLlmModel  | string   | Y   |   | 本地模型的名字 |

然后将此模型授权给 组 或者 api key.

## Continue 配置

进入插件配置后，参考如下配置参数：

```json
{
  "tabAutocompleteModel": {
    "title": "Any-title",
    "model": "you-defined-model-name",
    "apiKey": "br-xxxxxxxxxxxx",
    "contextLength": 4000,
    "apiBase": "https://<your-endpoint>/v1/",
    "provider": "openai"
  },
  "tabAutocompleteOptions": {
    "debounceDelay": 3000,
    "multilineCompletions": "always"
  }
}
```

!!!note

    Continue 的自动完成功能如果触发会立即消耗 token，参数 `debounceDelay` 请酌情延长。
