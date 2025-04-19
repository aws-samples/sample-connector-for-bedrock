# Changelogs

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
