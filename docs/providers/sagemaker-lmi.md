# sagemaker-lmi

> Since Docker image version 0.0.8

Connect to Sagemaker LLM modes.

## Configuration

```json
{
  "regions": [
    "us-east-1"
  ],
  "endpointName": "<your-sagemaker-endpoint>"
}
```

| Key     | Type      | Required     | Default value | Description |
| ------------- | -------| ------------- | ------------- | ------------- |
| endpointName  | string   | Y    |  |   Sagemaker endpoint name  |
| regions  | string[] or string   | N     | ["us-east-1"] |   If you have applied and specified multiple regions, then a region will be randomly selected for the call. This feature can effectively alleviate performance bottlenecks.  |

Then grant this model to  group or API key.

## Deploy models via Sagemaker LMI

Sagemaker LMI already supports direct deployment of some popular open-source LLM models, enabling message API-style calls without the need to write custom inference programs.

Please refer to this link to view the model deployment:

<https://github.com/aws-samples/sample-connector-for-bedrock/tree/main/notebook/sagemaker>
