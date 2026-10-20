# aws-executor

> Since Docker image version 0.0.10

An AWS command executor.

With this Provider, you can execute AWS command using natural language and get the execution results.

The role for executing AWS commands and the role for running BRConnector are currently the same, so you need to grant the appropriate permissions to the current role.

!!! warning
    Do not grant write permissions to critical resources, as the command lines parsed by the current AI are not stable. However, you can still refer to the command lines suggested by the AI.

## Model configuration

The parameter configuration is as follows:

Name: some-model

Provider: aws-executor

Configuration:

```json
{
  "localLlmModel": "claude-sonnet-5-5-chat"
}
```

localLlmModel must be configured as a model that supports function calling and already exists in BRConnector.

!!! note
    You need to configure a Claude model on the bedrock-converse provider (such as the `claude-sonnet-5-5-chat` preset), as other models do not yet have the capability for function calling; if the model was created earlier on another provider, switch its provider to bedrock-converse and rename the key 'model_id' to 'modelId'.

    And You must install aws cli v2 in the BRConnector host.

## Screenshots in BRClient

![sampe executor 1](./screenshots/aws-exec-1.png)

![sampe executor 2](./screenshots/aws-exec-2.png)
