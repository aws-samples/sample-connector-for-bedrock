# bedrock-agent

> Since Docker image version 0.0.33

Amazon Bedrock Agent Interface.

This provider allows you to interact with Amazon Bedrock Agents through the Sample Connector for Bedrock. Bedrock Agents help you build AI applications that can perform tasks by connecting to your data sources and systems.

## Configuration

Invoke Amazon Bedrock Agents via the Bedrock API. You can configure your Bedrock Agent with this provider.

[Amazon Bedrock Agents documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/agents.html) explains how to use Bedrock Agents and what features they support.

Note: This is currently a simple implementation for agent calling, which may be upgraded with additional features in future versions.

| Key | Type | Required | Default value | Description |
| --- | --- | --- | --- | --- |
| region | string | Y | | AWS region where your Bedrock Agent is deployed (e.g., "us-east-1") |
| agentId | string | Y | | The ID of your Bedrock Agent |
| agentAliasId | string | Y | | The alias ID of your Bedrock Agent |

The configuration example:

```json
{
  "region": "us-east-1",
  "agentId": "XXXXXXXXXX",
  "agentAliasId": "XXXXXXXXXX"
}
```

## Usage Example

Here's an example of how to call a Bedrock Agent using the Sample Connector for Bedrock:

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
      "content": "I don't know my ID"
    }
  ]
}'
```

**Note about Session-Id**: You can generate a session ID when making the call. Just ensure you use a consistent value throughout your interaction session. In the current implementation, this provider only processes the latest user input, so there's no need to include multiple conversation turns in your request.
