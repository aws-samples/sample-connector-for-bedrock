# 更新日志

## 0.0.35

1. **新提供器：gemini** - 添加了新的 Google Gemini 提供器。感谢 "daniexon" 的贡献。

2. **功能增强：openai_compatible 提供器工具调用** - openai_compatible 提供器现在支持将工具调用传递给模型。感谢 "bdavj" 的贡献。

3. **格式映射：Bedrock Converse finish_reason** - 将 Bedrock Converse 的 finish_reason 映射到 OpenAI 格式，提高兼容性。

4. **新参数支持：max_completion_tokens** - 添加了对 max_completion_tokens 参数的支持。

5. **新增 Docker 文件** - 新增加了两个 Dockerfile。

## 0.0.34

1. **Bug 修复** - 修复了一些小的 bug，提升了系统稳定性。

## 0.0.33

1. **新提供器：bedrock-agent** - 添加了新的 Amazon Bedrock Agents 提供器。这是一个简单的实现，允许您与 Bedrock Agents 进行交互。[文档](../providers/bedrock-agent/)

2. **新提供器：azure-openai-image** - 添加了对 Azure OpenAI 图像生成模型的支持。[文档](../providers/azure-openai-image/)

3. **移除提供器** - 移除了几个过时的提供器（bedrock-claude3、bedrock-mistral、bedrock-llama3），因为它们可以完全由 bedrock-converse 提供器替代。

4. **Docker 优化** - 从 Docker 文件中移除了 AWS CLI 命令，减小了镜像大小。

## 0.0.32

1. **新提供器：azure-openai** - 添加了新的 Azure OpenAI Service 提供器。这允许您通过 Sample Connector for Bedrock 连接到 Azure OpenAI 部署。[文档](../providers/azure-openai/)

## 0.0.31

1. **新功能：跨账号负载和最大尝试次数设置** - 现在可以在 bedrock-converse 提供器中设置跨账号负载和最大尝试次数了。[具体参见相关文档](../providers/bedrock-converse/)。

2. **BRConnector 模型更新** - 新部署的 BRConnector 中增加了如下模型：
   - Claude 3.5 Sonnet / v2 的跨区域模型
   - Claude 3.7 Sonnet 的模型

3. **CloudFormation 部署优化** - 优化了 CloudFormation 部署，现在结构更加清晰，提示更加友好了。

4. **Bugfix：修复嵌套自定义属性问题** - 修复了 sagemaker_lmi 提供器中的 x-amzn-sagemaker-custom-attributes 嵌套问题。
