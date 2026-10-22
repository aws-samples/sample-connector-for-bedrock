# FAQ

## How to support documents in chat

Please note: Document uploads are currently only supported by models on the bedrock-converse provider.

The API declaration for uploading documents is as follows:

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
  "model":"claude-sonnet-3"
  ,"temperature":0.5,
  "presence_penalty":0,
  "frequency_penalty":0,
  "top_p":1,
  "max_tokens":4000
}
```

### How to Configure Default Model Support?

You just need to create a new model named `default`.

### Can You Draw Diagrams?

Yes, you can draw diagrams by configuring and using models with providers such as `painter` or `nova-canvas`.


## Model Names That Contain a Slash {#model-wildcard}

Configure one model in BRConnector for each upstream model id you want to offer, and call it by its name. A configured model name may itself contain `/`, for example `team/nova-micro`, and is used as it is.

Since 0.0.43, a model string `<name>/<model id>` that is not itself a configured model name gets HTTP 400; the part after the slash no longer selects the upstream model id.
