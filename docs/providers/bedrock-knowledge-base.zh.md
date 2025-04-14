# bedrock-knowledge-base

Amazon Bedrock 知识库。

## 创建 Amazon Bedrock 知识库实例

请参考此文档：[创建知识库](https://docs.aws.amazon.com/bedrock/latest/userguide/knowledge-base-create.html)

## 模型配置

配置示例如下：

使用 Bedrock 的一体化（streaming），需要配置 bedrockModelArn。

```json
{
  "region": "<your-region>",
  "knowledgeBaseId": "<your-kb-id>",
  "bedrockModelArn": "arn:aws:bedrock:us-west-2::foundation-model/anthropic.claude-3-5-sonnet-20241022-v2:0"
}
```

或者先检索相关文本，然后使用 BRConnector 中的模型进行总结，需要配置 summaryModel 参数。

```json
{
  "region": "<your-region>",
  "summaryModel": "claude-3-sonnet",
  "knowledgeBaseId": "<your-kb-id>"
}
```

- knowledgeBaseId：知识库 ID
- summaryModel：支持 claude-3-sonnet、claude-3-haiku 或 claude-3-opus 模型
- bedrockModelArn：需要知识库当前 region 的基础模型的 ARN，用于一体化流式处理

## API 调用

您可以使用常规 API 调用，在多轮对话中，Bedrock 连接器将使用最后一条消息与知识库进行交互。

```text
POST /v1/chat/completions
Content-Type: application/json
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

{
  "model": "your-custom-model-name",
  "messages": [
    {
      "role": "user",
      "content": "如何保护 S3 数据？"
    }
  ]
}
```

## 使用 BRClient

您可以通过 BRClient 用户界面与知识库进行交互：

![kb ui](./screenshots/kb-ui.png)
