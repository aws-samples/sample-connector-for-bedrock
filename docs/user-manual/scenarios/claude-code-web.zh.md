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

不满足上述组合时，模板的 `Rules` 会在创建任何资源之前拒绝。

打开开关后，stack 还会创建：

- 一个 ECR 仓库，以及一个 CodeBuild 项目：从 `SourceRepoUrl` 的 `SourceRef` 构建后端镜像（arm64），冒烟检查后推送。建 stack 时由一个小的 Lambda 函数启动构建，stack 会等待构建完成；
- AgentCore Runtime；
- 存放工作区的 S3 bucket，删除 stack 时会**保留**；
- Runtime 的 IAM 角色、访问工作区的 IAM 角色，以及挂在 BRConnector 角色上、允许它调用 Runtime 的策略；
- SSM 参数 `/brconnector/<stack 名>/claude-code-web`，BRConnector 从这里读取 Runtime 的配置（`CC_CONFIG_PARAM`）。

stack 输出 `ClaudeCodeWebUrl` 就是访问地址。

模板支持 us-east-1、us-east-2、us-west-1、us-west-2，这四个区域都提供 AgentCore Runtime。`lambda-web` 只能用在提供 Lambda Web Functions 的区域。

### 不用 CloudFormation

如果自己运行 BRConnector，可以给它设置 `CC_CONFIG_PARAM`（一个 SSM 参数的 ARN，参数值是 JSON `{"runtimeArn","workspaceRoleArn","bucket","prefix"}`），或者直接设置环境变量 `CC_RUNTIME_ARN`、`CC_WORKSPACE_ROLE_ARN`、`CC_WORKSPACE_BUCKET`，以及可选的 `CC_WORKSPACE_PREFIX`（默认 `user_data`）。两种都设置时，直接设置的环境变量优先。两种都没有时，`/cc` 返回 404。

## 给用户开通

Claude Code Web 只给普通 API key 使用，admin key 会被拒绝。

key 本身或者它所在的组，至少绑定了一个 [bedrock-runtime-anthropic](../../providers/bedrock-runtime-anthropic.md) provider 的模型，这个 key 才能使用 Claude Code Web。请给 key 或它的组绑定以下模型：

- `ClaudeCodeBackgroundModel`（默认 `claude-haiku-5-5`）。Claude Code 的后台任务用它，用户在页面上选不到，没有绑定的话这些调用会失败。
- `ClaudeCodeDefaultModel`（默认 `claude-sonnet-5-5`），以及希望用户能选的其他 bedrock-runtime-anthropic 模型。页面上的模型列表就是该 key 可用的 bedrock-runtime-anthropic 模型；有 `claude-sonnet-5-5` 时默认选它，没有就选第一个。一个都没有的 key 无法开始会话。

key 的月度额度和余额照常生效。用完时，Claude Code Web 返回 402 和原因。

## 登录

1. 打开 `ClaudeCodeWebUrl`，例如 `https://d111111abcdef8.cloudfront.net/cc/`。
2. 输入自己的 BRConnector API key。页面会用 `/v1/models` 校验它。
3. 第一次请求要启动 microVM，可能要等几十秒。

登出会停止你的 microVM。文件保存在 S3 里，下次登录时会恢复。

## 费用

- **模型 token**：按 BRConnector 里设置的价格计入用户的 key，和其他客户端一样。
- **其他费用**都由部署 stack 的 AWS 账号承担，不计入任何 key：microVM 运行期间的 AgentCore Runtime 计算费用、每次构建镜像的 CodeBuild 时长、工作区的 S3 存储、镜像的 ECR 存储，以及 CloudWatch Logs。每个 key 最多一个 microVM，空闲 15 分钟后停止。
- 删除 stack 时会保留工作区 bucket。不再需要时请手动清空并删除。

## 已知限制

- 只支持在新建 stack 时打开开关。对已有 stack 打开开关不会生效：ec2 修改 UserData 不会重跑 cloud-init，SSM 自动升级重放的仍是第一次启动时的 `docker run` 行。
- microVM 的计算费用算在部署 stack 的账号上，不计入 key 的额度。key 的额度只管模型 token。每个 key 最多一个 microVM，空闲 15 分钟回收。
- ec2 每晚自动把 BRConnector 升级到 `latest`，而 Claude Code Web 后端镜像只在更新 stack 时重建。要重建它，修改 `ClaudeCodeWebImageBuildId`（例如从 `1` 改成 `2`）：镜像会从 `SourceRepoUrl` 的 `SourceRef` 重新构建，`SourceRef` 是分支时会带上新提交，stack 里的其他资源不变。修改 `SourceRepoUrl`、`SourceRef` 或 `BRConnectorVersion` 也会重建镜像，但 BRConnector 本身也会跟着重建，因为它们是 EC2 实例 UserData 的一部分：`ec2` 形态下 BRConnector 实例会停止再启动；`lambda-web` 形态下辅助实例会重新构建部署包（`KeepEc2` 为 `false` 时更新会失败，因为该实例已经自行删除）。BRConnector 和后端之间的约定（invocations 透传和 4 个自定义头）必须保持向后兼容。
- 在上游发布带 `/cc` 的 BRConnector 版本、维护者推送公开镜像之前，`ec2` 和 `ecs` 形态用不了 Claude Code Web。
- `lambda-web` 形态下，单次消息流最长 15 分钟（Lambda 超时 900 秒）；`ec2` 和 `ecs` 下受 AgentCore 同步请求 15 分钟的限制。
- microVM 空闲 15 分钟会被回收。工作区会从 S3 恢复，但终端里正在运行的进程会丢失。
- 用户在自己的 shell 里能看到自己的 key 和自己的 AWS 临时凭证。这些凭证只能访问自己的工作区前缀。shell 也能使用 Runtime 自己的角色，但这个角色只能拉取镜像、写这个 Runtime 的日志、trace 和指标，以及获取这个 Runtime 的 workload access token，没有任何 Bedrock 或 S3 权限。
- 第一次进入要冷启动 microVM，可能要等几十秒。
- 不支持 GitHub OAuth，也不支持 `lambda` 计算形态。
