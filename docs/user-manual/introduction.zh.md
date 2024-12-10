# 如何使用

您可以使用如下的方法来访问 BRConnector。

- [直接访问 API](./apis.md)
- [使用 Sample Client for Bedrock(BRClient)](scenarios/sample-client-for-bedrock.md)
- 使用其他与 OpenAI 兼容的客户端

现在市面上已经有很多 OpenAI 的客户端，有些客户端可以设置 Host 和 API key，您可以直接复用这些客户端。

有部分客户端端无法设置模型的名称，您可以通过如下的方式绕开：

假设某个客户端将模型名字固定为 `xyzllama3`。

在 BRConnector 的后端，您只需要将模型名称设置为 xyzllama3，把 Provider 设置为 bedrock-converse，在模型配置里，将 modelId 设置为任意支持的模型 ID 即可。
