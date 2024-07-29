# How to Use

You can access BRConnector using the following methods:

- [Direct access to the API](./apis.md)
- [Using Sample Client for Bedrock(BRClient)](./sample-client-for-bedrock.md)
- Using other clients compatible with OpenAI

Currently, there are many OpenAI clients available on the internet, and some clients can set the Host and API key, so you can directly reuse these clients.

For some clients that cannot set the model name, you can work around it in the following way:

Suppose a client has the model name fixed as `xyzllama3`.

In the backend of BRConnector, you just need to set the model name as xyzllama3, set the Provider as bedrock-converse, and in the model configuration, set the modelId to any supported model ID.
