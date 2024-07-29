# ollama

您可以使用 Ollama 部署原生模型。该提供商可以适应 Ollama 的 API。

更多信息,请访问 <https://github.com/ollama/ollama/>。

## 配置

```json
{
  "host": "http://localhost:11434",
  "model": "phi3"
}
```

| Key     | Type      | Required     | Default value | Description |
| ------------- | -------| ------------- | ------------- | ------------- |
| host  | string   | Y    |  |   ollama 部署地址 |
| model | string   | Y    |  |   Model id. 查看 [Ollama 文档](https://ollama.com/library) |
