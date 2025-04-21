# Changelogs

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
