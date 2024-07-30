# Quick Deploy BRConnector using Cloudformation

## Supported Region
Cloudformation template are verified in following regions:
- us-east-1
- us-west-2

## Prerequisites
Enable Claude 3 Sonnet or Haiku in your region - If you are new to using Anthropic models, go to the [Amazon Bedrock console](https://console.aws.amazon.com/bedrock/) and choose **Model access** on the bottom left pane. Request access separately for Claude 3 Sonnet or Haiku.

## Deploy Guide
- Download [quick-build-brconnector.yaml](quick-build-brconnector.yaml) and upload to Cloudformation console or click this button to launch directly.

[![attachments/quick-build-brconnector/launch-stack.png](attachments/quick-build-brconnector/launch-stack.png)](https://console.aws.amazon.com/cloudformation/home#/stacks/create/template?stackName=brconnector1&templateURL=https://sample-connector-bedrock.s3.us-west-2.amazonaws.com/quick-build-brconnector.yaml)

reference detail deploy document: https://aws-samples.github.io/sample-connector-for-bedrock/home/deployment/

