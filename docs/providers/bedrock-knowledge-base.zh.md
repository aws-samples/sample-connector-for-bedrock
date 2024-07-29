# bedrock-knowledge-base

Bedrock 知识库。

## 创建知识库实例

参考此文档：[创建知识库](https://docs.aws.amazon.com/bedrock/latest/userguide/knowledge-base-create.html)

## 模型定义

配置示例如下：

```json
{
  "region": "<your-region>",
  "summaryModel": "claude-3-sonnet",
  "knowledgeBaseId": "<your-kb-id>"
}

```

- knowledgeBaseId：知识库 ID。
- summaryModel：支持 claude-3-sonnet、claude-3-haiku 或 claude-3-opus

## API 调用

您可以使用常规 api 调用，Bedrock 连接器将弹出最后一条消息以与知识库聊天。

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
