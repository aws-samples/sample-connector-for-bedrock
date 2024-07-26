---
title: Introduction
---

# Introduction

This is a bedrock API forwarding tool that can issue virtual keys, log chats, and manage costs.

It is compatible with any OPENAI client that can define Host and API Key.


## Key Features

### Models/Platform Support

- A provider for Search Engine support [Since Docker image version 0.0.10]. See [here](./docs/web-miner.md)

- An AWS command executor [Since Docker image version 0.0.10]. See [here](./docs/aws-executor.md)

- Bedrock SDXL [Since Docker image version 0.0.9]. See [Screenshots](docs/painter.md).

- Sagemaker LMI [Since Docker image version 0.0.8]

- Amazon Bedrock Converse API [Since Docker image version 0.0.6]

- Ollama [Since Docker image version 0.0.6]

- Bedrock Knowledge base. See [Instruction](docs/bedrock-knowledge-base.md). [Since Docker image version 0.0.4]

- Mistral, model name options: [Since Docker image version 0.0.2]
  - mistral-7b
  - mistral-large
  - mistral-8x7b
  - mistral-small (region: us-east-1)

- Claude 3, model name options: [Since Docker image version 0.0.1]
  - claude-3-sonnet (this is the default model)
  - claude-3-haiku
  - claude-3-opus

- LLama 3, model name options: [Since Docker image version 0.0.1]
  - llama3-8b
  - llama3-70b

### API Key and Cost Management

- Create API Keys. Can be created for regular users and administrators. Regular users can chat, while administrators can manage API Keys and costs.
- Record the cost of each call and use it as the basis for cost control.
- Cost Control. You can set a monthly quota and account balance for each API Key. When the monthly quota or account balance is insufficient, it cannot be used.
- Calculate the overall cost.

> [!IMPORTANT]  
> You can customize the pricing for your model. [Please refer to the official website for the Bedrock pricing](https://aws.amazon.com/bedrock/pricing).
>
> The cost calculation of this project cannot serve as the billing basis for AWS. Please refer to the AWS bill for actual charges.

![api key](docs/screenshots/api-key.png)

### Model management

Models and their parameters can be defined from the backend.

Model Access Control [Since Docker image version 0.0.6]

- Models can be bound to Groups.

- Models can be bound to API keys.

![models bind](docs/screenshots/models-bind.png)

