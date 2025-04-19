# 更新日志

## 0.0.29

1. **增强功能：bedrock-converse 提供器现在支持 prompt cache 功能** - 现在可以在提供器后台配置 promptCache 了，请参考文档 <https://aws-samples.github.io/sample-connector-for-bedrock/providers/bedrock-converse/>

2. **增强功能：bedrock-knowledge-base 提供器现在可以直接输出 streaming 内容** - 之前 Bedrock 知识库没有 RetrieveAndGenere 的 streaming 版本，现在这个提供器支持由 Bedrock 知识库直接输出的 streaming 内容了。参考文档：<https://aws-samples.github.io/sample-connector-for-bedrock/providers/bedrock-knowledge-base/>

3. **修复：费用更新的时候同时更新了最新时间** - 现在可以更新用户的 active 日期了，这样可以在 manager 后台看到最新活动的 api-key 了。

4. **Cloudformation 部署脚本更新** - 现在可以选择独立部署 vpc stack，然后再部署 BRConnector；ecs 部署增加了自动创建第一个 api key 的能力。

## 0.0.28

1. **增强功能：流式模式下的 reasoning_content 和 tool_calls** - 在流式（streaming）模式下，现在可以输出 `reasoning_content` 和 `tool_calls` 内容。解决了 [issue #74](https://github.com/aws-samples/sample-connector-for-bedrock/issues/74) 中提到的非流式模式下缺少 reasoning_content 字段的问题。

2. **标准化：OpenAI 格式的函数调用** - 在流式和非流式模式下，函数调用（function calling）现在均适配了 OpenAI 的标准格式，提高了与现有工具和库的兼容性。[文档](../user-manual/apis/#function-calling-tool-use)

3. **改进：费用统计的 total 现在直接修改成了 sql update，不会再出现月消费大于总消费了**

4. **新增：ECS 部署脚本** - 增加了 ECS 部署脚本。

5. **修复：飞书消息重复** - 修复了飞书在 streaming 的情况下重复信息的问题。

## 0.0.27

1. **新提供器：sagemaker-deepseek** - 新增了部署在 SageMaker 上的 DeepSeek R1 模型提供商。该提供商支持带有 Deepseek 风格 `reasoning_content` 的流式输出。目前支持 SageMaker 上的三种部署方法：LMI、JumpStart 和 Bedrock。参考[文档](../providers/sagemaker-deepseek.md)。

## 0.0.26

1. **增强功能：bedrock-converse 工具调用** - bedrock-converse 现在输出 `tool_calls` 内容字段，支持使用 langchain.ChatOpenAI 请求进行工具调用。

2. **改进：一致的消息 ID** - 流式响应现在在单个请求的所有数据块中包含一致的消息 ID。
