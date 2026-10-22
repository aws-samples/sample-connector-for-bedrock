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
