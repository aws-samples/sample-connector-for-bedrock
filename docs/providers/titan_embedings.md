# titan_embedings

> Since Docker image version 0.0.18

Using this Provider, you can use the Titan text embeddings model to output embeddings (float arrays) for text. The model configuration can be referenced in this document: [Amazon Titan Embeddings Text](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-titan-embed-text.html)

## Parameter Configuration

| Key     | Type      | Required     | Default value | Description |
| ------------- | -------| ------------- | ------------- | ------------- |
| modelId  | string   | Y    |  |   Model id, `amazon.titan-embed-text-v2:0` or `amazon.titan-embed-text-v1`  |
| regions  | string[] or string   | N     | Same as the AWS_DEFAULT_REGION environment variable | If you have applied for and specified multiple regions, one region will be randomly selected for the call. This feature can effectively alleviate performance bottlenecks.  |
| dimensions  |  number   | N     | 1024 | Output dimension, only applicable to the `amazon.titan-embed-text-v2:0` model.  |
| normalize  |  boolean   | N     | true | Flag indicating whether or not to normalize the output embeddings, only applicable to the `amazon.titan-embed-text-v2:0` model  |

An example configuration for titan_embeddings is as follows:

```json
{
  "modelId": "amazon.titan-embed-text-v2:0",
  "regions": [
    "us-east-1",
    "us-west-2"
  ]
}
```