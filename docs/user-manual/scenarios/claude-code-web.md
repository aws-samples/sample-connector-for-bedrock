---
title: Claude Code Web
---

# Claude Code Web

Claude Code in the browser, served by BRConnector at `https://<BRConnector URL>/cc/`. Users sign in with their own BRConnector API key and get chat, a file browser, a terminal, MCP servers, plugins and an environment variables panel.

## How it works

- The browser talks only to BRConnector. BRConnector checks the key, then calls the backend with its own IAM role.
- The backend (the fork in [`claude-code-web/`](https://github.com/aws-samples/sample-connector-for-bedrock/tree/main/claude-code-web)) runs on Amazon Bedrock AgentCore Runtime. Each API key gets its own microVM, and the runtime accepts IAM-signed calls only, so nothing but BRConnector can reach it.
- Claude Code in the microVM sends every model call back to BRConnector's `/v1/messages` with the user's key, so quotas and billing work as for any other client. The microVM has no Bedrock permission and cannot go around BRConnector.
- Each key has its own workspace in S3, under `user_data/brc-key-<key id, 16 digits>/`. The credentials handed to a microVM can reach only that prefix.
- When a session starts, `"skipWebFetchPreflight": true` is written to the user's `~/.claude/settings.json` if the key is missing, so Claude Code does not first check each WebFetch domain with api.anthropic.com; a value the user has set is kept.
- When a key is deleted or its quota runs out, it can no longer use Claude Code Web.

## Turn it on

Claude Code Web is part of the CloudFormation template [quick-build-brconnector.yaml](https://github.com/aws-samples/sample-connector-for-bedrock/raw/main/cloudformation/quick-build-brconnector.yaml) (see [Quick Deployment](../../home/deployment.md)). Turn it on when you **create** the stack; see [Known limitations](#known-limitations).

| Parameter | Value |
| --- | --- |
| `EnableClaudeCodeWeb` | `true` (default `false`) |
| `ComputeType` | `ec2`, `ecs` or `lambda-web`. `lambda` is not supported. |
| `DatabaseMode` | `Standalone`, or `EC2Integrated` with `ComputeType` `ec2`. Without a database only the admin key exists, and Claude Code Web refuses the admin key. |
| `BRConnectorVersion` | `latest` with `ec2` and `ecs`, which run the published image; the pinned versions predate `/cc`. |
| `ClaudeCodeDefaultModel` | Model Claude Code starts with, default `claude-sonnet-5-5`. |
| `ClaudeCodeBackgroundModel` | Model Claude Code uses for background tasks, default `claude-haiku-5-5`. |
| `SourceRepoUrl`, `SourceRef` | Repository and ref the backend image is built from. They must contain the `claude-code-web/` directory. |
| `ClaudeCodeWebImageBuildId` | Change it (for example from `1` to `2`) to rebuild the backend image and nothing else; see [Known limitations](#known-limitations). Default `1`. |
| `EnableWebSearch` | `true` (default) also creates the AgentCore Web Search gateway; see [Web search](#web-search). `false` leaves it out. |

The template's `Rules` reject any other combination before anything is created.

With the switch on, the stack also creates:

- an ECR repository, and a CodeBuild project that builds the backend image (arm64) from `SourceRepoUrl` at `SourceRef`, smoke-tests it and pushes it; a small Lambda function starts the build during stack creation, and the stack waits for it;
- the AgentCore Runtime;
- an S3 bucket for the workspaces, which is **kept** when the stack is deleted;
- an IAM role for the runtime, an IAM role for workspace access, and a policy on BRConnector's role that lets it call the runtime;
- the SSM parameter `/brconnector/<stack name>/claude-code-web`, from which BRConnector reads the runtime settings (`CC_CONFIG_PARAM`);
- with `EnableWebSearch` `true`, in a Region with AgentCore Web Search: an AgentCore Gateway with the Web Search connector, and its IAM role; see [Web search](#web-search).

The stack output `ClaudeCodeWebUrl` is the address to open.

The template works in us-east-1, us-east-2, us-west-1, us-west-2, ca-central-1, sa-east-1, eu-west-1, eu-west-2, eu-west-3, eu-central-1, eu-north-1, ap-northeast-1, ap-northeast-2, ap-northeast-3, ap-southeast-1, ap-southeast-2 and ap-south-1. Claude Code Web needs AgentCore Runtime, which is available in all of them except ap-northeast-3, so it cannot run there. AgentCore Web Search is available only in the Regions listed in [Web search](#web-search).

### Without CloudFormation

If you run BRConnector yourself, give it either `CC_CONFIG_PARAM` (the ARN of an SSM parameter whose value is `{"runtimeArn","workspaceRoleArn","bucket","prefix"}` as JSON), or these variables directly: `CC_RUNTIME_ARN`, `CC_WORKSPACE_ROLE_ARN`, `CC_WORKSPACE_BUCKET` and, optionally, `CC_WORKSPACE_PREFIX` (default `user_data`). The direct variables win when both are set. Without either, `/cc` answers 404.

## Web search

With `EnableWebSearch` `true` (the default), the stack also creates an AgentCore Gateway with the [AgentCore Web Search](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-target-connector-web-search-tool.html) connector, for Claude Code Web to search the web through:

- The gateway is an MCP server that accepts SigV4 (IAM) calls only. Its endpoint is the stack output `WebSearchGatewayUrl`, and the runtime gets it as `AGENTCORE_WEB_SEARCH_GATEWAY_URL`.
- The gateway's own IAM role can call only this gateway and the Web Search connector.
- Only the runtime role may call this gateway (`bedrock-agentcore:InvokeGateway` on its ARN). The web search MCP server inside the runtime signs its calls with the runtime role. The workspace access role and each user's session policy have no `bedrock-agentcore` permission.
- Because of that, gateway calls are attributed to the runtime role, and web search is on for every Claude Code Web user of the stack.

AgentCore Web Search is available in us-east-1, us-east-2, us-west-2, eu-west-1, ap-southeast-2 and ap-northeast-1. In any other Region, such as us-west-1, the stack creates none of this, and Claude Code Web works without web search.

Searches cost $7 per 1,000 queries ([pricing](https://aws.amazon.com/bedrock/agentcore/pricing/)) and are **billed by AWS to the account that runs the stack, not to the key**. They do not go through BRConnector, so they are not counted in the key's quota or balance. The default limit is 10 searches per second per account and Region, an adjustable quota. Set `EnableWebSearch` to `false` to leave web search out.

To be told when the spend grows, create a monthly cost budget for the search usage type. This example alerts at 80 % of USD 50 (about 7,000 queries) to an e-mail address; replace `<account id>` and the address:

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

`USE1-` is the us-east-1 prefix. Other Regions use their own prefix; list the usage types with `aws ce get-dimension-values --dimension USAGE_TYPE --search-string WebSearchTool --time-period Start=<yyyy-mm-01>,End=<today>`. The budget is an alert only: it does not stop searches, and BRConnector quotas do not apply to them.

## Give users access

Claude Code Web is for normal API keys. The admin key is refused.

A key can use Claude Code Web when the key itself, or its group, has at least one model of the [bedrock-runtime-anthropic](../../providers/bedrock-runtime-anthropic.md) provider. Bind these models to the key or to its group:

- `ClaudeCodeBackgroundModel` (default `claude-haiku-5-5`). Claude Code uses it for background tasks, and users cannot pick it in the page, so without it those calls fail.
- `ClaudeCodeDefaultModel` (default `claude-sonnet-5-5`) and any other bedrock-runtime-anthropic model users should be able to choose. The model list in the page shows the key's bedrock-runtime-anthropic models and selects `claude-sonnet-5-5` when it is there, otherwise the first one. A key with none of these models cannot start a session.

The BRConnector names of these models must contain `claude` (or `anthropic`), for the background model as well. The backend decides from the name: for any other name it switches to its LiteLLM proxy mode, which this deployment does not support, and the session fails.

The key's monthly quota and balance apply as usual. When they run out, Claude Code Web answers 402 with the reason.

## Sign in

1. Open `ClaudeCodeWebUrl`, for example `https://d111111abcdef8.cloudfront.net/cc/`.
2. Enter your BRConnector API key. The page checks it against `/v1/models`.
3. The first request starts your microVM, which can take a few tens of seconds.

Logging out stops your microVM. Your files stay in S3 and come back the next time you sign in.

## Costs

- **Model tokens**: billed to the user's key at the prices set in BRConnector, as for any other client.
- **Everything else** is billed to the AWS account that runs the stack, not to any key: AgentCore Runtime compute while microVMs run, CodeBuild minutes for each image build, S3 storage for the workspaces, ECR storage for the image, and CloudWatch Logs. Each key has at most one microVM, and an idle microVM is stopped after 15 minutes.
- **Web searches**, with [web search](#web-search) on: $7 per 1,000 queries, also billed to the account and not to the key. Each MCP `tools/list` and `tools/call` on the gateway is also an AgentCore Gateway call, billed to the account at $0.005 per 1,000; next to the searches this is negligible.
- A `/cc` tab that is open and visible checks the backend's health every 5 seconds, and an open terminal polls for output even when the tab is in the background. Each of these calls counts as activity, so the microVM keeps running, up to AgentCore's 8-hour maximum lifetime (after which AgentCore starts a new one), for as long as the tab stays open. The 15-minute idle stop starts only after the tab is closed or hidden with no terminal open. Ask users to close the tab, or log out, when they are done.
- The workspace bucket is kept when the stack is deleted. Empty and delete it by hand if you no longer need it.

## Known limitations

- The switch only works when the stack is created. Turning it on for an existing stack does not take effect: with ec2, changing the UserData does not run cloud-init again, and the nightly SSM update runs `/root/brconnector-run.sh` (stacks created before 0.0.44 replay the `docker run` line logged at first boot), which was written when the instance was first set up.
- The microVM compute cost is billed to the account that deploys the stack and does not count against the key's quota. The key's quota covers model tokens only. Each key has at most one microVM, reclaimed after 15 minutes idle.
- With ec2, BRConnector is upgraded to `latest` every night, but the Claude Code Web backend image is rebuilt only by a stack update. To rebuild it, change `ClaudeCodeWebImageBuildId` (for example from `1` to `2`): the image is built again from `SourceRepoUrl` at `SourceRef`, so a branch picks up its new commits, and nothing else in the stack changes. Changing `SourceRepoUrl` or `SourceRef` also rebuilds the image. With `lambda-web`, the stack update also rebuilds the BRConnector deployment package from the same repository and ref (a failed update rolls back by rebuilding the previous `SourceRef`, so keep it available until the update completes; see [AutoUpdate](../../home/deployment.md#autoupdate)). With `ec2`, `SourceRepoUrl` and `SourceRef` do not touch the instance; changing `BRConnectorVersion` changes the UserData, so the instance is stopped and started once. The contract between BRConnector and the backend (passing invocations through, and the four custom headers) must stay backward compatible.
- `ec2` and `ecs` cannot use Claude Code Web until a BRConnector release with `/cc` is published upstream and the maintainers push the public image.
- With `lambda-web`, a single message stream lasts at most 15 minutes (the Lambda timeout is 900 seconds). With `ec2` and `ecs`, AgentCore's 15-minute limit for a synchronous request applies.
- An idle microVM is reclaimed after 15 minutes. The workspace comes back from S3, but processes running in the terminal are lost.
- The AWS credentials in the microVM are renewed on every request and last at most an hour. A terminal, or a process started from one, keeps the credentials it started with, which expire between 15 minutes and an hour later; after that its S3 and other AWS calls fail with expired credentials. Open a new terminal.
- `/cc` and `/manager` share BRConnector's origin, and both keep their key in the browser's localStorage, so a page on one can read the other's key. Where you can, do not use the admin key in the same browser profile in which you use `/cc`.
- Users can see their own key and their own temporary AWS credentials in their shell. Those credentials reach only their own workspace prefix. The shell can also use the runtime's own role, but that role can only pull the image, write this runtime's logs, traces and metrics, request this runtime's workload access tokens and, with web search on, call the web search gateway; it has no Bedrock or S3 access. So a user can run web searches from the shell, and they are billed to the account.
- The first visit cold-starts a microVM, which can take a few tens of seconds.
- GitHub OAuth is not supported, and neither is the `lambda` compute type.
