# 更新日志

## 0.0.44

**升级提示**

- 升级前请先给数据库做快照：这个版本新增了一个 migration（第 9 条）。`AutoUpdateBRConnector` 为 `true` 的 stack（`ec2` 和 `lambda` 计算形态）会在 UTC 00:00 自动拉取新的 `latest` 镜像。
- 把 stack 更新到 0.0.44 的 `quick-build-brconnector.yaml` 模板会改变 UserData：`ec2` 实例会停止并重新启动一次；创建时 `KeepEc2` 为 `false` 的 `lambda` 和 `lambda-web` stack 必须重新创建。见[快速部署](deployment.md#template-updates-of-existing-stacks)中的“已有 stack 的模板更新”一节。
- `lambda-web` stack 现在会在更新 stack 时构建部署包，并在启动时执行 migration（第 2 条），包括从未执行过的 0.0.43 migration，它们会删除已下线 provider 的模型（见 0.0.43）。
- 备选 ECS 模板在更新时会签发新的管理员密钥，请从 SSM 参数 `/brconnector/admin-key-<stack name>` 读取。不能再直连它的 ALB，请使用 `CloudFrontURL`（第 6 条）。
- Lambda@Edge 的 ARN 会变化：请把 `LambdaEdgeVersionArn` 设为新的输出（第 6 条）。
- 图像模型在 config 里设置 `price_per_image` 之前仍然不计费（第 9 条）。
- bedrock-converse 的提示词缓存 token 现在会计费（第 9 条）。
- openai-compatible 和 azure-openai 的流式调用现在会发送 `stream_options`。如果上游或所用的 Azure API 版本不接受它，请在模型 config 里设置 `"streamUsage": false`（第 9 条）。
- Claude Code Web stack：模板更新不会重建后端镜像。要用上第 11 条，请在更新 stack 时修改 `ClaudeCodeWebImageBuildId`（例如从 `1` 改成 `2`），见 [Claude Code Web](../user-manual/scenarios/claude-code-web.md#known-limitations) 中的“已知限制”。

1. **CI** - 现在每个 pull request 都会运行单元测试、构建和模板检查。

2. **lambda-web 更新** - 部署包改由 CodeBuild 构建。更新 stack 时修改 `SourceRepoUrl`、`SourceRef` 或新参数 `WebFnBuildId`，会重新构建部署包，并作为新的 Web Function revision 部署；第一次更新到 0.0.44 模板时也是如此。`SourceRef` 现在也可以是 commit。见 [AutoUpdate](deployment.md#autoupdate)。
   - 构建失败时，更新失败并指出失败的步骤，正在运行的 revision 保持不变。
   - 回滚时会重新构建上一个 `SourceRef`，所以在更新完成之前请保留这个 ref。如果回滚也失败，请执行 `aws cloudformation continue-update-rollback --stack-name <stack name> --resources-to-skip WebFnPackage`。
   - Web Function 现在在启动时自己执行数据库迁移（不再设置 `SKIP_DB_INSTALL`），整个安装过程都在同一个锁内完成。

3. **EC2 启动日志与启动脚本**
   - stack 的 EC2 实例不再把密钥和密码写进启动日志或控制台输出。新建的 stack 把 BRConnector 的启动命令写在仅 root 可读的 `/root/brconnector-run.sh`（权限 0700），每晚的更新执行 `bash /root/brconnector-run.sh latest`。0.0.44 之前创建的 stack 仍按首次启动时记录的命令更新。
   - 模板更新之后，已有 ec2 stack 的每晚更新还会把启动日志和生成的密钥文件改为仅 root 可读。
   - 0.0.44 之前创建的 stack 如果有其他用户能登录实例或读取它的控制台输出，管理员可以轮换 admin key（保存在 SSM 参数 `/brconnector/admin-key-<stack name>`）。见[快速部署](deployment.md#admin-key-before-0-0-44)中的“0.0.44 之前创建的 stack 的 admin key”一节。
   - `PGPassword` 参数改为 NoEcho。

4. **区域** - 所有计算形态现在都可以用在 17 个区域：us-east-1、us-east-2、us-west-1、us-west-2、ca-central-1、sa-east-1、eu-west-1、eu-west-2、eu-west-3、eu-central-1、eu-north-1、ap-northeast-1、ap-northeast-2、ap-northeast-3、ap-southeast-1、ap-southeast-2、ap-south-1。Claude Code Web 需要 AgentCore Runtime，因此不能在 ap-northeast-3 使用。见[快速部署](deployment.md#supported-region)中的“支持的区域”一节。

5. **IAM 角色与安全组**
   - 辅助 EC2 角色、清理函数角色和 lambda 夜间更新角色只保留各自实际调用所需的权限。已移除宽泛的托管策略：ECR、Lambda、ECS、EC2 的 FullAccess，EC2 只读，CloudWatch Logs FullAccess，以及 CodeBuild 管理员。
   - 清理函数只能终止本 stack 的实例。
   - 夜间更新的输出仍然不写入 S3。
   - ECS 负载均衡器的安全组只在 `ecs` 计算形态下创建。

6. **备选 ECS 模板与 Lambda@Edge**
   - 备选 ECS 模板的管理员密钥改用密码学随机源生成（32 位）。更新 stack 会签发新密钥，请用 `aws ssm get-parameter --name /brconnector/admin-key-<stack name> --query Parameter.Value --output text` 读取。输出 `AdminApiKey` 改为 `AdminApiKeyParameter`。
   - 它的 ALB 只允许 CloudFront 访问，并移除了 `LoadBalancerURL` 输出，因此不能再直连 ALB，请使用 `CloudFrontURL`。
   - Lambda@Edge 函数不再记录请求头，运行时升级到 nodejs24.x。它发布新版本 `v2`，ARN 随之变化：请把 BRConnector stack 的 `LambdaEdgeVersionArn` 参数设为新的 `LambdaEdgeVersionArn` 输出。

7. **图片 URL** - 见 [FAQ](faq.md#image-urls)。
   - 聊天请求中的图片 URL 由 BRConnector 所在主机直接下载，不经过 `HTTPS_PROXY` 或 `HTTP_PROXY`，并且只从公网地址下载。每次重定向都会重新检查，最多 3 次。响应的内容类型须为 `image/*`，大小不超过 10 MiB，并在 15 秒内下载完成。
   - 没有直接互联网出口的部署，请以 `data:` URL 向聊天模型发送图片，`data:` URL 不受影响。
   - 其他 URL，以及过去会发送空图片的不支持协议，现在返回 HTTP 400。
   - `source` 含 `s3Location` 的内容块返回 HTTP 400，请内联发送内容。
   - nova-canvas 接受 `http(s)` URL，或指向模型自己的 `s3Bucket` 的 `s3://` URL；被拒绝的图片 URL 返回 HTTP 400。

8. **移除共享密钥接口** - 移除 `/open/get-shared-api-key`，BRClient 入口页不再自动填入密钥，BRClient 用户需自行输入密钥。名为 `__shared-api-key__` 的密钥现在是普通密钥。

9. **计费**
   - bedrock-converse 现在按模型 config 里的 `price_cache_read` 和 `price_cache_write`（按每 token 计；未设置时按 `price_in`）对提示词缓存的读取和写入计费，并计入记录的输入 token。1 小时缓存写入也按 `price_cache_write` 计。自己创建的 converse 模型如果使用提示词缓存，请设置这两个价格。见 [bedrock-converse](../providers/bedrock-converse.md#billing)。
   - migration `2026-10-23-converse-cache-prices.sql` 为 `claude-opus-5-5-chat`、`claude-sonnet-5-5-chat`、`claude-haiku-5-5-chat` 预置模型补上缺少的这两个价格：缓存读取为 `price_in` 的 0.05 倍（Opus 和 Sonnet）或 0.1 倍（Haiku），缓存写入为 1.25 倍。管理员已设置的价格保持不变。
   - openai-compatible 和 azure-openai 的流式调用现在会向上游要求返回 usage，并在流结束后计费一次，不论结束原因。只含 usage 的数据块只转发给要求了它的客户端。上游不接受 `stream_options` 时，可用新的 config 项 `streamUsage: false` 关闭。
   - bedrock-agent 调用现在按 agent trace 里的 token 用量计费。trace 不会发给客户端，也不写入日志。
   - 配置 `bedrockModelArn` 的知识库调用现在按问题、回答和回答所引用的检索结果，以每 4 个字符 1 个 token 估算计费；未被引用的检索结果不计入。
   - painter、nova-canvas 和 azure-openai-image 现在会记录每次图像生成，并按新的 config 项 `price_per_image`（按每张图片计）计费。未设置时价格为 0，请设置它，图像生成才会计费。
   - 充值金额超过两位小数时返回 HTTP 400，充值在同一事务中记录。

10. **飞书机器人** - 飞书机器人现在每个连接器只保留一个 WebSocket 客户端，配置变更或删除时会关闭旧客户端。

11. **Claude Code Web** - `/ping` 现在上报最近一次真实活动的时间，使 AgentCore 空闲超时能够生效；`serve` 将 SIGTERM 传递给服务进程以便正常关闭。已有 stack 要在更新 stack 时修改 `ClaudeCodeWebImageBuildId` 才会用上（见升级提示）。

12. **文档** - 各计算形态的 AutoUpdate、已有 stack 的更新方法，以及 [Claude Code Web](../user-manual/scenarios/claude-code-web.md#web-search) 中的联网搜索预算示例。

13. **依赖** - nodemailer 10.2.1 [#165](https://github.com/aws-samples/sample-connector-for-bedrock/pull/165)、vite 6.4.5 [#166](https://github.com/aws-samples/sample-connector-for-bedrock/pull/166)。Claude Code Web：source-map-js 1.2.2 [#156](https://github.com/aws-samples/sample-connector-for-bedrock/pull/156)、nanoid 3.3.20 [#157](https://github.com/aws-samples/sample-connector-for-bedrock/pull/157)、postcss 8.5.31 [#158](https://github.com/aws-samples/sample-connector-for-bedrock/pull/158)、react-router 和 react-router-dom 7.18.4 [#159](https://github.com/aws-samples/sample-connector-for-bedrock/pull/159)、baseline-browser-mapping 2.11.31 [#160](https://github.com/aws-samples/sample-connector-for-bedrock/pull/160)、browserslist 4.29.4 [#161](https://github.com/aws-samples/sample-connector-for-bedrock/pull/161)、vite 7.3.7（随之引入 esbuild 0.28）[#162](https://github.com/aws-samples/sample-connector-for-bedrock/pull/162)、aiohttp 3.14.4 [#163](https://github.com/aws-samples/sample-connector-for-bedrock/pull/163)、pyjwt 2.15.0 [#167](https://github.com/aws-samples/sample-connector-for-bedrock/pull/167)。

## 0.0.43

**升级警告** - 升级前请先给数据库做快照：这次升级会删除已下线 provider 的模型（第 4 条），并添加预置模型（第 2 条）。`AutoUpdateBRConnector` 为 `true` 的 stack（`ec2` 和 `lambda` 计算形态）会在 UTC 00:00 自动拉取新的 `latest` 镜像。

1. **Claude Code Web** - 在浏览器里使用 Claude Code，由 BRConnector 在 `/cc` 提供，运行在 Amazon Bedrock AgentCore Runtime 上，每个 API key 有自己的 microVM 和 S3 工作区。它的模型调用用该用户的 key 打回 `/v1/messages`，额度和计费照常生效。在 CloudFormation 模板里用 `EnableClaudeCodeWeb` 打开，见 [Claude Code Web](../user-manual/scenarios/claude-code-web.md)。[#155](https://github.com/aws-samples/sample-connector-for-bedrock/pull/155)
   - 用户的 `~/.claude/settings.json` 里没有 `skipWebFetchPreflight` 时，会写入 `"skipWebFetchPreflight": true`；用户自己设置的值会保留。
   - 新参数 `EnableWebSearch` 默认 `true`，更新已有 stack 时也是如此。打开 Claude Code Web、且区域为 us-east-1、us-east-2、us-west-2、eu-west-1、ap-southeast-2 或 ap-northeast-1 时，会创建一个带 Web Search target 的 AgentCore Gateway。只有 Runtime 角色可以调用这个 gateway。
   - 搜索由 AWS 向部署 stack 的账号收费（约每 1,000 次查询 7 美元），不计入 BRConnector 的额度。建议设置 AWS Budgets 告警，或者把 `EnableWebSearch` 设为 `false`。
   - 配置了 gateway 时，Claude Code 内置的 WebSearch 工具会被隐藏。

2. **已有数据库也会获得预置模型** - BRConnector 启动时（`lambda-web` 形态除外，见第 4 条）会执行 `src/scripts/migrations/` 中该数据库还没有执行过的 SQL migration。已有数据库缺少的预置模型会被添加并绑定到 group 1；已经存在的同名模型保持不变。[#153](https://github.com/aws-samples/sample-connector-for-bedrock/pull/153)

3. **预置模型** - bedrock-runtime-openai 新增 7 个 GPT-6、GPT-5.6 预置模型 [#152](https://github.com/aws-samples/sample-connector-for-bedrock/pull/152)。bedrock-converse 新增 `claude-opus-5-5-chat`、`claude-sonnet-5-5-chat`、`claude-haiku-5-5-chat`，NoDB 模式和知识库摘要改用它们。移除 Claude 3.x 预置模型和 NoDB 默认模型，已有的模型保持不变。[#154](https://github.com/aws-samples/sample-connector-for-bedrock/pull/154)

4. **下线的 Provider** - 移除 `aws-executor`、`urls-reader`、`web-miner`，请改用 Claude Code Web（`/cc`）。
   - 升级时的 migration 会删除这些 provider 上的模型，以及它们与 key、group 的绑定。历史记录（threads 和 sessions）会保留。
   - 请求这些 provider 上的模型会返回 HTTP 400，并提示改用 Claude Code Web（`/cc`）。模型删除之后，这类请求会得到通常的模型不存在的回答，引用该模型的 smart-router 规则、`localLlmModel` 和机器人连接器也一样。
   - `lambda-web` 形态不同。更新 stack 不会部署 0.0.43：部署包只在创建 stack 时构建，函数启动时也不执行 migration。要运行 0.0.43，请新建一个 `lambda-web` stack，它的数据库会在创建 stack 时按 0.0.43 初始化。如果要手动把已有数据库升级到最新，请先做快照，再按文件名顺序执行 `src/scripts/migrations/` 中的文件：`2026-10-20-preset-models.sql`、`2026-10-20b-claude-chat-presets.sql`、`2026-10-22-retire-providers.sql`。最后一个文件执行的语句是：

     ```sql
     BEGIN;
     DELETE FROM eiai_key_model WHERE model_id IN (SELECT id FROM eiai_model WHERE provider IN ('aws-executor', 'urls-reader', 'web-miner'));
     DELETE FROM eiai_group_model WHERE model_id IN (SELECT id FROM eiai_model WHERE provider IN ('aws-executor', 'urls-reader', 'web-miner'));
     DELETE FROM eiai_model WHERE provider IN ('aws-executor', 'urls-reader', 'web-miner');
     COMMIT;
     ```

5. **移除模型 id 覆盖** - 模型字符串 `name/<id>` 如果本身不是已配置的模型名称，现在对所有 key 都返回 HTTP 400。飞书机器人、知识库和 smart-router 中包含 `/` 的模型 id，以及 azure-openai 模型，同样如此。请求体里的 `model_id` 字段会被忽略。需要使用某个上游模型 id 时，请为它配置一个模型；配置的模型名称本身可以包含 `/`（见 [FAQ](faq.md#model-wildcard)）。

6. **计费**
   - 超出月度额度的花费现在从余额中扣除。
   - 余额最多因最后几次调用变为负数。之后调用会被拒绝，直到充值，或者到下个月（月度额度大于 0 时）。
   - 扣费是原子操作，充值会加到数据库中保存的余额上。
   - 充值通过缓存在 60 秒内同步到所有实例。
   - key 显示的 `month_fee` 在新月份第一次扣费之前，仍是上个月的值。

7. **Session-Id** - 在所有路由上，超过 128 个字符的 `Session-Id` 都返回 HTTP 400。

8. **用户 API**
   - `/user/model/list` 只返回 `name`、`provider`、`price_in`、`price_out`、`multiple`、`group_name`。
   - `/user/thread/list` 只返回调用者自己的 threads，`limit` 最大为 100（`/admin/thread/list` 也一样）。
   - 会话列表和充值记录列表的 `orderBy` 只接受固定的几个值，其他值按默认顺序排序。

9. **API key 与日志**
   - 新的 API key 使用密码学随机源生成。
   - 除 debug 模式外，日志不再记录 SQL 参数和完整的错误对象。

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

