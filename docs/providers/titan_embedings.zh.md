# titan_embedings

> Since Docker image version 0.0.18

使用这个 Provider，您可以使用 Titan text embeddings 模型输出文本的 embeddings（float 数组）。模型的配置可以参考这篇文档：[Amazon Titan Embeddings Text](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-titan-embed-text.html)

## 参数配置

| Key     | Type      | Required     | Default value | Description |
| ------------- | -------| ------------- | ------------- | ------------- |
| modelId  | string   | Y    |  |   Model id,  `amazon.titan-embed-text-v2:0`  或者 `amazon.titan-embed-text-v1`  |
| regions  | string[] or string   | N     | 与环境变量AWS_DEFAULT_REGION一致 |   如果您已经申请并指定了多个地区，那么将会随机选择一个地区进行调用。这个功能可以有效缓解性能瓶颈。  |
| dimensions  |  number   | N     | 1024 | 输出的维度，仅适用于 `amazon.titan-embed-text-v2:0` 模型。  |
| normalize  |  boolean   | N     | true | Flag indicating whether or not to normalize the output embeddings，仅适用于 `amazon.titan-embed-text-v2:0` 模型  |

titan_embedings 的配置示例如下：

```json
{
  "modelId": "amazon.titan-embed-text-v2:0",
  "regions": [
    "us-east-1",
    "us-west-2"
  ]
}
```
