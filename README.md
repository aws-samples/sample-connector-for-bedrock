# Sample Connector for Bedrock

This is a Bedrock (and other generative AI tools from AWS) API forwarding tool that can issue virtual keys, log chats, and manage costs.

It is compatible with any OPENAI client or Anthropic client that can define Host and API Key.

## Quick references

[Quick start](https://aws-samples.github.io/sample-connector-for-bedrock/home/quick-start/)

[Quick Deployment](https://aws-samples.github.io/sample-connector-for-bedrock/home/deployment/)

[Providers](https://aws-samples.github.io/sample-connector-for-bedrock/providers/introduction/)

[Claude Code Web](https://aws-samples.github.io/sample-connector-for-bedrock/user-manual/scenarios/claude-code-web/) (optional, Claude Code in the browser at `/cc`)

Docker Image: [DockerHub](https://hub.docker.com/r/cloudbeer/sample-connector-for-bedrock/tags), [Public ECR](https://gallery.ecr.aws/x6u9o2u4/sample-connector-for-bedrock)

Docker Image for Lambda: [DockerHub](https://hub.docker.com/r/cloudbeer/sample-connector-for-bedrock-lambda/tags), [Public ECR](https://gallery.ecr.aws/x6u9o2u4/sample-connector-for-bedrock-lambda)

## Usage with Claude Code

```bash
export ANTHROPIC_BASE_URL=https://your-endpoint
export ANTHROPIC_API_KEY=your-api-key
export ANTHROPIC_MODEL=your-model
```

## Main Features

### Supported Models and Platforms

- Supports all current and future large language models from Bedrock (supported through bedrock-converse).
- Supports models deployed through Sagemaker LMI (partial models).
- Supports other forms of custom models, including Ollama, etc.
- More AI workflow applications, such as Bedrock knowledge bases, Bedrock agents and image generation.

### API Key and Cost Management

- Create API keys. Keys can be created for regular users and administrators. Regular users can chat, while administrators can manage API keys and costs.
- Record the cost of each call and use it as a basis for cost control.
- Cost control. You can set monthly quotas and account balances for each API key. When the monthly quota or account balance is insufficient, it cannot be used.
- Calculate the overall cost.

> [!IMPORTANT]  
>
> The cost calculation of this project cannot be used as the basis for AWS billing. Please refer to the AWS bill for actual expenses. [Please refer to the official website for the Bedrock pricing](https://aws.amazon.com/bedrock/pricing).

### Model Management

Models and their parameters can be defined from the backend.

Once defined, models can be bound to groups or API Keys.

## Changelogs

## 0.0.47

**Upgrade notes**

- `AutoUpdateBRConnector` now defaults to `false`, so a new stack no longer updates BRConnector every night (item 1). A console update to the new template keeps the value the stack has. With `aws cloudformation update-stack`, pass `ParameterKey=AutoUpdateBRConnector,UsePreviousValue=true` in `--parameters`. Without it, the update takes the new default `false` and deletes the nightly job: the SSM association on `ec2`, the EventBridge rule and the CodeBuild project on `lambda`, and the daily redeploy of `brconnector-ecs-fargate.yaml`. The stack then no longer updates BRConnector. `aws cloudformation deploy` keeps the value when `--parameter-overrides` leaves the parameter out. The update does not change or restart the `ec2` instance, the `lambda` function or the ECS service. See [AutoUpdate in existing stacks](https://aws-samples.github.io/sample-connector-for-bedrock/home/deployment/#autoupdate-stack-update).
- The Claude Code Web backend image gets item 2 only when it is rebuilt. To rebuild it, change `ClaudeCodeWebImageBuildId` (for example from `1` to `2`). See [Claude Code Web](https://aws-samples.github.io/sample-connector-for-bedrock/user-manual/scenarios/claude-code-web/#known-limitations).

1. **AutoUpdate Off by Default** - `AutoUpdateBRConnector` defaults to `false` in `quick-build-brconnector.yaml` and `brconnector-ecs-fargate.yaml`, so a new stack stays on the release it was created with. Set it to `true` to turn the nightly update on. It replaces only the image and does not update the template. In `quick-build-brconnector.yaml`, it moves `ec2` and `lambda` to `latest` even when `BRConnectorVersion` is pinned. See [AutoUpdate](https://aws-samples.github.io/sample-connector-for-bedrock/home/deployment/#autoupdate).
2. **Dependency Updates** - Dependencies move to newer releases. The new releases of cryptography, pip, multidict, idna, requests, uuid, @humanfs/node and minimatch fix known vulnerabilities.
   - The Claude Code Web backend image installs cryptography 50.0.2, pip 26.3, multidict 6.9.1, idna 3.20 and requests 2.34.2. cryptography is a major upgrade from 46.0.7. This fixes the known cryptography vulnerabilities that 0.0.45 and 0.0.46 kept.
   - The BRConnector server dependencies do not change. Each build installs the newest releases that `package.json` allows. These no longer include fast-xml-parser, because @aws-sdk/xml-builder 3.972.43 does not depend on it. The lockfile that the tests use now has the same @aws-sdk/xml-builder, and `package.json` no longer overrides fast-xml-parser.
   - The lockfile also moves uuid to 13.0.2 (through kui-vue), @humanfs/node to 0.16.8 (through eslint) and minimatch to 11.0.9 (through rimraf 6.1.4). minimatch is a major upgrade from 10.2.6. These are dev dependencies, and the image does not install them.
   - zod stays on 3.25.76 in the image and in the lockfile, because its fix is only in zod 4. The koa-body and openai releases that BRConnector uses require zod 3, and the server calls zod only on its own settings, not on request data.

## 0.0.46

**Upgrade notes**

- The Claude Code Web backend image gets item 1 only when it is rebuilt. To rebuild it, change `ClaudeCodeWebImageBuildId` (for example from `1` to `2`). See [Claude Code Web](https://aws-samples.github.io/sample-connector-for-bedrock/user-manual/scenarios/claude-code-web/#known-limitations).
- No action is needed (item 2). A browser that cached BRClient before the upgrade keeps that copy for up to 30 days, so it can show the old BRClient until the user refreshes the page once. BRConnector cannot change a copy that the browser already holds.
- Update the stack to the new template to give `painter` storage and IAM permissions (item 3). See [painter in existing stacks](https://aws-samples.github.io/sample-connector-for-bedrock/home/deployment/#painter-stack-update).
- An `ec2` instance is not changed or restarted by this update: BRConnector reads the painter settings from an SSM parameter (item 3).
- A model that is already named `painter` stays unchanged. The preset is added only when the name is free (item 3).
- With AutoUpdate, the preset `painter` arrives with the new image, also before the stack is updated to the new template. Until then it answers with an error that says how to give it storage (item 3).
- The first call to each Stability model subscribes the account in AWS Marketplace and can take up to 15 minutes. Calls fail with an access-denied hint until the subscription is active (item 3).
- The Claude Code Web workspace role now reaches only `user_data/` in the bucket (item 3).
- Claude Code Web is on by default for new stacks (item 4). A console update keeps the value of `EnableClaudeCodeWeb` the stack has, which is `false` for a stack created before. A stack created from a template that has no `EnableClaudeCodeWeb` parameter, from before Claude Code Web, has no value to keep: the console shows the new default `true`, so set it to `false` when you update that stack. With the AWS CLI, pass `ParameterKey=EnableClaudeCodeWeb,UsePreviousValue=true`. Without it, the update takes the new default, creates Claude Code Web, and on `ec2` changes the UserData, which stops and starts the instance. See [Claude Code Web in existing stacks](https://aws-samples.github.io/sample-connector-for-bedrock/home/deployment/#claude-code-web-stack-update).
- A new stack takes longer to create and costs more, because Claude Code Web adds a CodeBuild build and AgentCore Runtime charges (item 4). Set `EnableClaudeCodeWeb` to `false` to avoid them.
- A combination that cannot run Claude Code Web no longer fails the stack. It is skipped, and the `ClaudeCodeWebStatus` output says why (item 4).
- The template now always creates the workspace bucket. A stack that had Claude Code Web on and was later updated with it off still owns a bucket with that name outside the stack, and the update can fail because it exists. See [painter in existing stacks](https://aws-samples.github.io/sample-connector-for-bedrock/home/deployment/#painter-stack-update) (item 3).

1. **Dependency Updates** - Dependencies move to newer releases. The new releases of dnspython, fast-uri, fastmcp, filelock, mcp, opentelemetry-api, qs and starlette fix known vulnerabilities.
   - The Claude Code Web backend image installs dnspython 2.9.2, opentelemetry-api 1.45.2, mcp 1.30.0, fastmcp 3.4.10 and filelock 4.2.1. fastmcp 3.4.10 needs Starlette 1.x, so starlette moves from 0.50.0 to 1.10.0 and fastapi from 0.128.0 to 0.162.7. This fixes the known starlette vulnerabilities that 0.0.45 kept.
   - The BRConnector server dependencies do not change. Each build installs the newest releases that `package.json` allows. The lockfile that the tests use now has qs 6.17.1 and fast-uri 3.1.9.
   - The Claude Code Web web client is built with @babel/core 7.29.6 and picomatch 4.0.7.

2. **BRClient Updates Without a Refresh** - After an upgrade, the browser now shows the new BRClient without a manual refresh. Before, BRConnector told browsers to keep every BRClient file, `index.html` included, for 30 days, so they kept showing the old BRClient.
   - On every load, the browser now asks BRConnector for the current version of `/portal-for-brclient.html` and of the BRClient (`/brclient/`) and admin console (`/manager/`) files. Build files whose names contain a content hash are the exception: the browser keeps them for up to a year, as it already does for `/cc`.
3. **painter Out of the Box** - A new stack with a database ships a ready `painter` model. An admin only grants it to a key or a group, and fills in nothing about S3 or IAM. See [painter](https://aws-samples.github.io/sample-connector-for-bedrock/providers/painter/#preset-painter-model).
   - A new migration adds the preset `painter` model: Stability Image Ultra (`stability.stable-image-ultra-v1:1`) with `claude-sonnet-5-5-chat` as the chat model, prices 0 (pictures are billed at the built-in list prices), bound to group 1. An existing model with the same name is not changed.
   - The template always shares the stack's workspace bucket, the one Claude Code Web uses, with painter, under `painter/`. There is no parameter for it. The bucket is always created. It is retained on stack delete and has no lifecycle rule. It has a CORS rule that allows `GET` and `HEAD` from any origin, so the BRClient download button can save a picture instead of opening it in a new tab. The rule grants no access: a request still needs a presigned URL or IAM credentials.
   - The template grants the BRConnector role `s3:PutObject` and `s3:GetObject` on `<bucket>/painter/*`, and `aws-marketplace:Subscribe` and `aws-marketplace:ViewSubscriptions`, so the first call to each Stability model subscribes the account. The account needs a valid payment method.
   - `lambda`, `lambda-web` and `ecs` get `PAINTER_S3_BUCKET`, `PAINTER_S3_REGION` and `PAINTER_S3_PREFIX` as environment variables. `ec2` reads them from an SSM parameter, so the update does not restart the instance.
   - `s3Bucket`, `s3Region` and `s3Prefix` in the painter config are now optional. Without `s3Bucket`, painter uses the stack's settings. With it, the config gives all three, as before. With neither, the error names both fixes. See [Where pictures are stored](https://aws-samples.github.io/sample-connector-for-bedrock/providers/painter/#where-pictures-are-stored).
   - A key that has only `painter` now works. painter's call to the chat model is billed to the same key. The key still cannot call the chat model directly.
   - The Claude Code Web workspace role is now limited to `user_data/` in the shared bucket.
4. **Claude Code Web On by Default** (behaviour change) - `EnableClaudeCodeWeb` now defaults to `true`, so a new stack deploys [Claude Code Web](https://aws-samples.github.io/sample-connector-for-bedrock/user-manual/scenarios/claude-code-web/) without a switch. A deployment that cannot run it skips it, and the stack is still created.
   - The `ClaudeCodeWebRequirements` rule is removed. Its three tests are part of the condition that creates Claude Code Web: `ComputeType` is not `lambda`, the stack has a database, and `BRConnectorVersion` is `latest` unless `ComputeType` is `lambda-web`.
   - The new output `ClaudeCodeWebStatus` is always present. It says `Deployed`, or why Claude Code Web was not deployed: the switch is off, `lambda`, no usable database, or a pinned `BRConnectorVersion`.
   - A new stack takes longer to create, because the CodeBuild build of the backend image runs during creation. The account pays for AgentCore Runtime. `EnableWebSearch` is also `true` by default, and each search is billed to the account.
   - A request for Claude Code Web on an unsupported combination used to fail the stack with an error. Now the stack is created without it. Read `ClaudeCodeWebStatus`.

5. **BRClient Download Button on Each Picture** - Each picture in a BRClient message now has its own download button, which saves only that picture. The Download button among the message's actions still saves all of its pictures.
   - The button appears in the picture's top-right corner when the pointer is over the picture or the button has keyboard focus, and it stays visible on touch screens. Only `http(s)` pictures that have loaded and are at least 48 pixels on each side have it.
   - This release pins upstream `main` plus the new head of the unmerged upstream pull request [#82](https://github.com/aws-samples/sample-client-for-amazon-bedrock/pull/82). See [BRClient source](https://aws-samples.github.io/sample-connector-for-bedrock/home/deployment/#brclient-source).

## 0.0.45

**Upgrade notes**

- This is a breaking change for models that use an image model Amazon Bedrock no longer serves (item 1). Before you upgrade, check the provider and the `paintModelId` of each model on the `nova-canvas` or `painter` provider in the admin console. No migration changes these models.
- Stacks with AutoUpdate pull the new image automatically (items 1 and 2). Before users rely on the new `painter`, check that `localLlmModel` can see images (Claude Sonnet is recommended), and check `price_per_image` and `image_prices` (item 2). A `painter` config without a price is now billed at the built-in list prices.
- `regions` no longer applies to `painter`; remove it from the model config (item 2). If BRConnector runs outside us-east-1, us-east-2 and us-west-2, uploaded pictures and prompts go to us-west-2.
- `lambda-web` stacks serve BRClient at `/brclient/` once the package is rebuilt from a `SourceRef` that includes item 3. When `SourceRef` is a branch, change `WebFnBuildId` (for example from `1` to `2`) to rebuild. The package build now downloads the BRClient source from GitHub and its dependencies from the npm registry, and builds BRClient, so the build takes a few minutes longer (item 3).
- The Claude Code Web backend image gets item 5 only when it is rebuilt. To rebuild it, change `ClaudeCodeWebImageBuildId` (for example from `1` to `2`). See [Claude Code Web](https://aws-samples.github.io/sample-connector-for-bedrock/user-manual/scenarios/claude-code-web/#known-limitations).
- Release the templates and the BRConnector image together as 0.0.45, the image first or at the same time. A new `lambda` or `lambda-web` stack with a generated password (`PGPassword` empty) needs the 0.0.45 BRConnector to read it (item 7); with an older image or `SourceRef` it cannot reach its database. Stacks with a password are not affected.
- Updating a stack to the new `quick-build-brconnector.yaml` or `brconnector-ecs-fargate.yaml` asks for `PGStorageEncrypted` (item 6). Choose `false` for a stack created from an earlier template: `true` replaces its database with a new, empty one. On later updates, keep the value the stack has. Keep the current `PGPassword` (with the AWS CLI, `UsePreviousValue=true`; without it, the update generates a new password). The existing database keeps its data and its password and stays unencrypted, and the update turns on its deletion protection. See [Template updates of existing stacks](https://aws-samples.github.io/sample-connector-for-bedrock/home/deployment/#template-updates-of-existing-stacks).

1. **End-of-life Image Models Removed** - Amazon Bedrock no longer serves Amazon Nova Canvas (`amazon.nova-canvas-v1:0`), Amazon Titan Image Generator (`amazon.titan-image-generator-v1`, `amazon.titan-image-generator-v2:0`), Stability SDXL (`stability.stable-diffusion-xl-v0`, `stability.stable-diffusion-xl-v1`), `stability.sd3-large-v1:0` and `stability.stable-image-ultra-v1:0`, so BRConnector no longer supports them.
   - The `nova-canvas` provider is removed. A request to a model on it gets HTTP 400 that points to `painter`. The model stays in the database for you to change or delete. To keep drawing, create a `painter` model with one of the models below.
   - `painter` supports `stability.stable-image-ultra-v1:1`, `stability.stable-image-core-v1:1` and `stability.sd3-5-large-v1:0`. Amazon Bedrock serves them only in us-west-2, and `painter` calls that Region by itself. See [painter](https://aws-samples.github.io/sample-connector-for-bedrock/providers/painter/).
   - A `painter` model whose `paintModelId` is not a Stability model now answers with an error that lists the three models, and does not call Bedrock. A `painter` model on a retired Stability model still fails at Bedrock.
   - To fix a `painter` model, set its `paintModelId` to one of the three models.

2. **painter Image to Image** - Users can upload up to 5 pictures (10 MB each; JPEG, PNG or WebP) in BRClient with one sentence. The chat model chooses one of eight Stability capabilities: text to image, image to image, search and replace, remove background, style guide, style transfer, control structure and control sketch. See [painter](https://aws-samples.github.io/sample-connector-for-bedrock/providers/painter/).
   - One request can run up to 5 steps. Each step's picture streams back as soon as it is made, with a line that names the capability, the model and the input pictures. Later messages can refer to earlier pictures.
   - Each picture is billed at the price of the model that made it. The new `image_prices` field sets a price for each model ID. Without a price, painter uses the built-in list prices.
   - Non-stream requests do not draw. They go to the chat model as before.
   - painter replies in the language of the user's latest message, also when earlier messages use another language.
   - **Breaking:** `localLlmModel` must now support function calling and see images.
   - Use Claude Sonnet as `localLlmModel`. The configuration example now uses `claude-sonnet-5-5-chat`. In tests, Amazon Nova Pro ran extra billed steps the user did not ask for and showed its `<thinking>` text in the reply. See [Choosing the chat model](https://aws-samples.github.io/sample-connector-for-bedrock/providers/painter/#choose-chat-model).
   - **Breaking:** `regions` no longer applies to `painter`. Ultra, Core and SD3.5 Large run in us-west-2. The six `us.stability.*` image services run in the host Region when it is us-east-1, us-east-2 or us-west-2, and in us-west-2 otherwise. Outside those three Regions, pictures and prompts are sent to us-west-2, so do not use `painter` if you have data-residency requirements. The role needs `bedrock:InvokeModel` in the target Region, and an SCP that limits `aws:RequestedRegion` blocks calls to us-west-2.
   - **Breaking:** a config with no price is now billed at the built-in list prices, not at 0. A config with `price_per_image` keeps that one price for every capability until `image_prices` is set.
   - **Breaking:** presigned picture URLs now last up to 4 hours instead of 1. A URL signed with temporary credentials stops working when the credentials expire, so older pictures can stop loading sooner.
   - Uploaded pictures are stored in `<s3Prefix>/uploads/<date>/`. BRConnector sets no lifecycle rule, so pictures stay until you delete them.
   - **Fix:** a non-stream answer from a `bedrock-converse` model now keeps every tool call, in order. It kept only the last one before.
   - **Fix:** when Bedrock returns `AccessDeniedException`, the reply now quotes the message from Bedrock. It also says if the AWS Marketplace subscription for the model is not complete, or else names the Region where the role needs `bedrock:InvokeModel`. Before, every denial got the IAM hint. The log now records each denial, without the prompt or the pictures. See [IAM permissions](https://aws-samples.github.io/sample-connector-for-bedrock/providers/painter/#iam-permissions).
   - **Fix:** a `painter` stream now ends with a chunk that has a `finish_reason` before `[DONE]`: `length` at the 5-step limit, `content_filter` when the image model filtered the prompt or a picture, and `stop` otherwise. Before, every chunk had `finish_reason: null`, so a client that checks it could not tell that the reply was complete.

3. **BRClient Built from Source** - The images and the `lambda-web` package now build BRClient from the upstream source, at the commits that `scripts/brclient.source` pins. See [BRClient source](https://aws-samples.github.io/sample-connector-for-bedrock/home/deployment/#brclient-source).
   - The `lambda-web` package now serves BRClient at `/brclient/`. Before, `/brclient/` returned 404 on `lambda-web`.
   - This release pins upstream `main` plus the unmerged upstream pull request [#82](https://github.com/aws-samples/sample-client-for-amazon-bedrock/pull/82). A message with pictures gets a Download button that saves its pictures. A picture that the browser cannot save opens in a new tab, and an expired picture link shows a message.
   - Each artifact contains `brclient/.source`, which names the commits and the git tree it was built from.
   - Before each release, run `node scripts/resolve-brclient.mjs` and commit `scripts/brclient.source`. After upstream merges the pull request, the same command pins `main` only. See [Before a release](https://aws-samples.github.io/sample-connector-for-bedrock/home/deployment/#before-a-release).

4. **Model Lists for Keys Without a Group** - A key that is not in a group now lists only the models bound to it in `GET /v1/models`, `/user/model/list`, `/user/model/list-for-brclient` and the Claude Code Web (`/cc`) model menu. Before, these lists also showed the models of every group, and a call to one of those models was refused. A key in a group still lists its group's models and its own. The admin key, which cannot call these models, now gets an empty list from `/user/model/list-for-brclient`.

5. **Dependency Updates** - Dependencies with known vulnerabilities move to fixed releases.
   - The Claude Code Web backend image installs litellm 1.100.4, cryptography 46.0.7, anyio 4.14.2, certifi 2026.10.18, fsspec 2026.6.0, mcp 1.28.1, pyasn1 0.6.5 and urllib3 2.8.0. litellm 1.100.4 needs a newer boto3, so the AWS CLI in the workspace terminal also moves from 1.44.38 to 1.46.3.
   - cryptography and starlette keep known vulnerabilities that only a later major release fixes. They stay on their current major releases for now.
   - The BRConnector image does not change. Each build installs the newest releases that `package.json` allows, and these already include the fixes. The lockfile that the tests use now has these fixes too. zod stays on 3.25.76 in both, because its fix is only in zod 4.
   - The Claude Code Web web client is built with rollup 4.68.2 instead of 4.52.5.

6. **RDS Database Settings in the Templates** - The RDS database that `quick-build-brconnector.yaml` and `brconnector-ecs-fargate.yaml` create (`DatabaseMode` `Standalone`) has new settings.
   - `PGPassword` can be left empty. The stack then generates the database password into AWS Secrets Manager (the `PGPasswordSecretArn` output), and BRConnector reads it from there. A stack created with a password keeps it. An entered password is 8 to 128 letters and digits.
   - The new `PGStorageEncrypted` parameter encrypts the storage of the database. It has no default: choose `true` for a new stack. On an update, keep the current value, which is `false` for a stack created from an earlier template.
   - The database has deletion protection. To delete a stack, turn it off first. See [Deleting a stack](https://aws-samples.github.io/sample-connector-for-bedrock/home/deployment/#deleting-a-stack), which also shows how to delete the final snapshot that CloudFormation keeps.
   - When a stack update replaces the database, CloudFormation now keeps the old one: as a snapshot, or, while its deletion protection is on, as a running database outside the stack. Before, it deleted the old database without a snapshot.
   - In `brconnector-ecs-fargate.yaml`, `PGUser` is NoEcho and has no default.
   - The templates list the outbound rules of each security group (all IPv4 and IPv6 traffic, as before) and set the database to not publicly accessible (as before).

7. **Database Password from Secrets Manager** - When `PGSQL_PASSWORD_SECRET_ARN` is set, BRConnector reads the database password from that Secrets Manager secret instead of `PGSQL_PASSWORD`. The templates set it for `lambda` and `lambda-web` when they generate the password (item 6). See [Development](https://aws-samples.github.io/sample-connector-for-bedrock/user-manual/development/).

8. **Docs** - A GPT-6 Sol example and a note on `reasoning_effort` for GPT reasoning models with tools in [bedrock-runtime-openai](https://aws-samples.github.io/sample-connector-for-bedrock/providers/bedrock-runtime-openai/). The left sidebar shows the full navigation tree.

## Disclaimer

This connector is an open-source software aimed at providing proxy services for using Bedrock services. We make our best efforts to ensure the security and legality of the software, but we are not responsible for the users' behavior.

The connector is intended solely for personal learning and research purposes. Users shall not use it for any illegal activities, including but not limited to hacking, spreading illegal information, etc. Otherwise, users shall bear the corresponding legal responsibilities themselves. Users are responsible for complying with the laws and regulations in their respective jurisdictions and shall not use the connector for any illegal or non-compliant purposes. The developers and maintainers of this software shall not be liable for any disputes, losses, or legal liabilities arising from the use of this connector.

We reserve the right to modify or terminate the connector's code at any time without further notice. Users are expected to understand and comply with the relevant local laws and regulations.

If you have any questions regarding this disclaimer, please feel free to contact us through the open-source channels.

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This library is licensed under the MIT-0 License. See the LICENSE file.
