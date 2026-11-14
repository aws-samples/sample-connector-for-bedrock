# 0006. Painter storage from the stack

Status: Accepted

## Context

The preset `painter` model must draw on a new stack with no S3 or IAM work by the admin. Painter needs a bucket, a Region and a key prefix. The template already has three buckets. The log bucket must stay empty, and the lambda-web code bucket holds deployment packages. The Claude Code Web workspace bucket holds user files and is retained, but it exists only when Claude Code Web is on, and Claude Code Web can be off. BRConnector runs on four compute types, and each one gets its settings in a different way. On `ec2` the settings reach the container only through the `docker run` line in the instance's UserData.

## Decision

- The stack shares `ClaudeCodeWebWorkspaceBucket` with painter. The bucket is always created, because painter has no switch. Its logical id and `BucketName` stay the same, because a change would replace the retained bucket on every Claude Code Web stack and leave the old one behind. Painter uses the prefix `painter/`. Claude Code Web keeps `user_data/`, and its workspace role now reaches only `user_data/`.
- `lambda`, `ecs` and `lambda-web` get `PAINTER_S3_BUCKET`, `PAINTER_S3_REGION` and `PAINTER_S3_PREFIX` as environment variables.
- `ec2` gets the same three values as JSON in the SSM parameter `/brconnector/instance/<instance id>/painter`. When `PAINTER_S3_BUCKET` is unset, BRConnector reads its instance id from the instance metadata service and then reads that parameter. The template does not change `MyEC2Instance`.
- The bucket picks the source. When the model config has `s3Bucket`, the config gives all three settings, as before (`s3Region` is required, and `s3Prefix` defaults to empty). Otherwise the stack gives all three. With neither, painter answers with an error that names both fixes.
- The role that runs BRConnector gets `s3:PutObject` and `s3:GetObject` on `<bucket>/painter/*`, and `aws-marketplace:Subscribe` and `aws-marketplace:ViewSubscriptions`, so the first call to a Stability model subscribes the account.

## Consequences

- An existing `ec2` stack gets painter storage from a template update without a restart, once it runs an image with this change. A UserData change would stop and start the instance. Painter has no switch, so every existing `ec2` stack would see that change on its next update, and UserData does not rerun on an existing instance, so the restart would not deliver the settings anyway.
- An existing `ecs` stack rolls its tasks to a new task definition on the update. `lambda` and `lambda-web` get a new function configuration.
- A stack that had Claude Code Web on and was later updated with it off still owns the retained bucket outside the stack. The update can then fail because a bucket with that name exists. The ways out are to move the files and delete the bucket, or to import it into the stack with the logical id `ClaudeCodeWebWorkspaceBucket`. This case is rare, and the import was not tested.
- A model config with its own bucket keeps storing where it stored before, also when the stack has a bucket. A config with `s3Bucket` and no `s3Prefix` does not start using `painter/`.
- A failed lookup on `ec2` is not cached, so a stack that is updated while BRConnector runs is picked up on the next painter request. Each failed request costs one metadata call and one SSM call.

## Alternatives considered

- **Add the variables to the ec2 `docker run` line.** New stacks would get them the same way as the other compute types. Every existing `ec2` stack would be stopped and started on its next template update, with no gain.
- **A new bucket for painter.** It would be one more retained bucket per stack.
- **A parameter that turns painter off.** The bucket would then exist only for some stacks, and the template would need a second condition for every painter resource. A stack that does not want painter can leave the model ungranted.
- **Each S3 field falls back on its own.** A config with its own bucket could then be paired with the stack's Region, and an existing config without `s3Prefix` would move its pictures to `painter/`.
