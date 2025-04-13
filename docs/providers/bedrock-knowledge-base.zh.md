# bedrock-knowledge-base

Bedrock 知识库。

## 创建知识库实例

参考此文档：[创建知识库](https://docs.aws.amazon.com/bedrock/latest/userguide/knowledge-base-create.html)

## 模型定义

配置示例如下：

使用 Bedrock 的一体化（steaming），需要配置 bedrockModelArn。

```json
{
  "region": "<your-region>",
  "knowledgeBaseId": "<your-kb-id>",
  "bedrockModelArn": "arn:aws:bedrock:us-west-2::foundation-model/anthropic.claude-3-5-sonnet-20241022-v2:0",
}

```

或者先召回文字，然后使用 BRConnector 中的模型进行总结。

```json
{
  "region": "<your-region>",
  "summaryModel": "sonnet37",
  "knowledgeBaseId": "<your-kb-id>",
}
```

- knowledgeBaseId：知识库 ID。
- summaryModel：支持 claude-3-sonnet、claude-3-haiku 或 claude-3-opus
- bedrockModelArn：需要知识库当前 region 的基础模型的 ARN。

## API 调用

您可以使用常规 api 调用，在多轮对话中，本提供器将使用最后一条消息以与知识库聊天。

```text
POST /v1/chat/completions
Content-Type: application/json
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

{
  "model": "your-custom-model-name",
  "messages": [
    {
      "role": "user",
      "content": "how to protect s3 data?"
    }
  ]
}
```

## 使用 BRClient

![kb ui](./screenshots/kb-ui.png)
