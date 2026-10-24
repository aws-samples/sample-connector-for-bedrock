# FAQ

## 如何使用聊天 API 中上传文档

请注意：当前只有 bedrock-converse 提供程序上的模型支持文档上传。

上传文档的 API 声明如下：

```text

POST /v1/chat/completions
Content-Type: application/json
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

{
  "messages":[{
    "role":"user",
    "content":[
      {"type":"text","text":"Summary this doc"},
      {
        "type":"doc",
        "doc":{
          "name":"4147b64a76039b4b75264726ebf6143f9e132b1e",
          "format":"pdf","size":59368,
          "source":{
            "bytes":{
              "0":37,"1":80,"2":68,"3":70,"4":45,"5":49,...,"59367":70
            }
          }
        }
      }
    ]
  }],
  "stream":true,
  "model":"claude-sonnet-3",
  "temperature":0.5,
  "presence_penalty":0,
  "frequency_penalty":0,
  "top_p":1,
  "max_tokens":4000
}
```

需要使用 Javascript 将本地的文档转化成 bytes json 的形式。

## 如何配置默认模型支持？

您只要创建一个新的模型，名称为 default 即可。

## 可以画图吗？

可以，配置并使用 painter 或者 nova-canvas 为提供器的模型即可。

## 模型名称中的斜杠 {#model-wildcard}

请为每个要提供的上游模型 id 在 BRConnector 里配置一个模型，调用时使用模型名称。配置的模型名称本身可以包含 `/`，例如 `team/nova-micro`，这样的名称会原样使用。

从 0.0.43 起，`<名称>/<模型 id>` 形式的模型字符串如果本身不是已配置的模型名称，会返回 HTTP 400；斜杠后面的部分不再用来选择上游模型 id。

## 聊天请求中的图片 URL {#image-urls}

聊天模型（例如 `bedrock-converse`）接受 `data:` URL（`data:image/png;base64,...`）或 `http(s)` URL 形式的图片。`bedrock-runtime-anthropic` 和 `bedrock-runtime-openai` 会把请求原样转发给 Bedrock，本节内容不适用于它们。

`nova-canvas` 模型接受 `http(s)` URL，或指向模型 `s3Bucket` 配置中存储桶的 `s3://` URL；不读取 `data:` URL。指向其他存储桶的 `s3://` URL 会返回 HTTP 400，消息为 `s3:// image URLs must point to the model's s3Bucket.`。

BRConnector 自行下载 `http(s)` 图片，只接受满足以下条件的 URL：

- 主机位于公网地址，每次重定向后都会重新检查；私有、回环、链路本地及其他保留地址段不被接受；
- 图片在 15 秒内下载完成，重定向不超过 3 次；
- 响应的内容类型为 `image/*`，大小不超过 10 MiB。

其他 `http(s)` URL 会返回 HTTP 400，消息为 `Image URL is not allowed: use an http(s) URL on a public address.`。对于聊天模型，使用 `http`、`https`、`data` 以外协议的 URL 也会返回同样的错误。聊天模型可以改用 `data:` URL 发送私有网络中的图片。

图片 URL 由 BRConnector 所在主机直接下载，不经过代理：`HTTPS_PROXY` 和 `HTTP_PROXY` 对其不生效。没有直接互联网出口的部署，请以 `data:` URL 向聊天模型发送图片。

以 Bedrock 自身格式发送的内容块（例如 `image`、`document`、`video`，包括 `toolResult` 中的内容块）必须内联携带内容。`source` 中含 `s3Location` 时会返回 HTTP 400，消息为 `s3Location sources are not accepted; send the content inline.`。
