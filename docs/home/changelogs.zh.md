# 更新日志

## 0.0.36

1. **支持 anthropic_beta 特性** - 添加了对 anthropic_beta 特性的支持，包括：
   - 兼容 Claude 3.7 Sonnet 的：token-efficient-tools-2025-02-19，output-128k-2025-02-19
   - 兼容 Claude Sonnet 4 的：context-1m-2025-08-07
   
   这些特性直接集成到后台逻辑中，无需单独配置。参考页面：[AWS Bedrock Anthropic Claude 参数](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-anthropic-claude-messages-request-response.html)

2. **Thinking 模式优化** - 在 thinking 模式下，将 content 的内容设置为空字符串，之前是 null。

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

