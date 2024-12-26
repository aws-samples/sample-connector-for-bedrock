
# nova-canvas

> 适用于 Docker 镜像版本 0.0.20 及以上

此 Provider 实现了 nova-canvas 模型的多种图像处理和生成能力。

## 配置

```json
{
  "regions": ["us-east-1"],
  "s3Bucket": "<your-bucket>",
  "s3Prefix": "<your-prefix>",
  "s3Region": "us-east-1",
  "paintModelId": "amazon.nova-canvas-v1:0",
  "localLlmModel": "claude35"
}
```

| 键名 | 类型 | 是否必填 | 默认值 | 描述 |
|------|------|----------|--------|------|
| localLlmModel | string | 是 | - | 选择支持**函数调用**的本地模型 |
| paintModelId | string | 是 | amazon.nova-canvas-v1:0 | 当前仅支持此值 |
| s3Bucket | string | 是 | - | 用于存储生成的图像，请确保 IAM 权限设置正确 |
| s3Prefix | string | 否 | - | S3 前缀，与日期组合形成最终的 S3 键 |
| s3Region | string | 是 | - | S3 存储桶所在区域 |
| regions | string[] | 否 | ["us-east-1"] | paintModelId 可用的区域 |

## 功能概述

支持使用自然语言进行多轮图像处理对话。主要功能包括：

| 功能 | 任务类型 | 示例 | 注意事项 |
|------|---------|------|----------|
| 文生图 | TEXT_IMAGE | "生成一只可爱的小猫" | - |
| 图生图 | TEXT_IMAGE | "参考此图生成一只小猫：https(s3)://url..." | 可能触发 IMAGE_VARIATION |
| 去除背景 | BACKGROUND_REMOVAL | "移除此图片背景：https(s3)://url..." | - |
| 更改前景 | INPAINTING | "将图中的女性模特换成亚洲模特" | 需明确指出要更改的前景对象。多轮对话中如果可以推测出前景，可以无需指定 |
| 更改背景 | OUTPAINTING | "将图中女性模特的背景换成室内场景" | - |
| 生成变体 | IMAGE_VARIATION | "基于上图生成一些变体" | - |
| 图片上色 | COLOR_GUIDED_GENERATION | "给图片添加红橙色调" | - |

此外，您可以在对话中指定生成图片的数量和尺寸。

详细示例请参考：<https://docs.aws.amazon.com/nova/latest/userguide/image-gen-access.html>

## 其他说明

API 请求的时候，如果 stream 是 false 的话，会输出如下的格式：

```json
{
  "model": "some-model",
  "choices": [
    {
      "index": 0,
      "message": {
        "content": "I'll help you generate an image of a cat in the style of Qi Baishi, the renowned Chinese painter known for his watercolor works with bold, expressive brushstrokes and a distinctive traditional Chinese artistic style.\n\nLet me use the txt2img function to create this image. I'll craft a prompt that captures both the cat and Qi Baishi's artistic style.",
        "role": "assistant"
      }
    },
    {
      "message": {
        "tool_calls": [
          {
            "type": "function",
            "function": {
              "name": "txt2img",
              "arguments": {
                "prompt": "A lovely cat painted in Qi Baishi style, traditional Chinese ink and wash painting, expressive brushstrokes, minimalist composition, elegant and graceful, watercolor technique",
                "width": 512,
                "height": 512,
                "negative_prompt": "nsfw, photorealistic, western art style, digital art"
              }
            }
          }
        ]
      }
    }
  ],
  "usage": {
    "completion_tokens": 235,
    "prompt_tokens": 2529,
    "total_tokens": 2764
  },
  "images": [
    "https://a-s3-signed-url"
  ]
}
```
