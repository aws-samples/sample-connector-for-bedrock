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
