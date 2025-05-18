
# azure-openai

> 自 Docker 镜像版本 0.0.32 起可用

Azure OpenAI 服务接口。

将消息发送到指定的 Azure OpenAI 模型。此提供程序允许您连接到 Azure OpenAI 部署并通过 Sample Connector for Bedrock 使用它们。

## 配置

通过 Azure OpenAI API 调用模型。您可以使用此提供程序配置 Azure OpenAI 部署。

[Azure OpenAI 服务文档](https://learn.microsoft.com/zh-cn/azure/ai-services/openai/) 解释了如何使用 Azure OpenAI API 以及它支持的功能。

建议使用此提供程序连接到 Azure OpenAI 部署。

| 键 | 类型 | 必填 | 默认值 | 描述 |
| --- | --- | --- | --- | --- |
| apiKey | string | 是 | | 您的 Azure OpenAI API 密钥 |
| baseURL | string | 是 | | Azure OpenAI 部署的基础 URL，包括部署名称（例如："<https://your-resource-name.openai.azure.com/openai/deployments/your-deployment-name"）> |
| apiVersion | string | 是 | | 要使用的 Azure OpenAI API 版本（例如："2023-05-15" 或 "2025-01-01-preview"） |

配置示例：

```json
{
  "apiKey": "<your-key>",
  "baseURL": "https://your-resource-name.openai.azure.com/openai/deployments/your-deployment-name",
  "apiVersion": "2025-01-01-preview"
}
```

## 输出结果

输出遵循标准 OpenAI API 格式：

```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1677858242,
  "model": "gpt-4o",
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "这是来自 Azure OpenAI 模型的响应。"
      },
      "finish_reason": "stop",
      "index": 0
    }
  ],
  "usage": {
    "prompt_tokens": 13,
    "completion_tokens": 7,
    "total_tokens": 20
  }
}
```
