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
  "bedrockModelArn": "arn:aws:bedrock:us-west-2:<account-id>:inference-profile/global.anthropic.claude-sonnet-5-5"
}
```

或者先检索相关文本，然后使用 BRConnector 中的模型进行总结，需要配置 summaryModel 参数。

```json
{
  "region": "<your-region>",
  "summaryModel": "claude-sonnet-5-5-chat",
  "knowledgeBaseId": "<your-kb-id>"
}
```

- knowledgeBaseId：知识库 ID
- summaryModel：支持 claude-sonnet-5-5-chat、claude-haiku-5-5-chat 或 claude-opus-5-5-chat 模型
- bedrockModelArn：需要知识库当前 region 的基础模型或推理配置文件（inference profile）的 ARN，用于一体化流式处理

## 计费

- 配置 `bedrockModelArn` 时，RetrieveAndGenerate 不报告 token 用量，所以 token 数是按每 4 个字符 1 个 token 算出的**估算值**：输入按问题和回答所引用的每个检索结果的文本计算，输出按回答计算。费用按这个知识库模型的 `price_in` 和 `price_out` 计，所以请把它们设为 `bedrockModelArn` 所指模型的价格。
- 配置 `summaryModel` 时，总结调用按 Converse 报告的 token 数计费（包括提示词缓存 token），价格用这个知识库模型的价格，与 [bedrock-converse](bedrock-converse.md) 相同。

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
