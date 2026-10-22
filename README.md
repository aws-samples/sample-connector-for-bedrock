# Sample Connector for Bedrock

This is a Bedrock (and other generative AI tools from AWS) API forwarding tool that can issue virtual keys, log chats, and manage costs.

It is compatible with any OPENAI client or Anthropic client that can define Host and API Key.

## Quick references

[Quick start](https://aws-samples.github.io/sample-connector-for-bedrock/home/quick-start/)

[Quick Deployment](https://aws-samples.github.io/sample-connector-for-bedrock/home/deployment/)

[Providers](https://aws-samples.github.io/sample-connector-for-bedrock/providers/introduction/)

[Claude Code Web](https://aws-samples.github.io/sample-connector-for-bedrock/user-manual/scenarios/claude-code-web/) (optional, Claude Code in the browser at `/cc`)

Docker Image: [DockerHub](https://hub.docker.com/r/cloudbeer/sample-connector-for-bedrock/tags), [Public ECR](https://gallery.ecr.aws/x6u9o2u4/sample-connector-for-bedrock)

Docker Image for Lambda: [DockerHub](https://hub.docker.com/r/cloudbeer/sample-connector-for-bedrock-lambda/tags), [Public ECR](https://gallery.ecr.aws/x6u9o2u4/sample-connector-for-bedrock-lambda)

## Usage with Claude Code

```bash
export ANTHROPIC_BASE_URL=https://your-endpoint
export ANTHROPIC_API_KEY=your-api-key
export ANTHROPIC_MODEL=your-model
```

## Main Features

### Supported Models and Platforms

- Supports all current and future large language models from Bedrock (supported through bedrock-converse).
- Supports models deployed through Sagemaker LMI (partial models).
- Supports other forms of custom models, including Ollama, etc.
- More AI workflow applications, such as Bedrock knowledge bases, Bedrock agents and image generation.

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

## 0.0.42

1. **bedrock-runtime-anthropic Provider** - New provider for Claude Code and other Anthropic Messages clients. `POST /v1/messages` is passed through to Bedrock's native `/anthropic/v1/messages` route, so `system`, `tools`, `thinking`, `cache_control` and `context_management` reach the model unchanged. It bills input, cache read, 5-minute and 1-hour cache writes, and output, and keeps each session on one region and credential so that prompt caching keeps hitting. Six Claude presets are added for new databases. [#147](https://github.com/aws-samples/sample-connector-for-bedrock/pull/147)

2. **bedrock-runtime-openai Provider** - New provider that passes OpenAI Chat Completions requests through to Bedrock's `/openai/v1/chat/completions` route, for OpenAI-format models such as Kimi K3 and GLM. Seven presets are added for new databases. [#141](https://github.com/aws-samples/sample-connector-for-bedrock/pull/141)

3. **Anthropic-format Errors on /v1/messages** - Errors on `/v1/messages` now come back as `{"type":"error","error":{...}}` with a matching status, for example 401 `authentication_error` or 403 `permission_error`, so Anthropic SDK clients can handle them. Other routes are unchanged. [#147](https://github.com/aws-samples/sample-connector-for-bedrock/pull/147)

4. **AWS Lambda Web Functions** - New `lambda-web` ComputeType in the CloudFormation template that runs BRConnector on Lambda Web Functions: no adapter, native response streaming, billing by active CPU, and requests up to 900 seconds. The endpoint defaults to `IamAuth`, so only the CloudFront distribution can reach it, and every request is also checked against a shared origin secret. The existing `lambda` ComputeType is unchanged. [#145](https://github.com/aws-samples/sample-connector-for-bedrock/pull/145) [#148](https://github.com/aws-samples/sample-connector-for-bedrock/pull/148)

5. **Concurrency Fix: One Provider Instance per Request** - Concurrent requests no longer share provider state or model data. [#144](https://github.com/aws-samples/sample-connector-for-bedrock/pull/144)

6. **bedrock-converse Fixes**
   - `temperature` and `top_p` are no longer sent to Claude models that reject them (Opus 4.x and Claude 5.x). A `ValidationException` on a single-region model is no longer retried. [#146](https://github.com/aws-samples/sample-connector-for-bedrock/pull/146)
   - Bedrock API keys and AK/SK credentials are scoped to their own model. [#138](https://github.com/aws-samples/sample-connector-for-bedrock/pull/138)
   - The `thinking` parameter is read from the Anthropic request body. [#122](https://github.com/aws-samples/sample-connector-for-bedrock/pull/122)

7. **BRClient Portal** - With no API key saved, the portal turns on BRConnector mode and opens the settings page. [#142](https://github.com/aws-samples/sample-connector-for-bedrock/pull/142)

8. **Container Runs as Non-root** - Both Docker images now run as the `node` user, the health check no longer depends on curl (the container used to report unhealthy), and the Feishu bot writes its temporary files to the system temp directory. [#150](https://github.com/aws-samples/sample-connector-for-bedrock/pull/150)

9. **Build and Dependencies** - devDependencies are kept out of `dist/package.json` [#140](https://github.com/aws-samples/sample-connector-for-bedrock/pull/140). Dependency updates: [#109](https://github.com/aws-samples/sample-connector-for-bedrock/pull/109) [#110](https://github.com/aws-samples/sample-connector-for-bedrock/pull/110) [#111](https://github.com/aws-samples/sample-connector-for-bedrock/pull/111) [#114](https://github.com/aws-samples/sample-connector-for-bedrock/pull/114) [#115](https://github.com/aws-samples/sample-connector-for-bedrock/pull/115) [#116](https://github.com/aws-samples/sample-connector-for-bedrock/pull/116) [#128](https://github.com/aws-samples/sample-connector-for-bedrock/pull/128) [#132](https://github.com/aws-samples/sample-connector-for-bedrock/pull/132) [#133](https://github.com/aws-samples/sample-connector-for-bedrock/pull/133) [#134](https://github.com/aws-samples/sample-connector-for-bedrock/pull/134) [#135](https://github.com/aws-samples/sample-connector-for-bedrock/pull/135) [#136](https://github.com/aws-samples/sample-connector-for-bedrock/pull/136) [#137](https://github.com/aws-samples/sample-connector-for-bedrock/pull/137) [#143](https://github.com/aws-samples/sample-connector-for-bedrock/pull/143)

Upgrade notes: preset models are inserted only into new databases. On an existing database, add the models you want in the admin UI. Admin Price-In / Price-Out are per 1 million tokens, while the cache prices in a model's config are per token.

## 0.0.41

1. **Anthropic Messages API Compatibility** - Added a new endpoint `POST /v1/messages` that is fully compatible with the Anthropic Messages API. Clients using the Anthropic SDK can now connect directly without modification. Supports text, tool use, thinking content blocks, and both streaming and non-streaming modes.

2. **x-api-key Header Support** - Added support for the `x-api-key` header (Anthropic SDK default) in addition to the existing `Authorization: Bearer` header.

3. **Bug Fix: claude-opus-4 temperature/topP** - Removed deprecated `temperature` and `topP` parameters for `claude-opus-4` and later models.

4. **Build Fix** - Removed hardcoded local path alias for `kui-vue` in `vite.config.js`. Downgraded `vite` from experimental `rolldown-vite` to stable `^6.3.3`.

## 0.0.40

1. **AWS Bedrock Bearer Token Support** - Added support for AWS Bedrock API Key (Bearer Token) authentication in addition to traditional AKSK credentials.

2. **Multi-tool Call Fix** - Fixed an issue where multiple tool calls in a single response were not handled correctly in streaming mode.

[More changelogs](https://aws-samples.github.io/sample-connector-for-bedrock/home/changelogs/)

## Disclaimer

This connector is an open-source software aimed at providing proxy services for using Bedrock services. We make our best efforts to ensure the security and legality of the software, but we are not responsible for the users' behavior.

The connector is intended solely for personal learning and research purposes. Users shall not use it for any illegal activities, including but not limited to hacking, spreading illegal information, etc. Otherwise, users shall bear the corresponding legal responsibilities themselves. Users are responsible for complying with the laws and regulations in their respective jurisdictions and shall not use the connector for any illegal or non-compliant purposes. The developers and maintainers of this software shall not be liable for any disputes, losses, or legal liabilities arising from the use of this connector.

We reserve the right to modify or terminate the connector's code at any time without further notice. Users are expected to understand and comply with the relevant local laws and regulations.

If you have any questions regarding this disclaimer, please feel free to contact us through the open-source channels.

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This library is licensed under the MIT-0 License. See the LICENSE file.
