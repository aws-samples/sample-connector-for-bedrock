# Changelogs

## 0.0.35

1. **New Provider: gemini** - Added a new Google Gemini provider. Thanks to "daniexon" for the contribution.

2. **Enhancement: Tool Calls for openai_compatible Provider** - The openai_compatible provider now supports passing tool calls to the model. Thanks to "bdavj" for the contribution.

3. **Format Mapping: Bedrock Converse finish_reason** - Mapped Bedrock Converse finish_reason to OpenAI format for improved compatibility.

4. **New Parameter Support: max_completion_tokens** - Added support for the max_completion_tokens parameter.

5. **New Docker Files** - Added two new Dockerfiles.

## 0.0.34

1. **Bug Fixes** - Fixed several minor bugs to improve system stability.

## 0.0.33

1. **New Provider: bedrock-agent** - Added a new provider for Amazon Bedrock Agents. This is a simple implementation that allows you to interact with your Bedrock Agents. [Documentation](../providers/bedrock-agent/)

2. **New Provider: azure-openai-image** - Added support for Azure OpenAI image generation models. [Documentation](../providers/azure-openai-image/)

3. **Removed Providers** - Removed several deprecated providers (bedrock-claude3, bedrock-mistral, bedrock-llama3) as they can be fully replaced by the bedrock-converse provider.

4. **Docker Optimization** - Removed AWS CLI commands from the Docker file to reduce image size.

## 0.0.32

1. **New Provider: azure-openai** - Added a new provider for Azure OpenAI Service. This allows you to connect to Azure OpenAI deployments through the Sample Connector for Bedrock. [Documentation](../providers/azure-openai/)

## 0.0.31

1. **New Feature: Cross-Account Load and Maximum Retry Settings** - Now you can configure cross-account load and maximum retry attempts in the bedrock-converse provider. For more details, [please refer to the documentation](https://aws-samples.github.io/sample-connector-for-bedrock/providers/bedrock-converse/).

2. **Model Updates in BRConnector Deployment** - Added the following models:
   - Cross-region models for Claude 3.5 Sonnet / v2
   - Model for Claude 3.7 Sonnet

3. **CloudFormation Deployment Optimization** - Improved the CloudFormation deployment structure for better clarity and more user-friendly prompts.

4. **Bugfix: Fixed Nested x-amzn-sagemaker-custom-attributes Issue** - Resolved an issue with nested custom attributes in the sagemaker_lmi provider.
