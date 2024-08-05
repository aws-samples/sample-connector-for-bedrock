# sagemaker-lmi

> Since Docker image version 0.0.8

使用 Sagemaker 部署自定义模型。

## 配置

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
| endpointName  | string   | Y    |  |   Sagemaker endpoint 名称  |
| regions  | string[] or string   | N     | ["us-east-1"] |   您可以把模型部署在多可用区，可增加模型的可用性。 |

然后将此模型授予组或 API key。

## 部署模型

Sagemaker LMI 已经支持了部分流行的开源 LLM 模型的直接部署，无需编写自定义的推理程序即可支持 message API 风格的调用。

请参考这个链接查看模型部署：

<https://github.com/aws-samples/sample-connector-for-bedrock/tree/main/notebook/sagemaker>
