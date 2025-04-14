# bedrock-knowledge-base

Knowledge Bases for Amazon Bedrock.

## Create a Knowledge Bases for Bedrock instance

Refer to this document: [Create a knowledge base](https://docs.aws.amazon.com/bedrock/latest/userguide/knowledge-base-create.html)

## Model Configuration

There are two ways to configure the knowledge base:

Using Bedrock knowledge base integrated streaming, which requires configuring bedrockModelArn:

```json
{
  "region": "<your-region>",
  "knowledgeBaseId": "<your-kb-id>",
  "bedrockModelArn": "arn:aws:bedrock:us-west-2::foundation-model/anthropic.claude-3-5-sonnet-20241022-v2:0"
}
```

Or retrieving relevant text first, then using a model in BRConnector for summarization, which requires configuring the summaryModel parameter:

```json
{
  "region": "<your-region>",
  "summaryModel": "claude-3-sonnet",
  "knowledgeBaseId": "<your-kb-id>"
}
```

- knowledgeBaseId: the knowledge base id
- summaryModel: supports claude-3-sonnet, claude-3-haiku or claude-3-opus models
- bedrockModelArn: the ARN of the foundation model in the current region, used for integrated streaming

## API Calls

You can use normal API calls. In multi-turn conversations, the Bedrock connector will use the last message to interact with the knowledge base.

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

You can interact with the knowledge base through the BRClient user interface:

![kb ui](./screenshots/kb-ui.png)
