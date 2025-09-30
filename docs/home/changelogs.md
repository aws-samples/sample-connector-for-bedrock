# Changelogs

## 0.0.37

1. **bedrock-converse Provider Fix** - Fixed an issue with Claude new models: 'The model returned the following errors: temperature and top_p cannot both be specified for this model. Please use only one.'

2. **Frontend Caching Enhancement** - Added 1-month caching for frontend pages served by koa-static-server.

## 0.0.36

1. **anthropic_beta Features Support** - Added support for anthropic_beta features, including:
   - Compatible with Claude 3.7 Sonnet: token-efficient-tools-2025-02-19, output-128k-2025-02-19
   - Compatible with Claude Sonnet 4: context-1m-2025-08-07
   
   These features are automatically integrated into the backend logic without requiring separate configuration. Reference: [AWS Bedrock Anthropic Claude Parameters](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-anthropic-claude-messages-request-response.html)

2. **Thinking Mode Enhancement** - In thinking mode, content is now set to empty string instead of null.

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
