# 介绍

本项目是一个 Amazon Bedrock 以及其他大语言模型或应用的转发工具，他可以管理虚拟 API Key，记录聊天记录，并管理成本。

它与任何可以定义 Host 和 API 密钥的 OpenAI 客户端兼容。

## 主要特性

### 支持的模型和平台

- 支持 Bedrock 现在以及未来的所有大语言模型（通过 bedrock-converse 支持）。

- 支持通过 Sagemaker LMI 部署的模型（部分模型）。

- 支持其他形式的自定义模型，包括：Ollama 等。

- 更多的 AI 流程化的应用，如 互联网搜索，AWS 命令执行器等。

### API Key 和 费用管理

- 创建 API 密钥。可以为普通用户和管理员创建。普通用户可以聊天，而管理员可以管理API密钥和成本。
- 记录每次调用的成本，并将其作为成本控制的依据。
- 成本控制。您可以为每个API密钥设置每月配额和账户余额。当每月配额或账户余额不足时,将无法使用。
- 计算总体成本。

您可以自定义模型价格. [Bedrock 模型的基准价格可以参考官网](https://aws.amazon.com/bedrock/pricing).

!!! warning

    这个项目的成本计算不能作为 AWS 的计费依据。实际支出请参考 AWS 账单。

![api key](docs/screenshots/api-key.png)

### 模型管理

模型及其参数可以从后端定义。参见[创建模型](../user-manual/management.md#models)

定义完成之后，模型可以绑定到组或者 API Key。

![models bind](docs/screenshots/models-bind.png)
