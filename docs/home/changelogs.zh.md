# 更新日志

## 0.0.42

1. **新增 bedrock-runtime-anthropic Provider** - 面向 Claude Code 等 Anthropic Messages 客户端。`POST /v1/messages` 直接透传到 Bedrock 原生的 `/anthropic/v1/messages`，`system`、`tools`、`thinking`、`cache_control`、`context_management` 原样送达模型。计费覆盖输入、缓存读、5 分钟与 1 小时缓存写入和输出；同一会话固定 region 和凭证，让 prompt cache 持续命中。新库预置 6 个 Claude 模型。[#147](https://github.com/aws-samples/sample-connector-for-bedrock/pull/147)

2. **新增 bedrock-runtime-openai Provider** - 将 OpenAI Chat Completions 请求透传到 Bedrock 的 `/openai/v1/chat/completions`，用于 Kimi K3、GLM 等 OpenAI 格式的模型。新库预置 7 个模型。[#141](https://github.com/aws-samples/sample-connector-for-bedrock/pull/141)

3. **/v1/messages 返回 Anthropic 格式错误** - `/v1/messages` 的错误改为 `{"type":"error","error":{...}}`，状态码与类型对应，例如 401 `authentication_error`、403 `permission_error`，Anthropic SDK 可以直接识别。其他路由不变。[#147](https://github.com/aws-samples/sample-connector-for-bedrock/pull/147)

4. **支持 AWS Lambda Web Functions** - CloudFormation 模板新增 `lambda-web` ComputeType，在 Lambda Web Functions 上运行 BRConnector：无需 adapter、原生流式响应、按活跃 CPU 计费、请求最长 900 秒。endpoint 默认 `IamAuth`，只允许 CloudFront 访问，并且每个请求还要校验回源共享密钥。原有的 `lambda` ComputeType 不变。[#145](https://github.com/aws-samples/sample-connector-for-bedrock/pull/145) [#148](https://github.com/aws-samples/sample-connector-for-bedrock/pull/148)

5. **并发修复：每个请求独立的 Provider 实例** - 并发请求不再共享 provider 状态和模型数据。[#144](https://github.com/aws-samples/sample-connector-for-bedrock/pull/144)

6. **bedrock-converse 修复**
   - 不再向不接受 `temperature`、`top_p` 的 Claude 模型（Opus 4.x 与 Claude 5.x）发送这两个参数；单 region 模型遇到 `ValidationException` 不再重试。[#146](https://github.com/aws-samples/sample-connector-for-bedrock/pull/146)
   - Bedrock API key 和 AK/SK 凭证只作用于各自的模型。[#138](https://github.com/aws-samples/sample-connector-for-bedrock/pull/138)
   - 从 Anthropic 请求体读取 `thinking` 参数。[#122](https://github.com/aws-samples/sample-connector-for-bedrock/pull/122)

7. **BRClient 入口页** - 没有保存 API key 时，自动开启 BRConnector 模式并打开设置页。[#142](https://github.com/aws-samples/sample-connector-for-bedrock/pull/142)

8. **容器以非 root 运行** - 两个 Docker 镜像改为以 `node` 用户运行；健康检查不再依赖 curl（之前容器一直显示 unhealthy）；飞书机器人的临时文件改写到系统临时目录。[#150](https://github.com/aws-samples/sample-connector-for-bedrock/pull/150)

9. **构建与依赖** - `dist/package.json` 不再包含 devDependencies [#140](https://github.com/aws-samples/sample-connector-for-bedrock/pull/140)。依赖升级：[#109](https://github.com/aws-samples/sample-connector-for-bedrock/pull/109) [#110](https://github.com/aws-samples/sample-connector-for-bedrock/pull/110) [#111](https://github.com/aws-samples/sample-connector-for-bedrock/pull/111) [#114](https://github.com/aws-samples/sample-connector-for-bedrock/pull/114) [#115](https://github.com/aws-samples/sample-connector-for-bedrock/pull/115) [#116](https://github.com/aws-samples/sample-connector-for-bedrock/pull/116) [#128](https://github.com/aws-samples/sample-connector-for-bedrock/pull/128) [#132](https://github.com/aws-samples/sample-connector-for-bedrock/pull/132) [#133](https://github.com/aws-samples/sample-connector-for-bedrock/pull/133) [#134](https://github.com/aws-samples/sample-connector-for-bedrock/pull/134) [#135](https://github.com/aws-samples/sample-connector-for-bedrock/pull/135) [#136](https://github.com/aws-samples/sample-connector-for-bedrock/pull/136) [#137](https://github.com/aws-samples/sample-connector-for-bedrock/pull/137) [#143](https://github.com/aws-samples/sample-connector-for-bedrock/pull/143)

升级提示：预置模型只会写入新建的数据库；已有数据库请在管理后台手动添加需要的模型。后台的 Price-In / Price-Out 按每百万 token 填写，模型 config 里的缓存价按每 token 填写。

## 0.0.41

1. **Anthropic Messages API 兼容** - 新增 `POST /v1/messages` 端点，完全兼容 Anthropic Messages API。使用 Anthropic SDK 的客户端无需任何修改即可直接接入。支持 text、tool use、thinking 内容块，以及流式和非流式两种模式。

2. **支持 x-api-key 认证头** - 新增对 `x-api-key` header（Anthropic SDK 默认认证方式）的支持，同时保留原有的 `Authorization: Bearer` 方式。

3. **Bug 修复：claude-opus-4 temperature/topP** - 修复了向 `claude-opus-4` 及更新模型发送已废弃的 `temperature` 和 `topP` 参数导致 `invalid_request_error` 的问题。

4. **构建修复** - 移除了 `vite.config.js` 中硬编码的本地 `kui-vue` 路径别名（导致非作者机器构建失败），将 `vite` 从实验性的 `rolldown-vite` 降级为稳定版 `^6.3.3`。

## 0.0.40

1. **AWS Bedrock Bearer Token 支持** - 新增对 AWS Bedrock API Key（Bearer Token）认证方式的支持，可与传统 AKSK 凭证方式并用。

2. **多工具调用修复** - 修复了流式模式下单次响应包含多个工具调用时处理不正确的问题。

## 0.0.38

1. **Bedrock 应用配置文件支持** - 添加了对 Bedrock 应用配置文件的支持，允许为不同的部署场景提供更好的配置管理。[#87](https://github.com/aws-samples/sample-connector-for-bedrock/issues/87)

2. **PostgreSQL 数据库升级** - 将独立 PostgreSQL 数据库从 16.3 版本升级到 16.10，提升性能和安全性。[#89](https://github.com/aws-samples/sample-connector-for-bedrock/pull/89)

3. **零长度消息修复** - 修复了 Bedrock 在处理零长度消息时失败的问题。[#90](https://github.com/aws-samples/sample-connector-for-bedrock/pull/90)

4. **工具使用增强** - 改进了工具使用功能，修复了相关 bug 并提升了稳定性。[#91](https://github.com/aws-samples/sample-connector-for-bedrock/pull/91) [#92](https://github.com/aws-samples/sample-connector-for-bedrock/pull/92)

5. **常规改进** - 各种 bug 修复和性能优化。

## 0.0.37

1. **bedrock-converse 提供器修复** - 修复了 Claude 新模型的一个问题：'The model returned the following errors: temperature and top_p cannot both be specified for this model. Please use only one.'

2. **前端缓存优化** - 为 koa-static-server 提供的前端页面增加了 1 个月的缓存。


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

