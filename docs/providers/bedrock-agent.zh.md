# bedrock-agent

> 自 Docker 镜像版本 0.0.33 起可用

Amazon Bedrock Agent 接口。

此提供程序允许您通过 Sample Connector for Bedrock 与 Amazon Bedrock Agents 进行交互。Bedrock Agents 帮助您构建能够通过连接到您的数据源和系统来执行任务的 AI 应用程序。

## 配置

通过 Bedrock API 调用 Amazon Bedrock Agents。您可以使用此提供程序配置您的 Bedrock Agent。

[Amazon Bedrock Agents 文档](https://docs.aws.amazon.com/bedrock/latest/userguide/agents.html) 解释了如何使用 Bedrock Agents 以及它们支持的功能。

注意：当前这是一个 agent 的最简单的调用，后续还有可能升级。

| 键 | 类型 | 必填 | 默认值 | 描述 |
| --- | --- | --- | --- | --- |
| region | string | 是 | | 部署 Bedrock Agent 的 AWS 区域（例如："us-east-1"） |
| agentId | string | 是 | | 您的 Bedrock Agent 的 ID |
| agentAliasId | string | 是 | | 您的 Bedrock Agent 的别名 ID |

配置示例：

```json
{
  "region": "us-east-1",
  "agentId": "XXXXXXXXXX",
  "agentAliasId": "XXXXXXXXXX"
}
```

## 使用示例

以下是使用 Sample Connector for Bedrock 调用 Bedrock Agent 的示例：

```bash
curl http://localhost:8866/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Session-Id: YOUR_SESSION_ID" \
  -d '{
  "model": "hr-agent", 
  "messages": [
    {
      "role": "user",
      "content": "我不知道我的ID啊"
    }
  ]
}'
```

**关于 Session-Id 的说明**：您可以在调用的时候生成一个 Session-Id，保证您在调用过程中使用一致的值即可。在当前实现中，这个提供器只会获取最新的一句用户的输入，所以在这个场景下，无需在 request 输入多轮对话。
