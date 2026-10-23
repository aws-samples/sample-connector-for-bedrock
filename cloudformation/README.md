# Quick Deploy BRConnector using Cloudformation

## Supported Region
Every compute type works in us-east-1, us-east-2, us-west-1, us-west-2, ca-central-1, sa-east-1, eu-west-1, eu-west-2, eu-west-3, eu-central-1, eu-north-1, ap-northeast-1, ap-northeast-2, ap-northeast-3, ap-southeast-1, ap-southeast-2 and ap-south-1. Claude Code Web needs AgentCore Runtime, which is available in all of them except ap-northeast-3.

## Prerequisites
Enable Claude Sonnet 5.5 or Haiku 5.5 in your region - If you are new to using Anthropic models, go to the [Amazon Bedrock console](https://console.aws.amazon.com/bedrock/) and choose **Model access** on the bottom left pane. Request access separately for Claude Sonnet 5.5 or Haiku 5.5.

## Deploy Guide
- Download [quick-build-brconnector.yaml](quick-build-brconnector.yaml) and upload to Cloudformation console or click this button to launch directly.

[![attachments/quick-build-brconnector/launch-stack.png](attachments/quick-build-brconnector/launch-stack.png)](https://console.aws.amazon.com/cloudformation/home#/stacks/create/template?stackName=brconnector1&templateURL=https://sample-connector-bedrock.s3.us-west-2.amazonaws.com/quick-build-brconnector.yaml)

reference detail deploy document: https://aws-samples.github.io/sample-connector-for-bedrock/home/deployment/

