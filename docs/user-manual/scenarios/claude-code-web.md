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

The template's `Rules` reject any other combination before anything is created.

With the switch on, the stack also creates:

- an ECR repository, and a CodeBuild project that builds the backend image (arm64) from `SourceRepoUrl` at `SourceRef`, smoke-tests it and pushes it; a small Lambda function starts the build during stack creation, and the stack waits for it;
- the AgentCore Runtime;
- an S3 bucket for the workspaces, which is **kept** when the stack is deleted;
- an IAM role for the runtime, an IAM role for workspace access, and a policy on BRConnector's role that lets it call the runtime;
- the SSM parameter `/brconnector/<stack name>/claude-code-web`, from which BRConnector reads the runtime settings (`CC_CONFIG_PARAM`).

The stack output `ClaudeCodeWebUrl` is the address to open.

The template supports us-east-1, us-east-2, us-west-1 and us-west-2, and AgentCore Runtime is available in all four. `lambda-web` is available only where Lambda Web Functions are.

### Without CloudFormation

If you run BRConnector yourself, give it either `CC_CONFIG_PARAM` (the ARN of an SSM parameter whose value is `{"runtimeArn","workspaceRoleArn","bucket","prefix"}` as JSON), or these variables directly: `CC_RUNTIME_ARN`, `CC_WORKSPACE_ROLE_ARN`, `CC_WORKSPACE_BUCKET` and, optionally, `CC_WORKSPACE_PREFIX` (default `user_data`). The direct variables win when both are set. Without either, `/cc` answers 404.

## Give users access

Claude Code Web is for normal API keys. The admin key is refused.

A key can use Claude Code Web when the key itself, or its group, has at least one model of the [bedrock-runtime-anthropic](../../providers/bedrock-runtime-anthropic.md) provider. Bind these models to the key or to its group:

- `ClaudeCodeBackgroundModel` (default `claude-haiku-5-5`). Claude Code uses it for background tasks, and users cannot pick it in the page, so without it those calls fail.
- `ClaudeCodeDefaultModel` (default `claude-sonnet-5-5`) and any other bedrock-runtime-anthropic model users should be able to choose. The model list in the page shows the key's bedrock-runtime-anthropic models and selects `claude-sonnet-5-5` when it is there, otherwise the first one. A key with none of these models cannot start a session.

The key's monthly quota and balance apply as usual. When they run out, Claude Code Web answers 402 with the reason.

## Sign in

1. Open `ClaudeCodeWebUrl`, for example `https://d111111abcdef8.cloudfront.net/cc/`.
2. Enter your BRConnector API key. The page checks it against `/v1/models`.
3. The first request starts your microVM, which can take a few tens of seconds.

Logging out stops your microVM. Your files stay in S3 and come back the next time you sign in.

## Costs

- **Model tokens**: billed to the user's key at the prices set in BRConnector, as for any other client.
- **Everything else** is billed to the AWS account that runs the stack, not to any key: AgentCore Runtime compute while microVMs run, CodeBuild minutes for each image build, S3 storage for the workspaces, ECR storage for the image, and CloudWatch Logs. Each key has at most one microVM, and an idle microVM is stopped after 15 minutes.
- The workspace bucket is kept when the stack is deleted. Empty and delete it by hand if you no longer need it.

## Known limitations

- The switch only works when the stack is created. Turning it on for an existing stack does not take effect: with ec2, changing the UserData does not run cloud-init again, and the SSM auto-update replays the `docker run` line from the first boot.
- The microVM compute cost is billed to the account that deploys the stack and does not count against the key's quota. The key's quota covers model tokens only. Each key has at most one microVM, reclaimed after 15 minutes idle.
- With ec2, BRConnector is upgraded to `latest` every night, but the Claude Code Web backend image is rebuilt only by a stack update that changes `SourceRepoUrl`, `SourceRef` or `BRConnectorVersion`. The contract between BRConnector and the backend (passing invocations through, and the four custom headers) must therefore stay backward compatible.
- `ec2` and `ecs` cannot use Claude Code Web until a BRConnector release with `/cc` is published upstream and the maintainers push the public image.
- With `lambda-web`, a single message stream lasts at most 15 minutes (the Lambda timeout is 900 seconds). With `ec2` and `ecs`, AgentCore's 15-minute limit for a synchronous request applies.
- An idle microVM is reclaimed after 15 minutes. The workspace comes back from S3, but processes running in the terminal are lost.
- Users can see their own key and their own temporary AWS credentials in their shell. Those credentials reach only their own workspace prefix.
- The first visit cold-starts a microVM, which can take a few tens of seconds.
- GitHub OAuth is not supported, and neither is the `lambda` compute type.
