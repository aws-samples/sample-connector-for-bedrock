# Changelogs

## 0.0.44

**Upgrade notes**

- Take a database snapshot before you upgrade: this release adds a migration (item 9). Stacks with `AutoUpdateBRConnector` set to `true` (`ec2` and `lambda` compute types) pick up the new `latest` image automatically at 00:00 UTC.
- Updating a stack to the 0.0.44 `quick-build-brconnector.yaml` template changes the UserData: an `ec2` instance is stopped and started once, and `lambda` and `lambda-web` stacks created with `KeepEc2` set to `false` must be recreated. See [Template updates of existing stacks](deployment.md#template-updates-of-existing-stacks).
- `lambda-web` stacks now build the deployment package on a stack update and run the migrations at start-up (item 2), including the 0.0.43 migrations if they were never applied, which delete the models of retired providers (see 0.0.43).
- The alternative ECS template issues a new admin key on update; read it from the SSM parameter `/brconnector/admin-key-<stack name>`. Direct access to its ALB stops; use `CloudFrontURL` (item 6).
- The Lambda@Edge ARN changes: set `LambdaEdgeVersionArn` to the new output (item 6).
- Image models stay unbilled until `price_per_image` is set in their config (item 9).
- bedrock-converse prompt-cache tokens are now billed (item 9).
- openai-compatible and azure-openai streams now send `stream_options`. If your upstream or Azure API version rejects it, set `"streamUsage": false` in the model config (item 9).
- Claude Code Web stacks: the template update does not rebuild the backend image. To get item 11, change `ClaudeCodeWebImageBuildId` (for example from `1` to `2`) in the stack update; see [Known limitations](../user-manual/scenarios/claude-code-web.md#known-limitations).

1. **CI** - Unit tests, the build and the template checks now run on every pull request.

2. **lambda-web Updates** - The deployment package is now built by CodeBuild. A stack update that changes `SourceRepoUrl`, `SourceRef` or the new `WebFnBuildId` parameter rebuilds it and deploys it as a new Web Function revision, and so does the first update to the 0.0.44 template. `SourceRef` may now be a commit. See [AutoUpdate](deployment.md#autoupdate).
   - A failed build fails the update, names the failing step and leaves the running revision in place.
   - The rollback builds the previous `SourceRef` again, so keep that ref available until the update completes. If the rollback fails too, run `aws cloudformation continue-update-rollback --stack-name <stack name> --resources-to-skip WebFnPackage`.
   - The Web Function now applies the database migrations at start-up (`SKIP_DB_INSTALL` is no longer set), under one lock that covers the whole install.

3. **EC2 Boot Log and Run Script**
   - The stack's EC2 instance no longer writes keys or passwords to its boot log or console. New stacks write the BRConnector start command to the root-only `/root/brconnector-run.sh` (mode 0700), and the nightly update runs `bash /root/brconnector-run.sh latest`. Stacks created before 0.0.44 keep updating from the command recorded at first boot.
   - After the template update, the nightly update on existing ec2 stacks also makes the boot log and the generated key files readable by root only.
   - Admins of stacks created before 0.0.44 may rotate the admin key, stored in the SSM parameter `/brconnector/admin-key-<stack name>`, if other users can log in to the instance or read its console output. See [Admin key on stacks created before 0.0.44](deployment.md#admin-key-before-0-0-44).
   - The `PGPassword` parameter is now NoEcho.

4. **Regions** - `ec2`, `lambda` and `ecs` now work in 17 Regions: us-east-1, us-east-2, us-west-1, us-west-2, ca-central-1, sa-east-1, eu-west-1, eu-west-2, eu-west-3, eu-central-1, eu-north-1, ap-northeast-1, ap-northeast-2, ap-northeast-3, ap-southeast-1, ap-southeast-2 and ap-south-1. `lambda-web` works only where Lambda Web Functions are available: us-east-1, us-east-2, us-west-2, ap-northeast-1 and eu-west-1 (see [AWS Capabilities by Region](https://builder.aws.com/build/capabilities) for the current list), and the template refuses it elsewhere. Claude Code Web needs AgentCore Runtime, so it is not available in ap-northeast-3. See [Supported Region](deployment.md#supported-region).

5. **IAM Roles and Security Groups**
   - The helper EC2 role, the cleanup function's role and the nightly lambda update role now grant only the calls they make. The broad managed policies are removed: ECR, Lambda, ECS and EC2 full access, EC2 read-only, CloudWatch Logs full access and CodeBuild admin.
   - The cleanup function can terminate only this stack's instances.
   - The nightly update output is still not written to S3.
   - The ECS load-balancer security group is created only for the `ecs` compute type.

6. **Alternative ECS Template and Lambda@Edge**
   - The alternative ECS template generates its admin key from a cryptographic random source (32 characters). A stack update issues a new key; read it with `aws ssm get-parameter --name /brconnector/admin-key-<stack name> --query Parameter.Value --output text`. The `AdminApiKey` output is replaced by `AdminApiKeyParameter`.
   - Its ALB admits only CloudFront, and the `LoadBalancerURL` output is removed, so direct ALB access stops; use `CloudFrontURL`.
   - The Lambda@Edge function no longer logs request headers and runs on nodejs24.x. It publishes version `v2` with a new ARN: set `LambdaEdgeVersionArn` of your BRConnector stack to the new `LambdaEdgeVersionArn` output.

7. **Image URLs** - See the [FAQ](faq.md#image-urls).
   - Image URLs in chat requests are fetched directly from the BRConnector host, not through `HTTPS_PROXY` or `HTTP_PROXY`, and only from public addresses. Every redirect is checked again, at most 3. The response must be `image/*`, at most 10 MiB, and arrive within 15 seconds.
   - Deployments without direct internet egress should send images to chat models as `data:` URLs, which work as before.
   - Other URLs, and unsupported schemes that used to send an empty image, now get HTTP 400.
   - Content blocks whose `source` has `s3Location` get HTTP 400; send the content inline.
   - nova-canvas takes `http(s)` URLs, or `s3://` URLs in the model's own `s3Bucket`, and answers a rejected image URL with HTTP 400.

8. **Shared-key Endpoint Removed** - `/open/get-shared-api-key` is removed, so the BRClient portal no longer fills in a key: BRClient users enter their own key. A key named `__shared-api-key__` is now an ordinary key.

9. **Billing**
   - bedrock-converse now bills prompt-cache reads and writes at `price_cache_read` and `price_cache_write` from the model config (per token; `price_in` when unset), and counts them in the recorded input tokens. 1-hour cache writes bill at `price_cache_write`. Set both prices on your own converse models that use prompt caching. See [bedrock-converse](../providers/bedrock-converse.md#billing).
   - The migration `2026-10-23-converse-cache-prices.sql` fills in the two prices on the `claude-opus-5-5-chat`, `claude-sonnet-5-5-chat` and `claude-haiku-5-5-chat` presets where they are absent: a cache read at 0.05 of `price_in` for Opus and Sonnet and 0.1 for Haiku, a cache write at 1.25 of it. A price an admin has set is kept.
   - openai-compatible and azure-openai streams now ask the upstream for usage and are billed once the stream ends, whatever the finish reason. The usage-only chunk reaches only clients that asked for it. The new config key `streamUsage: false` turns this off for an upstream that rejects `stream_options`.
   - bedrock-agent calls are now billed from the token usage in the agent's trace. The trace is not sent to clients or logged.
   - Knowledge-base calls with `bedrockModelArn` are now billed from an estimate of 4 characters per token over the question, the answer and the references cited in the answer; references that are not cited are not counted.
   - painter, nova-canvas and azure-openai-image now record each image generation and bill it at the new config key `price_per_image` (per image). When it is unset the price is 0, so set it to bill image generation.
   - A recharge amount with more than 2 decimals gets HTTP 400, and a recharge is recorded in one transaction.

10. **Feishu Bots** - Feishu bots now keep a single WebSocket client per connector and close replaced or removed ones.

11. **Claude Code Web** - `/ping` now reports the time of the last real activity, so the AgentCore idle timeout can fire, and `serve` delivers SIGTERM to the server for a clean shutdown. Existing stacks get this once a stack update changes `ClaudeCodeWebImageBuildId` (see the upgrade notes).

12. **Docs** - AutoUpdate per compute type, how to update existing stacks, and a web search budget example in [Claude Code Web](../user-manual/scenarios/claude-code-web.md#web-search).

13. **Dependencies** - nodemailer 10.2.1 [#165](https://github.com/aws-samples/sample-connector-for-bedrock/pull/165) and vite 6.4.5 [#166](https://github.com/aws-samples/sample-connector-for-bedrock/pull/166). Claude Code Web: source-map-js 1.2.2 [#156](https://github.com/aws-samples/sample-connector-for-bedrock/pull/156), nanoid 3.3.20 [#157](https://github.com/aws-samples/sample-connector-for-bedrock/pull/157), postcss 8.5.31 [#158](https://github.com/aws-samples/sample-connector-for-bedrock/pull/158), react-router and react-router-dom 7.18.4 [#159](https://github.com/aws-samples/sample-connector-for-bedrock/pull/159), baseline-browser-mapping 2.11.31 [#160](https://github.com/aws-samples/sample-connector-for-bedrock/pull/160), browserslist 4.29.4 [#161](https://github.com/aws-samples/sample-connector-for-bedrock/pull/161), vite 7.3.7 with esbuild 0.28 [#162](https://github.com/aws-samples/sample-connector-for-bedrock/pull/162), aiohttp 3.14.4 [#163](https://github.com/aws-samples/sample-connector-for-bedrock/pull/163) and pyjwt 2.15.0 [#167](https://github.com/aws-samples/sample-connector-for-bedrock/pull/167).

14. **lambda Compute Type Fixes**
   - New `lambda` stacks could not be reached: function URLs created since October 2025 also need the `lambda:InvokeFunction` permission. The template now grants it, limited to calls through the function URL, and updating an existing `lambda` stack adds the permission.
   - With `KeepEc2` set to `false`, the helper instance is now terminated after setup.

## 0.0.43

**Upgrade warning** - Take a database snapshot before you upgrade: the upgrade deletes the models of the retired providers (item 4) and adds preset models (item 2). Stacks with `AutoUpdateBRConnector` set to `true` (`ec2` and `lambda` compute types) pick up the new `latest` image automatically at 00:00 UTC.

1. **Claude Code Web** - Claude Code in the browser at `/cc`, served by BRConnector and running on Amazon Bedrock AgentCore Runtime, with one microVM and one S3 workspace per API key. Its model calls go back through `/v1/messages` with the user's key, so quotas and billing apply. Turn it on with `EnableClaudeCodeWeb` in the CloudFormation template; see [Claude Code Web](../user-manual/scenarios/claude-code-web.md). [#155](https://github.com/aws-samples/sample-connector-for-bedrock/pull/155)
   - `"skipWebFetchPreflight": true` is written into each user's `~/.claude/settings.json` when the key is missing. A value the user has set is kept.
   - The new parameter `EnableWebSearch` defaults to `true`, also when an existing stack is updated. With Claude Code Web on, in us-east-1, us-east-2, us-west-2, eu-west-1, ap-southeast-2 or ap-northeast-1, it creates an AgentCore Gateway with a Web Search target. Only the runtime role may call the gateway.
   - Searches are billed by AWS to the account that runs the stack (about USD 7 per 1,000 queries), outside BRConnector quotas. Consider an AWS Budgets alert, or set `EnableWebSearch` to `false`.
   - While the gateway is configured, Claude Code's built-in WebSearch tool is hidden.

2. **Preset Models on Existing Databases** - At start-up (on every compute type except `lambda-web`, see item 4), BRConnector applies each SQL migration in `src/scripts/migrations/` that the database has not had yet. Preset models that an existing database lacks are added and bound to group 1; a model name that already exists is left unchanged. [#153](https://github.com/aws-samples/sample-connector-for-bedrock/pull/153)

3. **Model Presets** - Seven GPT-6 and GPT-5.6 presets on bedrock-runtime-openai [#152](https://github.com/aws-samples/sample-connector-for-bedrock/pull/152). `claude-opus-5-5-chat`, `claude-sonnet-5-5-chat` and `claude-haiku-5-5-chat` on bedrock-converse, now used by NoDB mode and knowledge-base summaries. The Claude 3.x presets and NoDB defaults are removed; existing models are left as they are. [#154](https://github.com/aws-samples/sample-connector-for-bedrock/pull/154)

4. **Retired Providers** - `aws-executor`, `urls-reader` and `web-miner` are removed; use Claude Code Web (`/cc`) instead.
   - The upgrade migration deletes the models on these providers and their key and group bindings. History (threads and sessions) is kept.
   - A request to a model on one of these providers gets HTTP 400 that points to Claude Code Web (`/cc`). Once the model is deleted, the request gets the usual unknown-model answer, and so does a smart-router rule, `localLlmModel` or bot connector that names it.
   - `lambda-web` stacks are different. Updating the stack does not deliver 0.0.43: the deployment package is built only when the stack is created, and the function does not run migrations at start-up. To run 0.0.43, deploy a new `lambda-web` stack; its database is set up for 0.0.43 when the stack is created. To bring an existing database up to date by hand, take a snapshot, then apply the files in `src/scripts/migrations/` in file-name order: `2026-10-20-preset-models.sql`, `2026-10-20b-claude-chat-presets.sql` and `2026-10-22-retire-providers.sql`. The last one runs:

     ```sql
     BEGIN;
     DELETE FROM eiai_key_model WHERE model_id IN (SELECT id FROM eiai_model WHERE provider IN ('aws-executor', 'urls-reader', 'web-miner'));
     DELETE FROM eiai_group_model WHERE model_id IN (SELECT id FROM eiai_model WHERE provider IN ('aws-executor', 'urls-reader', 'web-miner'));
     DELETE FROM eiai_model WHERE provider IN ('aws-executor', 'urls-reader', 'web-miner');
     COMMIT;
     ```

5. **Model Id Override Removed** - A model string `name/<id>` that is not itself a configured model name now gets HTTP 400, for every key. This also applies to Feishu bot, knowledge-base and smart-router model ids that contain `/`, and to azure-openai models. A `model_id` field in the request body is ignored. To use an upstream model id, configure a model for it; a configured model name may contain `/` ([FAQ](faq.md#model-wildcard)).

6. **Billing**
   - Spend over the monthly quota is now drawn from the balance.
   - The balance can go below zero by at most the last calls. After that, calls are refused until a recharge, or until the next month when the monthly quota is above 0.
   - Charges are atomic, and a recharge adds to the stored balance.
   - A recharge reaches all instances within 60 seconds, through the cache.
   - The `month_fee` shown for a key keeps last month's value until the key's first charge in the new month.

7. **Session-Id** - A `Session-Id` longer than 128 characters gets HTTP 400 on every route.

8. **User APIs**
   - `/user/model/list` returns only `name`, `provider`, `price_in`, `price_out`, `multiple` and `group_name`.
   - `/user/thread/list` returns only the caller's own threads, and `limit` is capped at 100 (on `/admin/thread/list` too).
   - `orderBy` on the session and payment lists accepts a fixed set of values and falls back to the default order for anything else.

9. **API Keys and Logs**
   - New API keys are generated from a cryptographic random source.
   - SQL parameters and whole error objects are no longer logged, outside debug mode.

## 0.0.42

1. **bedrock-runtime-anthropic Provider** - New provider for Claude Code and other Anthropic Messages clients. `POST /v1/messages` is passed through to Bedrock's native `/anthropic/v1/messages` route, so `system`, `tools`, `thinking`, `cache_control` and `context_management` reach the model unchanged. It bills input, cache read, 5-minute and 1-hour cache writes, and output, and keeps each session on one region and credential so that prompt caching keeps hitting. Six Claude presets are added for new databases. [#147](https://github.com/aws-samples/sample-connector-for-bedrock/pull/147)

2. **bedrock-runtime-openai Provider** - New provider that passes OpenAI Chat Completions requests through to Bedrock's `/openai/v1/chat/completions` route, for OpenAI-format models such as Kimi K3 and GLM. Seven presets are added for new databases. [#141](https://github.com/aws-samples/sample-connector-for-bedrock/pull/141)

3. **Anthropic-format Errors on /v1/messages** - Errors on `/v1/messages` now come back as `{"type":"error","error":{...}}` with a matching status, for example 401 `authentication_error` or 403 `permission_error`, so Anthropic SDK clients can handle them. Other routes are unchanged. [#147](https://github.com/aws-samples/sample-connector-for-bedrock/pull/147)

4. **AWS Lambda Web Functions** - New `lambda-web` ComputeType in the CloudFormation template that runs BRConnector on Lambda Web Functions: no adapter, native response streaming, billing by active CPU, and requests up to 900 seconds. The endpoint defaults to `IamAuth`, so only the CloudFront distribution can reach it, and every request is also checked against a shared origin secret. The existing `lambda` ComputeType is unchanged. [#145](https://github.com/aws-samples/sample-connector-for-bedrock/pull/145) [#148](https://github.com/aws-samples/sample-connector-for-bedrock/pull/148)

5. **Concurrency Fix: One Provider Instance per Request** - Concurrent requests no longer share provider state or model data. [#144](https://github.com/aws-samples/sample-connector-for-bedrock/pull/144)

6. **bedrock-converse Fixes**
   - `temperature` and `top_p` are no longer sent to Claude models that reject them (Opus 4.x and Claude 5.x). A `ValidationException` on a single-region model is no longer retried. [#146](https://github.com/aws-samples/sample-connector-for-bedrock/pull/146)
   - Bedrock API keys and AK/SK credentials are scoped to their own model. [#138](https://github.com/aws-samples/sample-connector-for-bedrock/pull/138)
   - The `thinking` parameter is read from the Anthropic request body. [#122](https://github.com/aws-samples/sample-connector-for-bedrock/pull/122)

7. **BRClient Portal** - With no API key saved, the portal turns on BRConnector mode and opens the settings page. [#142](https://github.com/aws-samples/sample-connector-for-bedrock/pull/142)

8. **Container Runs as Non-root** - Both Docker images now run as the `node` user, the health check no longer depends on curl (the container used to report unhealthy), and the Feishu bot writes its temporary files to the system temp directory. [#150](https://github.com/aws-samples/sample-connector-for-bedrock/pull/150)

9. **Build and Dependencies** - devDependencies are kept out of `dist/package.json` [#140](https://github.com/aws-samples/sample-connector-for-bedrock/pull/140). Dependency updates: [#109](https://github.com/aws-samples/sample-connector-for-bedrock/pull/109) [#110](https://github.com/aws-samples/sample-connector-for-bedrock/pull/110) [#111](https://github.com/aws-samples/sample-connector-for-bedrock/pull/111) [#114](https://github.com/aws-samples/sample-connector-for-bedrock/pull/114) [#115](https://github.com/aws-samples/sample-connector-for-bedrock/pull/115) [#116](https://github.com/aws-samples/sample-connector-for-bedrock/pull/116) [#128](https://github.com/aws-samples/sample-connector-for-bedrock/pull/128) [#132](https://github.com/aws-samples/sample-connector-for-bedrock/pull/132) [#133](https://github.com/aws-samples/sample-connector-for-bedrock/pull/133) [#134](https://github.com/aws-samples/sample-connector-for-bedrock/pull/134) [#135](https://github.com/aws-samples/sample-connector-for-bedrock/pull/135) [#136](https://github.com/aws-samples/sample-connector-for-bedrock/pull/136) [#137](https://github.com/aws-samples/sample-connector-for-bedrock/pull/137) [#143](https://github.com/aws-samples/sample-connector-for-bedrock/pull/143)

Upgrade notes: preset models are inserted only into new databases. On an existing database, add the models you want in the admin UI. Admin Price-In / Price-Out are per 1 million tokens, while the cache prices in a model's config are per token.

## 0.0.41

1. **Anthropic Messages API Compatibility** - Added a new endpoint `POST /v1/messages` that is fully compatible with the Anthropic Messages API. Clients using the Anthropic SDK can now connect directly without modification. Supports text, tool use, thinking content blocks, and both streaming and non-streaming modes.

2. **x-api-key Header Support** - Added support for the `x-api-key` header (Anthropic SDK default) in addition to the existing `Authorization: Bearer` header.

3. **Bug Fix: claude-opus-4 temperature/topP** - Removed deprecated `temperature` and `topP` parameters for `claude-opus-4` and later models, which caused `invalid_request_error`.

4. **Build Fix** - Removed hardcoded local path alias for `kui-vue` in `vite.config.js` that caused build failures on non-author machines. Downgraded `vite` from experimental `rolldown-vite` to stable `^6.3.3`.

## 0.0.40

1. **AWS Bedrock Bearer Token Support** - Added support for AWS Bedrock API Key (Bearer Token) authentication method in addition to traditional AKSK credentials.

2. **Multi-tool Call Fix** - Fixed an issue where multiple tool calls in a single response were not handled correctly in streaming mode.

## 0.0.38

1. **Bedrock App Profiles Support** - Added support for Bedrock application profiles, allowing better configuration management for different deployment scenarios. [#87](https://github.com/aws-samples/sample-connector-for-bedrock/issues/87)

2. **PostgreSQL Database Upgrade** - Upgraded standalone PostgreSQL database from version 16.3 to 16.10 for improved performance and security. [#89](https://github.com/aws-samples/sample-connector-for-bedrock/pull/89)

3. **Zero-Length Messages Fix** - Fixed an issue where Bedrock would fail when processing zero-length messages. [#90](https://github.com/aws-samples/sample-connector-for-bedrock/pull/90)

4. **Tool Use Enhancement** - Improved tool use functionality with bug fixes and stability improvements. [#91](https://github.com/aws-samples/sample-connector-for-bedrock/pull/91) [#92](https://github.com/aws-samples/sample-connector-for-bedrock/pull/92)

5. **General Improvements** - Various bug fixes and performance optimizations.

## 0.0.37

1. **bedrock-converse Provider Fix** - Fixed an issue with Claude new models: 'The model returned the following errors: temperature and top_p cannot both be specified for this model. Please use only one.'

2. **Frontend Caching Enhancement** - Added 1-month caching for frontend pages served by koa-static-server.

## 0.0.36

1. **anthropic_beta Features Support** - Added support for anthropic_beta features, including:
   - Compatible with Claude 3.7 Sonnet: token-efficient-tools-2025-02-19, output-128k-2025-02-19
   - Compatible with Claude Sonnet 4: context-1m-2025-08-07
   
   These features are automatically integrated into the backend logic without requiring separate configuration. Reference: [AWS Bedrock Anthropic Claude Parameters](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-anthropic-claude-messages-request-response.html)

2. **Thinking Mode Enhancement** - In thinking mode, content is now set to empty string instead of null.

## 0.0.35

1. **New Provider: gemini** - Added a new Google Gemini provider. Thanks to "daniexon" for the contribution.

2. **Enhancement: Tool Calls for openai_compatible Provider** - The openai_compatible provider now supports passing tool calls to the model. Thanks to "bdavj" for the contribution.

3. **Format Mapping: Bedrock Converse finish_reason** - Mapped Bedrock Converse finish_reason to OpenAI format for improved compatibility.

4. **New Parameter Support: max_completion_tokens** - Added support for the max_completion_tokens parameter.

5. **New Docker Files** - Added two new Dockerfiles.

## 0.0.34

1. **Bug Fixes** - Fixed several minor bugs to improve system stability.

## 0.0.33

1. **New Provider: bedrock-agent** - Added a new provider for Amazon Bedrock Agents. This is a simple implementation that allows you to interact with your Bedrock Agents. [Documentation](../providers/bedrock-agent/)

2. **New Provider: azure-openai-image** - Added support for Azure OpenAI image generation models. [Documentation](../providers/azure-openai-image/)

3. **Removed Providers** - Removed several deprecated providers (bedrock-claude3, bedrock-mistral, bedrock-llama3) as they can be fully replaced by the bedrock-converse provider.

4. **Docker Optimization** - Removed AWS CLI commands from the Docker file to reduce image size.
