# How to Support Knowledge Bases for Amazon Bedrock

## Create a knowledge base instance

Refer to this document: [Create a knowledge base](https://docs.aws.amazon.com/bedrock/latest/userguide/knowledge-base-create.html)

## Create a custom model in Bedrock connector

Use this API:

```text
POST /admin/model/save-kb-model
Content-Type: application/json
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

{
  "name": "some-custom-model-name",
  "knowledgeBaseId": "your-knowledge-base-id",
  "summaryModel": "claude-3-sonnet",
  "region": "us-west-2"
}
```

- name: an unique name for your custom model.
- knowledgeBaseId: the knowledge base id.
- summaryModel: support claude-3-sonnet, claude-3-haiku or claude-3-opus

## API Calls

You can use normal api invoke, the Bedrock connector will pop last message to chat with the knowledge base.

```text
POST /v1/chat/completions
Content-Type: application/json
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

{
  "model": "some-custom-model-name",
  "messages": [
    {
      "role": "user",
      "content": "how to protect s3 data?"
    }
  ]
}
```
