# Changelogs

## 0.0.28

1. **Enhancement: Streaming Mode reasoning_content and tool_calls** - In streaming mode, the system now outputs `reasoning_content` and `tool_calls` content. This addresses the issue mentioned in [issue #74](https://github.com/aws-samples/sample-connector-for-bedrock/issues/74) where reasoning_content was missing in non-streaming mode.

2. **Standardization: OpenAI Format for Function Calling** - Function calling in both streaming and non-streaming modes has been adapted to follow OpenAI's standard format, improving compatibility with existing tools and libraries.

3. **Improvement: Cost Statistics Total** - The total in cost statistics is now directly modified using SQL update, preventing monthly consumption from exceeding total consumption.

4. **New: ECS Deployment Script** - Added ECS deployment script.

5. **Fix: Feishu Message Duplication** - Fixed duplicate messages in Feishu when using streaming mode.

## 0.0.27

1. **New Provider: sagemaker-deepseek** - Added a new provider for DeepSeek R1 models deployed on SageMaker. This provider supports streaming output with Deepseek-style `reasoning_content`. Currently supports three deployment methods on SageMaker: LMI, JumpStart, and Bedrock. Refer to [the documentation](../providers/sagemaker-deepseek.md).

## 0.0.26

1. **Enhancement: bedrock-converse Tool Calls** - The bedrock-converse provider now outputs the `tool_calls` content field, supporting tool use with langchain.ChatOpenAI requests.

2. **Improvement: Consistent Message IDs** - Streaming responses now include consistent message IDs across all chunks within a single request.
