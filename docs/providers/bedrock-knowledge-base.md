# bedrock-knowledge-base: Bedrock Knowledge Bases

## Create a knowledge base instance

Refer to this document: [Create a knowledge base](https://docs.aws.amazon.com/bedrock/latest/userguide/knowledge-base-create.html)

## Create a custom model

Model Configuration:

```json
{
  "region": "<your-region>",
  "summaryModel": "claude-3-sonnet",
  "knowledgeBaseId": "<your-kb-id>"
}

```

- knowledgeBaseId: the knowledge base id.
- summaryModel: support claude-3-sonnet, claude-3-haiku or claude-3-opus

## API Calls

You can use normal api invoke, the Bedrock connector will pop last message to chat with the knowledge base.

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

## Use BRClient

![kb ui](./screenshots/kb-ui.png)
