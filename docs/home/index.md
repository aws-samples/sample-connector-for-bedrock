# Introduction

This project is an Amazon Bedrock and other large language model or application forwarding tool. It can manage virtual API Keys, record chat logs, and manage costs.

It is compatible with any OpenAI client that can define a Host and API key.

## Main Features

### Supported Models and Platforms

- Supports all current and future large language models from Bedrock (supported through bedrock-converse).
- Supports models deployed through Sagemaker LMI (partial models).
- Supports other forms of custom models, including Ollama, etc.
- More AI workflow applications, such as internet search, AWS command executors, etc.

### API Key and Cost Management

- Create API keys. Keys can be created for regular users and administrators. Regular users can chat, while administrators can manage API keys and costs.
- Record the cost of each call and use it as a basis for cost control.
- Cost control. You can set monthly quotas and account balances for each API key. When the monthly quota or account balance is insufficient, it cannot be used.
- Calculate the overall cost.

You can customize model prices. [Please refer to the official website for the Bedrock pricing](https://aws.amazon.com/bedrock/pricing).

!!! warning

    The cost calculation of this project cannot be used as the basis for AWS billing. Please refer to the AWS bill for actual expenses.

![api key](docs/screenshots/api-key.png)

### Model Management

Models and their parameters can be defined from the backend. See [Models management](../user-manual/management.md#models)

Once defined, models can be bound to groups or API Keys.

![models bind](docs/screenshots/models-bind.png)
