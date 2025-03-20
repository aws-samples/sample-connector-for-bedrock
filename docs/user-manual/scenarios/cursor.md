---
title: Cursor
---

# Cursor

How to use BRConnector in Cursor

## Integration

1. Configure BRConnector URL and KEY, and select `claude-3.5-sonnet` 
![[attachments/cursor/IMG-cursor.zh-1.png]]

2. In BRConnector, use the correct openai compatibility provider and create a model named `claude-3.5-sonnet`. In the configuration, you can specify any model you already have; we will modify this value later. For configuration reference, see [[../../providers/openai-compatible|openai-compatible]]
```
{
  "model": "claude-3-5-sonnet",
  "apiKey": "br-xxx",
  "baseURL": "https://brconnector-url/v1"
}
```

3. Try using cursor chat and get the error message
![[attachments/cursor/IMG-cursor.zh-3.png]]

From the specific error message, we obtain the actual model ID accessed by cursor: `claude-3-5-sonnet-20241022`
```
Request failed with status code 400: {"success":false,"data":"You do not have permission to access the [claude-3-5-sonnet-20241022] model, please contact the administrator."}
```

4. Then in BRConnector, use the bedrock-converse provider and create a model named `claude-3-5-sonnet-20241022`. For configuration reference, see [[../../providers/bedrock-converse|bedrock-converse]]
```
{
  "modelId": "anthropic.claude-3-5-sonnet-20240620-v1:0"
}
```

5. Modify the model in step 2's configuration to the model name created in step 4
```
{
  "model": "claude-3-5-sonnet-20241022",
  "apiKey": "br-xxx",
  "baseURL": "https://brconnector-url/v1"
}
```

6. Chat successfully
![[attachments/cursor/IMG-cursor.zh-4.png]]

## Reference
https://forum.cursor.com/t/are-claude-3-5-sonnet-and-claude-3-5-sonnet-20241022-different/24272
