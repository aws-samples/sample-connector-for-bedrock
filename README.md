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

### 0.0.14

1. Added caching mechanism, with the following details:

- If the system does not configure environment variables PGSQL_HOST or PGSQL_DATABASE, BRConnector will switch to pass-through mode. In this mode, only the ADMIN_API_KEY environment variable can be used to access models, and only built-in static models can be accessed (default LLM models supported by Bedrock Converse; if new models are released in the future, BRConnector code needs to be updated).

- If a database is configured and the PERFORMANCE_MODE environment variable is set, custom models and API Keys configured in the database will take effect. These two parts of data will be loaded directly into memory (up to 2000 entries, refreshed every 1 minute, significantly reducing database access). In this case, BRConnector will only verify if the API Key is valid, without checking if the API Key has permission to access a specific model. It will no longer save conversation records or track and control costs.

2. Fixed a Dify access bug. [Issue #43](https://github.com/aws-samples/sample-connector-for-bedrock/issues/43)

3. For Feishu webhook, added multi-turn dialogue, image recognition, and document recognition features.

4. Added optional configurations for NoDB,  PERFORMANCE_MODE in CloudFormation.

5. Upgraded the aws-lambda-adapter image for Lambda to version 0.8.4. The new adapter version resolves conflicts with the Authorization Header in IAM_Auth for Lambda function URLs.

6. Optimized CloudFormation Output, now showing clear endpoints.

## 0.0.13

1. New Feature: [Introduced a webhook mechanism for easy integration with third-party applications](https://aws-samples.github.io/sample-connector-for-bedrock/zh/user-manual/management/#webhoook).

2. New Webhook: [Feishu, allowing BRConnector integration into Feishu through configuration](https://aws-samples.github.io/sample-connector-for-bedrock/user-manual/feishu-bot/).

3. New Plugin: [continue-coder, enabling BRConnector configuration in Continue for code generation](https://aws-samples.github.io/sample-connector-for-bedrock/zh/providers/continue_coder/).

4. New Models Support: The painter plugin now supports the latest bedrock SD models: `stability.stable-image-core-v1:0`, `stability.sd3-large-v1:0`, and `stability.stable-image-ultra-v1:0`.

5. Deployment Script Upgrade: Added a permission configuration, now correctly calling cross-region model profiles.

6. Improvement: Added an API key query API, allowing precise matching by name, group_id, and role.

7. Improvement: Default model support: Now a model named 'default' can respond to any model name. If not defined, an error message will be output.

8. Refactored parts of the code and added a standard API: `/v1/completions`, to support continue-coder. Currently, only bedrock-coverse and continue-coder have implemented this API.

9. Upgraded the underlying AWS SDK dependency to 3.645.0 and fixed various other bugs.

## Disclaimer

This connector is an open-source software aimed at providing proxy services for using Bedrock services. We make our best efforts to ensure the security and legality of the software, but we are not responsible for the users' behavior.

The connector is intended solely for personal learning and research purposes. Users shall not use it for any illegal activities, including but not limited to hacking, spreading illegal information, etc. Otherwise, users shall bear the corresponding legal responsibilities themselves. Users are responsible for complying with the laws and regulations in their respective jurisdictions and shall not use the connector for any illegal or non-compliant purposes. The developers and maintainers of this software shall not be liable for any disputes, losses, or legal liabilities arising from the use of this connector.

We reserve the right to modify or terminate the connector's code at any time without further notice. Users are expected to understand and comply with the relevant local laws and regulations.

If you have any questions regarding this disclaimer, please feel free to contact us through the open-source channels.

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This library is licensed under the MIT-0 License. See the LICENSE file.
