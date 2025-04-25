# 更新日志

## 0.0.31

1. **新功能：跨账号负载和最大尝试次数设置** - 现在可以在 bedrock-converse 提供器中设置跨账号负载和最大尝试次数了。具体参见相关文档。

2. **BRConnector 模型更新** - 新部署的 BRConnector 中增加了如下模型：
   - Claude 3.5 Sonnet / v2 的跨区域模型
   - Claude 3.7 Sonnet 的模型

3. **CloudFormation 部署优化** - 优化了 CloudFormation 部署，现在结构更加清晰，提示更加友好了。

4. **Bugfix：修复嵌套自定义属性问题** - 修复了 sagemaker_lmi 提供器中的 x-amzn-sagemaker-custom-attributes 嵌套问题。

## 0.0.30

1. **增强功能：添加 Think-Budget 动态支持** - 现在可以在 HTTP header 中指定 "Think-Budget"（值大于0）激活 API 动态调用思考模式（后端不要配置启用 thinking）。

2. **新功能：sagemaker-lmi 提供器的自定义属性** - 添加了通过 header "X-Amzn-Sagemaker-Custom-Attributes" 向 sagemaker-lmi 提供器传递自定义属性的支持。例如："X-Amzn-Sagemaker-Custom-Attributes: model0:/v1/DELETEions;model2:/xxx"。这个更新修复了之前把所有 headers 信息透传给 SageMaker 时，Custom-Attributes 最大长度超过 1024 的问题，注意：当前 X-Amzn-Sagemaker-Custom-Attributes 的最大长度仍然不能超过 1024 个字符。

3. **修复：解决了非思考模式下的 thinkBudget bug** - 修复了在非思考模式下与 thinkBudget 相关的问题。

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
