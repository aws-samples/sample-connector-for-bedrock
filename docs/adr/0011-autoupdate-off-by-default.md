# 0011. AutoUpdate off by default

Status: Accepted

## Context

`AutoUpdateBRConnector` defaulted to `true`. With `ComputeType` `ec2`, an SSM association runs every day at 00:00 UTC, pulls the public `latest` image and restarts BRConnector on it. With `lambda`, an EventBridge rule starts a CodeBuild project at the same time, which copies the `-lambda:latest` image to the stack's private ECR repository and updates the function. Both move the stack to `latest` even when `BRConnectorVersion` is pinned. `ecs` and `lambda-web` have no nightly job. `brconnector-ecs-fargate.yaml` has its own `AutoUpdateBRConnector`, also `true` by default: an EventBridge rule forces a new deployment of the ECS service once a day, which pulls the `BRConnectorVersion` tag again.

So a stack created with the default parameters took each release on the night it was published, breaking changes included, such as a model that a release removes. Only the image changed. A release that needs a template change, such as the storage of the preset `painter` model, then ran on a template that did not have it.

## Decision

- `AutoUpdateBRConnector` defaults to `false` in `quick-build-brconnector.yaml` and in `brconnector-ecs-fargate.yaml`. An admin sets `true` to turn the nightly update on.
- The update itself does not change. It runs at the same time, uses the same `latest` tag on `ec2` and `lambda`, and still replaces only the image.
- Each parameter description says what `true` does: when it runs, that it replaces only the image and not the template, and, in `quick-build-brconnector.yaml`, that it ignores a pinned `BRConnectorVersion`.

## Consequences

- A new stack stays on the release it was created with until an admin updates it or turns the nightly update on.
- A console update keeps the value the stack has, because the console fills in the current value of each parameter. `aws cloudformation deploy` also keeps it when `--parameter-overrides` leaves the parameter out. `aws cloudformation update-stack` must pass `UsePreviousValue=true` for `AutoUpdateBRConnector`. Without it, the update takes the new default `false` and deletes the nightly update: on `ec2` the SSM association, its document and its log bucket; on `lambda` the EventBridge rule, the CodeBuild project, its roles and its security group; in `brconnector-ecs-fargate.yaml` the rule and its Lambda function. The stack then no longer updates BRConnector.
- Changing the value in either direction changes no other resource and no output. The `ec2` instance is not stopped, started or replaced, and the `lambda` function and the ECS service are not updated. The template tests check this for each compute type and for the ECS Fargate template.

## Alternatives considered

- **Make the nightly update follow a pinned `BRConnectorVersion`.** Pinned stacks would stop moving, but a stack on `latest`, which is the default version, would still take every release unattended, and its image and template would still drift apart. It also changes how the update works, not only its default.
- **Keep the default `true` and document the risk.** Admins who never read the parameter would still get breaking releases overnight.
- **Change only `quick-build-brconnector.yaml`.** The ECS Fargate template would keep its daily redeploy by default, and the two templates would disagree about the same parameter.
