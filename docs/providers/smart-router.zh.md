# smart-router

> 适用于 Docker 镜像版本 0.0.21 及以上

此 Provider 可以自动对模型进行路由。

你需要在后台配置路由规则，并且这些规则也是基于自然语言/提示词的。

## 配置

```json
{
  "rules": [
    {
      "name": "my-painter",
      "description": "draw a picture"
    },
    {
      "name": "amazon-nova-pro",
      "description": "When user talk about aws or amazon"
    },
    {
      "name": "claude-3-sonnet",
      "description": "uncertain"
    }
  ],
  "localLlmModel": "amazon-nova-lite"
}
```

- name：模型的名字，指的是 BRConnector 中配置过的模型名字, 这个 key 请务必保留。
- description：对于此模型的描述。


!!!tip

    上述配置会完整的输入到系统提示词中，所以，为了提高意图识别的准确性，你可以增加任意其他的 key， 如 "when"， "except" 等


| 键名 | 类型 | 是否必填 | 默认值 | 描述 |
|------|------|----------|--------|------|
| localLlmModel | string | 是 |  | 选择支持**函数调用**的本地模型 |
| rules | json | 是 |  | 请参考上面的配置示例 |

!!!tip

    如果路由器没有选择到任何模型，他会把模型的名字降级为 "default"，所以你的模型中最好有一个名字为 "default" 的模型。