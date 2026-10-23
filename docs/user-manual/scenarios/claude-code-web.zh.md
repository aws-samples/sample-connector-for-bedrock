---
title: Claude Code Web
---

# Claude Code Web

在浏览器里使用 Claude Code，由 BRConnector 在 `https://<BRConnector 地址>/cc/` 提供。用户用自己的 BRConnector API key 登录，可以对话、浏览文件、使用终端、MCP servers、plugins 和环境变量面板。

## 工作方式

- 浏览器只和 BRConnector 通信。BRConnector 校验 key 之后，用自己的 IAM 角色调用后端。
- 后端（本仓库 [`claude-code-web/`](https://github.com/aws-samples/sample-connector-for-bedrock/tree/main/claude-code-web) 目录里的 fork）跑在 Amazon Bedrock AgentCore Runtime 上。每个 API key 有自己的 microVM。Runtime 只接受 IAM 签名的调用，所以只有 BRConnector 能访问它。
- microVM 里的 Claude Code 每次调用模型，都用该用户的 key 打回 BRConnector 的 `/v1/messages`，额度和计费与其他客户端一样生效。microVM 没有任何 Bedrock 权限，没法绕过 BRConnector。
- 每个 key 在 S3 里有自己的工作区，前缀为 `user_data/brc-key-<补零到 16 位的 key id>/`。交给 microVM 的凭证只能访问这个前缀。
- 会话启动时，如果用户的 `~/.claude/settings.json` 里没有 `skipWebFetchPreflight`，会写入 `"skipWebFetchPreflight": true`，这样 Claude Code 在 WebFetch 之前不会先向 api.anthropic.com 检查域名；用户自己设置的值会保留。
- key 被删除或者额度用完，就不能再使用 Claude Code Web。

## 打开开关

Claude Code Web 包含在 CloudFormation 模板 [quick-build-brconnector.yaml](https://github.com/aws-samples/sample-connector-for-bedrock/raw/main/cloudformation/quick-build-brconnector.yaml) 中（见 [快速部署](../../home/deployment.md)）。请在**新建** stack 时打开开关，原因见下文「已知限制」。

| 参数 | 取值 |
| --- | --- |
| `EnableClaudeCodeWeb` | `true`（默认 `false`） |
| `ComputeType` | `ec2`、`ecs` 或 `lambda-web`。不支持 `lambda`。 |
| `DatabaseMode` | `Standalone`，或者 `ComputeType` 为 `ec2` 时用 `EC2Integrated`。没有数据库就只有 admin key，而 Claude Code Web 不接受 admin key。 |
| `BRConnectorVersion` | `ec2` 和 `ecs` 用的是公开镜像，必须选 `latest`；固定的旧版本里没有 `/cc`。 |
| `ClaudeCodeDefaultModel` | Claude Code 启动时使用的模型，默认 `claude-sonnet-5-5`。 |
| `ClaudeCodeBackgroundModel` | Claude Code 后台任务使用的模型，默认 `claude-haiku-5-5`。 |
| `SourceRepoUrl`、`SourceRef` | 构建后端镜像所用的代码仓库和 ref，其中必须包含 `claude-code-web/` 目录。 |
| `ClaudeCodeWebImageBuildId` | 修改它（例如从 `1` 改成 `2`）只重建后端镜像，不动其他资源，见「已知限制」。默认 `1`。 |
| `EnableWebSearch` | `true`（默认）时同时创建 AgentCore Web Search 的 gateway，见「联网搜索」。`false` 时不创建。 |

不满足上述组合时，模板的 `Rules` 会在创建任何资源之前拒绝。

打开开关后，stack 还会创建：

- 一个 ECR 仓库，以及一个 CodeBuild 项目：从 `SourceRepoUrl` 的 `SourceRef` 构建后端镜像（arm64），冒烟检查后推送。建 stack 时由一个小的 Lambda 函数启动构建，stack 会等待构建完成；
- AgentCore Runtime；
- 存放工作区的 S3 bucket，删除 stack 时会**保留**；
- Runtime 的 IAM 角色、访问工作区的 IAM 角色，以及挂在 BRConnector 角色上、允许它调用 Runtime 的策略；
- SSM 参数 `/brconnector/<stack 名>/claude-code-web`，BRConnector 从这里读取 Runtime 的配置（`CC_CONFIG_PARAM`）；
- `EnableWebSearch` 为 `true` 且所在区域提供 AgentCore Web Search 时：一个带 Web Search connector 的 AgentCore Gateway 及其 IAM 角色，见「联网搜索」。

stack 输出 `ClaudeCodeWebUrl` 就是访问地址。

模板的 `ec2`、`lambda`、`ecs` 可用于 us-east-1、us-east-2、us-west-1、us-west-2、ca-central-1、sa-east-1、eu-west-1、eu-west-2、eu-west-3、eu-central-1、eu-north-1、ap-northeast-1、ap-northeast-2、ap-northeast-3、ap-southeast-1、ap-southeast-2、ap-south-1，`lambda-web` 可用于 us-east-1、us-east-2、us-west-2、ap-northeast-1、eu-west-1（最新列表见 [AWS Capabilities by Region](https://builder.aws.com/build/capabilities)）。Claude Code Web 需要 AgentCore Runtime，除 ap-northeast-3 外这些区域都提供，所以它不能在 ap-northeast-3 运行。AgentCore Web Search 只在「联网搜索」一节列出的区域提供。

### 不用 CloudFormation

如果自己运行 BRConnector，可以给它设置 `CC_CONFIG_PARAM`（一个 SSM 参数的 ARN，参数值是 JSON `{"runtimeArn","workspaceRoleArn","bucket","prefix"}`），或者直接设置环境变量 `CC_RUNTIME_ARN`、`CC_WORKSPACE_ROLE_ARN`、`CC_WORKSPACE_BUCKET`，以及可选的 `CC_WORKSPACE_PREFIX`（默认 `user_data`）。两种都设置时，直接设置的环境变量优先。两种都没有时，`/cc` 返回 404。

## 联网搜索 {#web-search}

`EnableWebSearch` 为 `true`（默认）时，stack 还会创建一个带 [AgentCore Web Search](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-target-connector-web-search-tool.html) connector 的 AgentCore Gateway，供 Claude Code Web 联网搜索：

- 这个 gateway 是一个只接受 SigV4（IAM）调用的 MCP server。它的地址是 stack 输出 `WebSearchGatewayUrl`，Runtime 通过环境变量 `AGENTCORE_WEB_SEARCH_GATEWAY_URL` 拿到它。
- gateway 自己的 IAM 角色只能调用这个 gateway 和 Web Search connector。
- 只有 Runtime 角色可以调用这个 gateway（对它的 ARN 有 `bedrock-agentcore:InvokeGateway` 权限）。Runtime 里的联网搜索 MCP server 用 Runtime 角色给调用签名。访问工作区的角色和每个用户的 session policy 都没有 `bedrock-agentcore` 权限。
- 因此 gateway 的调用记在 Runtime 角色名下，stack 的所有 Claude Code Web 用户都能联网搜索。

AgentCore Web Search 只在 us-east-1、us-east-2、us-west-2、eu-west-1、ap-southeast-2、ap-northeast-1 提供。在其他区域（例如 us-west-1），stack 不会创建这些资源，Claude Code Web 照常可用，只是没有联网搜索。

搜索按每 1,000 次查询 7 美元收费（[价格](https://aws.amazon.com/bedrock/agentcore/pricing/)），**由 AWS 向部署 stack 的账号收费，不计入 key**。搜索不经过 BRConnector，所以不计入 key 的额度和余额。默认每个账号在每个区域每秒最多 10 次搜索，这个配额可以申请调整。不需要联网搜索时，把 `EnableWebSearch` 设为 `false`。

想在花费增长时收到通知，可以针对搜索的用量类型建一个按月的成本预算。下面的例子在达到 50 美元（约 7,000 次查询）的 80 % 时发邮件，请替换 `<account id>` 和邮箱地址：

```sh
aws budgets create-budget --account-id <account id> \
  --budget '{
    "BudgetName": "claude-code-web-web-search",
    "BudgetType": "COST",
    "TimeUnit": "MONTHLY",
    "BudgetLimit": {"Amount": "50", "Unit": "USD"},
    "CostFilters": {
      "Service": ["Amazon Bedrock AgentCore"],
      "UsageType": ["USE1-WebSearchTool:Consumption-based:Queries"]
    }
  }' \
  --notifications-with-subscribers '[{
    "Notification": {"NotificationType": "ACTUAL", "ComparisonOperator": "GREATER_THAN", "Threshold": 80, "ThresholdType": "PERCENTAGE"},
    "Subscribers": [{"SubscriptionType": "EMAIL", "Address": "you@example.com"}]
  }]'
```

`USE1-` 是 us-east-1 的前缀，其他区域有各自的前缀，可用 `aws ce get-dimension-values --dimension USAGE_TYPE --search-string WebSearchTool --time-period Start=<yyyy-mm-01>,End=<today>` 列出。预算只负责提醒，不会停止搜索，BRConnector 的额度也不适用于搜索。

## 给用户开通

Claude Code Web 只给普通 API key 使用，admin key 会被拒绝。

key 本身或者它所在的组，至少绑定了一个 [bedrock-runtime-anthropic](../../providers/bedrock-runtime-anthropic.md) provider 的模型，这个 key 才能使用 Claude Code Web。请给 key 或它的组绑定以下模型：

- `ClaudeCodeBackgroundModel`（默认 `claude-haiku-5-5`）。Claude Code 的后台任务用它，用户在页面上选不到，没有绑定的话这些调用会失败。
- `ClaudeCodeDefaultModel`（默认 `claude-sonnet-5-5`），以及希望用户能选的其他 bedrock-runtime-anthropic 模型。页面上的模型列表就是该 key 可用的 bedrock-runtime-anthropic 模型；有 `claude-sonnet-5-5` 时默认选它，没有就选第一个。一个都没有的 key 无法开始会话。

这些模型在 BRConnector 里的名称必须包含 `claude`（或 `anthropic`），后台模型也一样。后端按名称判断：名称不含这两个词时，它会切换到 LiteLLM 代理模式，而本部署不支持这种模式，会话会失败。

key 的月度额度和余额照常生效。用完时，Claude Code Web 返回 402 和原因。

## 登录

1. 打开 `ClaudeCodeWebUrl`，例如 `https://d111111abcdef8.cloudfront.net/cc/`。
2. 输入自己的 BRConnector API key。页面会用 `/v1/models` 校验它。
3. 第一次请求要启动 microVM，可能要等几十秒。

登出会停止你的 microVM。文件保存在 S3 里，下次登录时会恢复。

## 费用

- **模型 token**：按 BRConnector 里设置的价格计入用户的 key，和其他客户端一样。
- **其他费用**都由部署 stack 的 AWS 账号承担，不计入任何 key：microVM 运行期间的 AgentCore Runtime 计算费用、每次构建镜像的 CodeBuild 时长、工作区的 S3 存储、镜像的 ECR 存储，以及 CloudWatch Logs。每个 key 最多一个 microVM，空闲 15 分钟后停止。
- **联网搜索**（打开时，见「联网搜索」）：每 1,000 次查询 7 美元，同样由账号承担，不计入 key。gateway 上的每次 MCP `tools/list` 和 `tools/call` 还算一次 AgentCore Gateway 调用，每 1,000 次 0.005 美元，也由账号承担，和搜索费用相比可以忽略。
- 打开并处于前台的 `/cc` 页面每 5 秒检查一次后端健康状态；打开的终端即使页面在后台也会持续拉取输出。这些调用都算作活动，所以只要页面开着，microVM 就一直运行，最长到 AgentCore 的 8 小时生命周期上限（之后 AgentCore 会换一个新的）。空闲 15 分钟停止的计时，要等页面关闭、或者页面隐藏且没有打开终端之后才开始。请提醒用户用完后关闭页面或登出。
- 删除 stack 时会保留工作区 bucket。不再需要时请手动清空并删除。

## 已知限制 {#known-limitations}

- 只支持在新建 stack 时打开开关。对已有 stack 打开开关不会生效：ec2 修改 UserData 不会重跑 cloud-init，每晚的 SSM 升级执行的是 `/root/brconnector-run.sh`（0.0.44 之前创建的 stack 重放第一次启动时记录的 `docker run` 行），而这个脚本是实例第一次部署时写下的。
- microVM 的计算费用算在部署 stack 的账号上，不计入 key 的额度。key 的额度只管模型 token。每个 key 最多一个 microVM，空闲 15 分钟回收。
- ec2 每晚自动把 BRConnector 升级到 `latest`，而 Claude Code Web 后端镜像只在更新 stack 时重建。要重建它，修改 `ClaudeCodeWebImageBuildId`（例如从 `1` 改成 `2`）：镜像会从 `SourceRepoUrl` 的 `SourceRef` 重新构建，`SourceRef` 是分支时会带上新提交，stack 里的其他资源不变。修改 `SourceRepoUrl` 或 `SourceRef` 也会重建镜像。`lambda-web` 形态下，更新 stack 还会从同一个仓库和 ref 重新构建 BRConnector 部署包（更新失败时通过重新构建上一个 `SourceRef` 回滚，所以更新完成前请保留它，见 [AutoUpdate](../../home/deployment.md#autoupdate)）。`ec2` 形态下，`SourceRepoUrl` 和 `SourceRef` 不会动实例；修改 `BRConnectorVersion` 会改变 UserData，实例会停止再启动一次。BRConnector 和后端之间的约定（invocations 透传和 4 个自定义头）必须保持向后兼容。
- 在上游发布带 `/cc` 的 BRConnector 版本、维护者推送公开镜像之前，`ec2` 和 `ecs` 形态用不了 Claude Code Web。
- `lambda-web` 形态下，单次消息流最长 15 分钟（Lambda 超时 900 秒）；`ec2` 和 `ecs` 下受 AgentCore 同步请求 15 分钟的限制。
- microVM 空闲 15 分钟会被回收。工作区会从 S3 恢复，但终端里正在运行的进程会丢失。
- microVM 里的 AWS 凭证每次请求都会更新，有效期最长 1 小时。终端以及从终端启动的进程会一直用启动时拿到的凭证，这些凭证会在 15 分钟到 1 小时之后过期，此后访问 S3 等 AWS 服务会报凭证过期。请新开一个终端。
- `/cc` 和 `/manager` 共用 BRConnector 的同一个 origin，两者都把 key 存在浏览器的 localStorage 里，所以一边的页面能读到另一边的 key。尽量不要在使用 `/cc` 的同一个浏览器 profile 里使用 admin key。
- 用户在自己的 shell 里能看到自己的 key 和自己的 AWS 临时凭证。这些凭证只能访问自己的工作区前缀。shell 也能使用 Runtime 自己的角色，但这个角色只能拉取镜像、写这个 Runtime 的日志、trace 和指标、获取这个 Runtime 的 workload access token，以及在打开联网搜索时调用联网搜索 gateway，没有任何 Bedrock 或 S3 权限。因此用户可以在 shell 里直接发起联网搜索，费用由账号承担。
- 第一次进入要冷启动 microVM，可能要等几十秒。
- 不支持 GitHub OAuth，也不支持 `lambda` 计算形态。
