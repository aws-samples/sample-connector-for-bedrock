# FAQ

## How to support documents in chat

Please note: Document uploads are currently only supported in Claude 3.

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


## Model Wildcard

You can now configure a custom model and use slashes in the model name within API calls.

Here is an example of an API call:

```json
POST {{baseURL}}/chat/completions
Authorization: Bearer {{key}}
Content-Type: application/json

{
    "model": "bedrock/us.amazon.nova-micro-v1:0",
    "messages": [
        {
            "role": "user",
            "content": "Tell me a joke that only programmers would understand"
        }
    ],
    "max_tokens": 5120,
    "stream": true
}
```

To use this method, you must:

1. Configure a custom model with the model name `bedrock` in the backend.
2. The model name after the slash can be customized but must match the original vendor's model name.
3. The provider will prioritize the model name after the slash, then consider the model name configured in the backend, and finally fall back to the original name if necessary.

Currently, providers that support this usage include: `bedrock_converse`, `openai_compatiable`.