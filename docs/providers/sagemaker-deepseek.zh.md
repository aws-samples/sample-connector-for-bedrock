# sagemaker-deepseek

> Since Docker image version 0.0.27

这个提供器是为了适配部署在 SageMaker 中的 DeepSeek R1 类的模型。

## 部署情形

分别测试了下面几种方法在 SageMaker 中部署 DeepSeek-R1 模型：

**1. 使用 lmi 引擎部署**

会直接输出 content，并且在大多数情形下会包含一个 `</think>` 的标签。

请参考部署脚本：

<https://github.com/aws-samples/sample-connector-for-bedrock/tree/main/notebook/SageMaker>

**2. 使用 JumpStart 直接部署**

使用 JumpStart 会直接输出标准的 DeepSeek 格式，即包含了 `reasoning_content` 属性的内容，请把  platform 设置为 `deepseek`。

**3. 使用 Bedrock 部署**

会直接输出 content，并且在大多数情形下会包含一个 `</think>` 的标签。

还有别的区别是：他会输出 `data:` 等信息。本提供器已经处理了这部分差异。

## 配置

```json
{
  "regions": [
    "us-east-1"
  ],
  "endpointName": "<your-sagemaker-endpoint-name>",
  "thinking": true,
  "platform": "deepseek"
}
```

| Key     | Type      | Required     | Default value | Description |
| ------------- | -------| ------------- | ------------- | ------------- |
| endpointName  | string   | Y    |  |   SageMaker endpoint 名称  |
| regions  | string[] or string   | N     | ["us-east-1"] |   您可以把模型部署在多可用区，可增加模型的可用性。 |
| platform  | string  | N     |  |   如果是 JumpStart，请填写 `deepseek`，其他情况不必填写。 |
| thinking  | boolean  | N     | false |   在 lmi 模式下，启用 thinking 会强制在prompt 后面加一个 `<think>` 标签 |
