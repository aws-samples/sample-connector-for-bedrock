# 0008. Claude Code Web on by default, skipped when unsupported

Status: Accepted

## Context

`EnableClaudeCodeWeb` defaulted to `false`. A template Rule, `ClaudeCodeWebRequirements`, asserted three things when the switch was on: the compute type is not `lambda`, the stack has a database, and `BRConnectorVersion` is `latest` unless the compute type is `lambda-web`. A combination that broke one of them failed stack creation with an error. Claude Code Web needs the CodeBuild build of its backend image and AgentCore Runtime, so a stack that wanted it had to ask for it.

The goal is that a new stack ships Claude Code Web ready, like the preset `painter` model, and that the default parameters always create a stack.

## Decision

- `EnableClaudeCodeWeb` defaults to `true`.
- The condition that creates the Claude Code Web resources takes the three tests of the Rule: the switch is `true`, `ComputeType` is not `lambda`, `DeployDB` is true, and `BRConnectorVersion` is `latest` or `ComputeType` is `lambda-web`. `DeployDB` is exactly the Rule's database test for the compute types that remain.
- The Rule is removed. An unsupported combination creates a stack without Claude Code Web.
- The output `ClaudeCodeWebStatus` is always present. It says that Claude Code Web is deployed, or why it is not: the switch is off, the compute type is `lambda`, there is no usable database, or the version is pinned.

## Consequences

- A new stack takes longer to create, because the CodeBuild build of the backend image runs during creation, and the account pays for AgentCore Runtime. `EnableWebSearch` is also `true` by default, and each search is billed. A user who does not want this sets `EnableClaudeCodeWeb` to `false`.
- A user who asked for Claude Code Web on an unsupported combination gets a stack without it instead of an error, and must read `ClaudeCodeWebStatus` to learn why.
- The switch takes effect only when the stack is created. A console update keeps the value the stack has, which is `false` for a stack created before this change, so nothing of Claude Code Web is created and `MyEC2Instance` renders as before. With the AWS CLI, an update must pass `UsePreviousValue=true` for `EnableClaudeCodeWeb`. Without it, the update takes the new default, creates Claude Code Web, and on `ec2` changes the UserData, which stops and starts the instance. The same holds for `PGPassword`.

## Alternatives considered

- **Keep the Rule and fail the stack.** The default parameters would then fail for `lambda`, a pinned version, or no database, and a new default of `true` would break every such creation.
- **Keep the default `false`.** No stack would break and no cost would appear, but Claude Code Web would stay hidden behind a switch that most admins never turn on.
