# Sample Connector for Bedrock

This is a Bedrock (and other generative AI tools from AWS) API forwarding tool that can issue virtual keys, log chats, and manage costs.

It is compatible with any OPENAI client that can define Host and API Key.

## Quick references

[Quick start](https://aws-samples.github.io/sample-connector-for-bedrock/home/quick-start/)

[Quick Deployment](https://aws-samples.github.io/sample-connector-for-bedrock/home/deployment/)

[Providers](https://aws-samples.github.io/sample-connector-for-bedrock/providers/introduction/)

Docker Image: [DockerHub](https://hub.docker.com/r/cloudbeer/sample-connector-for-bedrock/tags), [Public ECR](https://gallery.ecr.aws/x6u9o2u4/sample-connector-for-bedrock)

Docker Image for Lambda: [DockerHub](https://hub.docker.com/r/cloudbeer/sample-connector-for-bedrock-lambda/tags), [Public ECR](https://gallery.ecr.aws/x6u9o2u4/sample-connector-for-bedrock-lambda)

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

> [!IMPORTANT]  
>
> The cost calculation of this project cannot be used as the basis for AWS billing. Please refer to the AWS bill for actual expenses. [Please refer to the official website for the Bedrock pricing](https://aws.amazon.com/bedrock/pricing).

### Model Management

Models and their parameters can be defined from the backend.

Once defined, models can be bound to groups or API Keys.

## Changelogs

## 0.0.24

1. **Bugfix: sagemaker-lmi finish_reason Output** - This update addresses an issue where the `finish_reason` output from the sagemaker-lmi provider was returning an empty string. Now, it will correctly output a non-empty string, providing accurate information about the completion status.

2. **Feature: Display Model Reasoning in BRClient** - Enhanced BRConnector to support and display the `reasoning_content` field from the new API, which shows the model's step-by-step reasoning process. This update allows the frontend to properly recognize and render the model's thought process in a think block format.


## 0.0.23

1. **New Provider: bedrock-deepseek** – Added support for DeepSeek models deployed on Amazon Bedrock. This provider supports Think tags which are rendered as markdown blockquotes in the output. [Detail](../providers/bedrock-deepseek.md).


## Disclaimer

This connector is an open-source software aimed at providing proxy services for using Bedrock services. We make our best efforts to ensure the security and legality of the software, but we are not responsible for the users' behavior.

The connector is intended solely for personal learning and research purposes. Users shall not use it for any illegal activities, including but not limited to hacking, spreading illegal information, etc. Otherwise, users shall bear the corresponding legal responsibilities themselves. Users are responsible for complying with the laws and regulations in their respective jurisdictions and shall not use the connector for any illegal or non-compliant purposes. The developers and maintainers of this software shall not be liable for any disputes, losses, or legal liabilities arising from the use of this connector.

We reserve the right to modify or terminate the connector's code at any time without further notice. Users are expected to understand and comply with the relevant local laws and regulations.

If you have any questions regarding this disclaimer, please feel free to contact us through the open-source channels.

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This library is licensed under the MIT-0 License. See the LICENSE file.
