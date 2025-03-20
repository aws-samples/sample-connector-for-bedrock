# Cursor

如何在 Cursor 中使用 BRConnector

## Integration

1. 配置 BRConnector URL 和 KEY ，并选择 `claude-3.5-sonnet` 
![[attachments/cursor/IMG-cursor.zh-1.png]]

2. 在 BRConnector 中使用正确的 openai compatibility provider，并创建模型名为`claude-3.5-sonnet`。配置中的 model 可以指定你已有的任何模型，后续我们会再修改这个值。配置参考 [[../../providers/openai-compatible|openai-compatible]]
```
{
  "model": "claude-3-5-sonnet",
  "apiKey": "br-xxx",
  "baseURL": "https://brconnector-url/v1"
}
```

3. 使用 cursor chat 尝试调用，并获得报错内容
![[attachments/cursor/IMG-cursor.zh-3.png]]

从具体报错中获取实际 cursor 访问的 model id：`claude-3-5-sonnet-20241022`
```
Request failed with status code 400: {"success":false,"data":"You do not have permission to access the [claude-3-5-sonnet-20241022] model, please contact the administrator."}
```

4. 再在 BRConnector 中使用 bedrock-converse provider，并创建模型名为`claude-3-5-sonnet-20241022`。配置参考 [[../../providers/bedrock-converse|bedrock-converse]]
```
{
  "modelId": "anthropic.claude-3-5-sonnet-20240620-v1:0"
}
```

5. 修改第2步，配置中 model，改成第4步创建的模型名
```
{
  "model": "claude-3-5-sonnet-20241022",
  "apiKey": "br-xxx",
  "baseURL": "https://brconnector-url/v1"
}
```

6. 尝试 chat 成功
![[attachments/cursor/IMG-cursor.zh-4.png]]


## refer
https://forum.cursor.com/t/are-claude-3-5-sonnet-and-claude-3-5-sonnet-20241022-different/24272




