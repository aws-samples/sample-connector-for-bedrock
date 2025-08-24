# Changelogs archive

## 0.0.30

1. **Enhancement: Added Think-Budget header support** - Now you can activate thinking mode in API calls by passing a "Think-Budget" header with a value greater than 0 (Do not enable thinking in BRConnector configuration).

2. **New Feature: Custom Attributes for sagemaker-lmi provider** - Added support for passing custom attributes to sagemaker-lmi provider through the header "X-Amzn-Sagemaker-Custom-Attributes". For example: "X-Amzn-Sagemaker-Custom-Attributes: model0:/v1/DELETEions;model2:/xxx".

3. **Fix: Resolved thinkBudget bug in non-thinking mode** - Fixed an issue with thinkBudget when not in thinking mode.

## 0.0.29

1. **Enhancement: bedrock-converse provider now supports prompt cache functionality** - You can now configure promptCache in the provider backend. Please refer to the documentation: <https://aws-samples.github.io/sample-connector-for-bedrock/providers/bedrock-converse/>

2. **Enhancement: bedrock-knowledge-base provider now directly outputs streaming content** - Previously, Bedrock knowledge base didn't have a streaming version of RetrieveAndGenerate. Now this provider supports streaming content directly output from Bedrock knowledge base. Reference documentation: <https://aws-samples.github.io/sample-connector-for-bedrock/providers/bedrock-knowledge-base/>

3. **Fix: Cost updates now also update the latest activity time** - Now the user's active date can be updated, allowing you to see the most recently active API keys in the manager backend.

4. **Cloudformation deployment script update** - Now you can choose to deploy the VPC stack independently, and then deploy BRConnector; ECS deployment adds the ability to automatically create the first API key.

## 0.0.28

1. **Enhancement: Streaming Mode reasoning_content and tool_calls** - In streaming mode, the system now outputs `reasoning_content` and `tool_calls` content. This addresses the issue mentioned in [issue #74](https://github.com/aws-samples/sample-connector-for-bedrock/issues/74) where reasoning_content was missing in non-streaming mode.

2. **Standardization: OpenAI Format for Function Calling** - Function calling in both streaming and non-streaming modes has been adapted to follow OpenAI's standard format, improving compatibility with existing tools and libraries. [Document](../user-manual/apis/#function-calling-tool-use)

3. **Improvement: Cost Statistics Total** - The total in cost statistics is now directly modified using SQL update, preventing monthly consumption from exceeding total consumption.

4. **New: ECS Deployment Script** - Added ECS deployment script.

5. **Fix: Feishu Message Duplication** - Fixed duplicate messages in Feishu when using streaming mode.


## 0.0.27

1. **New Provider: sagemaker-deepseek** - Added a new provider for DeepSeek R1 models deployed on SageMaker. This provider supports streaming output with Deepseek-style `reasoning_content`. Currently supports three deployment methods on SageMaker: LMI, JumpStart, and Bedrock. Refer to [the documentation](../providers/sagemaker-deepseek.md).

## 0.0.26

1. **Enhancement: bedrock-converse Tool Calls** - The bedrock-converse provider now outputs the `tool_calls` content field, supporting tool use with langchain.ChatOpenAI requests.

2. **Improvement: Consistent Message IDs** - Streaming responses now include consistent message IDs across all chunks within a single request.

## 0.0.25

1. **Feature: Claude Sonnet 3.7 Thinking/Reasoning Support** - Added support for thinking/reasoning capabilities with Claude Sonnet 3.7 on the bedrock-converse provider. For more details, refer to [the documentation](../providers/bedrock-converse.md).

2. **Bugfix: Deepseek Format Reasoning Content** - Fixed support for reasoning content in deepseek format within the built-in BRClient.

3. **Standardization: sagemaker-lmi finish_reason Value** - Modified the `finish_reason` value in the sagemaker-lmi provider to consistently return "stop".

## 0.0.24

1. **Bugfix: sagemaker-lmi finish_reason Output** - This update addresses an issue where the `finish_reason` output from the sagemaker-lmi provider was returning an empty string. Now, it will correctly output a non-empty string, providing accurate information about the completion status.

2. **Feature: Display Model Reasoning in BRClient** - Enhanced BRConnector to support and display the `reasoning_content` field from the new API, which shows the model's step-by-step reasoning process. This update allows the frontend to properly recognize and render the model's thought process in a think block format.

## 0.0.23

1. **New Provider: bedrock-deepseek** – Added support for DeepSeek models deployed on Amazon Bedrock. This provider supports Think tags which are rendered as markdown blockquotes in the output. [Detail](../providers/bedrock-deepseek.md).

## 0.0.22

1. **API Update: titan_embeddings** – Updated the embeddings API to follow OpenAI-compatible format. The API now accepts both single string and array inputs through `/v1/embeddings` endpoint. [Detail](../providers/titan_embedings.md).

2. **Function-Calling Format Update:** bedrock-converse – Changed the function-calling arguments parameter type from JSON to string to align with OpenAI's format. Updated all related providers to ensure compatibility.

3. **Auto-login Feature for BRClient:** Added an automatic login mechanism. If a user named `__shared-api-key__` exists in the backend, the `/portal-for-brclient.html` entry point will automatically configure both the URL and key for BRClient. Note: This feature is intended for internal company use only. If `__shared-api-key__` does not exist, only the API URL will be set, and the key must be manually configured in BRClient.

## 0.0.21

1. **New Provider: openai-compatible** – This provider is designed to integrate APIs of models compatible with the OpenAI chat schema (tested with: deepseek, Doudao/Volcano platform, Qwen/Alibaba). [Detail](https://aws-samples.github.io/sample-connector-for-bedrock/providers/openai-compatible/).
2. **New Provider: smart-router** – This provider analyzes the semantics of user input and selects an appropriate model to query.  [Detail](https://aws-samples.github.io/sample-connector-for-bedrock/providers/smart-router/).
3. **New Model Configuration Mechanism**: You can now configure a custom model to adapt to all models provided by a specific model provider. [Detail](https://aws-samples.github.io/sample-connector-for-bedrock/home/faq/#model-wildcard).
4. **Bugfix**: Corrected the cache loading logic, which previously caused a program crash upon the first run of BRConnector.
5. **Headers Value Pass-through in sagemaker-lmi Provider**: Now, values in the headers are URL-encoded and included in the `CustomAttributes` tag of the SageMaker SDK.
6. **BRClient Update to Version 1.2.5**: Key updates include:
   - In AKSK mode, users can now customize the Bedrock endpoint.
   - Fixed a bug where pressing Enter in Chinese input methods would send the message immediately.

## 0.0.20

1. Fixed the representation of boolean types in environment variables. Now only "false" and "0" are considered as false.
2. Added support for nova-canvas in the painter plugin (text-to-image only).
3. Collapsed the display of operation buttons in the API key list.
4. Modified the data type of the index in the output result choices to integer.
5. Added a new Provider: nova-canvas, which allows image manipulation through natural language (including the following tools: text-to-image, image-to-image, foreground replacement/inpaint, background replacement/outpaint, background removal, variations, and color guidance). <https://aws-samples.github.io/sample-connector-for-bedrock/zh/providers/nova-canvas/>

## 0.0.19

1. Fixed a critical bug: log file handles were filling up the system, causing it to become unresponsive after a period of time.
2. Rewrote the logging system, aiming to unify the format as much as possible.

## 0.0.18

1. Added model and API key queries to the backend management web interface.
2. Added configuration for the Amazon Nova models in NoDB mode. As the Nova models are relatively new and only available in certain regions, please note to use them in conjunction with the AWS_DEFAULT_REGION environment variable.
3. The nova model has been added to the initialization script in the database, but it will only take effect in the newly created databases of BRConnector.
4. Fixed a backend error that attempted to save database data even in NoDB mode.
5. Changed the output type of 'id' from number to string during streaming output, now it can be correctly deserialized by aider.
6. Added support for the embedding API, now it can adapt to the titan embeddings model. [You need to configure a new model using the titan_embeddings Provider](../providers/titan_embedings.md), and use the API ([/v1/embeddings](../user-manual/apis.md#embeddings)) to call it.

## 0.0.17

1. When the client actively stops output, the application now actively closes the server-side response.
2. Cost control now works correctly.

## 0.0.16

1. Added a new configuration option for bedrock-converse: maxTokens

## 0.0.15

1. Added haiku 3.5 model in NoDB mode.

2. Removed some unnecessary log outputs.

## 0.0.14

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

## 0.0.12

1. New provider: [urls-reader](https://aws-samples.github.io/sample-connector-for-bedrock/providers/urls-reader/ ), which can parse URLs in user conversations and download the text content from the URLs to add to the conversation context.
2. Optimized the [painter](https://aws-samples.github.io/sample-connector-for-bedrock/providers/painter/) provider, now supporting the Titan image model. The large language model has been changed to BRConnector's local model.
3. It is now possible to delete models, groups, and API Keys in the manager interface.
4. Bug fix: Automatic update script for CloudFormation EC2.
