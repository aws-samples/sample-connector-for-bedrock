# azure-openai-image

> 自 Docker 镜像版本 0.0.33 起可用

Azure OpenAI 图像生成接口。

此提供程序允许您使用 Azure OpenAI 的图像生成模型（如具有视觉能力的 GPT-4o）生成图像。它连接到 Azure OpenAI 部署，并通过 Sample Connector for Bedrock 使其可用。

## 配置

通过 Azure OpenAI API 调用图像生成模型。您可以使用此提供程序配置 Azure OpenAI 图像模型部署。

[Azure OpenAI 服务文档](https://learn.microsoft.com/zh-cn/azure/ai-services/openai/) 解释了如何使用 Azure OpenAI API 以及它支持的图像生成功能。

| 键 | 类型 | 必填 | 默认值 | 描述 |
| --- | --- | --- | --- | --- |
| model | string | 是 | | 要使用的图像模型（例如："gpt-image-1"） |
| apiKey | string | 是 | | 您的 Azure OpenAI API 密钥 |
| baseURL | string | 是 | | Azure OpenAI 部署的基础 URL，包括部署名称（例如："<https://your-resource-name.openai.azure.com/openai/deployments/your-deployment-name"）> |
| apiVersion | string | 是 | | 要使用的 Azure OpenAI API 版本（例如："2023-05-15" 或 "2025-01-01-preview"） |

配置示例：

```json
{
  "model": "gpt-image-1",
  "apiKey": "<your-key>",
  "baseURL": "https://your-resource-name.openai.azure.com/openai/deployments/your-deployment-name",
  "apiVersion": "2025-01-01-preview"
}
```

## 输出结果

输出遵循图像生成的标准 OpenAI API 格式：

```json
{
  "created": 1713184000,
  "data": [
    {
      "b64_json": "iV...."
    }
  ]
}
```

## 使用方法

要生成图像，请发送一个包含描述您想要创建的图像的提示的请求。您还可以指定图像大小、质量和风格等参数。

请求示例：

```bash
curl http://localhost:8866/v1/images/generations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ............" \
  -d '{
    "model": "azure-image",
    "prompt": "A cute cate",
    "n": 1,
    "size": "1024x1024"
  }'
```
