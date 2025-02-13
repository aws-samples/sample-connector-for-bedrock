# bedrock-deepseek

> 自 Docker 镜像版本 0.0.23 起可用

LLM 统一接口。

用于向部署在 Amazon Bedrock 上的 DeepSeek 模型发送消息。此提供程序支持 Think 标签，这些标签在输出中会被渲染为 markdown 引用块。

## 配置

通过 Amazon Bedrock API 调用 DeepSeek 模型。此提供程序允许您配置和使用部署在 Bedrock 上的 DeepSeek 模型。

| 键     | 类型      | 是否必需     | 默认值 | 描述 |
| ------------- | -------| ------------- | ------------- | ------------- |
| modelId  | string   | 是    |  |   部署的 DeepSeek 模型的 ARN  |
| regions  | string[] 或 string   | 否     | ["us-east-1"] |   如果您已申请并指定了多个区域，则会随机选择一个区域进行调用。此功能可以有效缓解性能瓶颈。  |
| maxTokens  |  number   | 否     | 8192 | 默认的最大令牌数，对应标准 API 中的 max_tokens 参数。如果在 API 中未指定，将使用此值。   |

配置示例：

```json
{
  "modelId": "arn:aws:sagemaker:region:xxxxx:endpoint/ds-endpoint",
  "regions": [
    "us-west-2"
  ],
  "maxTokens": 8192
}
```
