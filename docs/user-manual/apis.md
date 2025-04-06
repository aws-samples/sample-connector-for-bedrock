# API Reference

## LLM API

### Completions

#### An ordinary request

```
POST /v1/chat/completions
Content-Type: application/json
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

{
  "model": "claude-3-sonnet",
  "messages": [
    {
      "role": "user",
      "content": "ping"
    }
  ],
  "stream": true,
  "temperature": 1,
  "max_tokens": 4096
}
```

#### Including a picture in the request

```
POST /v1/chat/completions
Content-Type: application/json
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

{
  "model": "claude-3-sonnet",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type":"text": 
          "text":"Describe this picture."
        },
        {
          "type": "image_url",
          "image_url": { 
            "url": "data:image/webp;base64,...."
          }
        }
      ]
    }
  ]
}
```

- image url can be a base64 string or a http(s) url.

#### Including a docuement in the request

```
POST /v1/chat/completions
Content-Type: application/json
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

{
  "model": "claude-3-sonnet",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type":"text": 
          "text":"Describe this document."
        },
        {
          "type":"doc",
          "doc": { 
            "name": "xxx",
            "format": "pdf",
            "size": 900,
            "source": {
              "bytes": {
                0:35,1:35,2:37,...
              }
            }
          }
        }
      ]
    }
  ]
}
```

#### Function calling (tool use)

Request

```
POST /v1/chat/completions
Content-Type: application/json
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

{
  "model": "c37",
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "query-weather",
        "description": "query weather",
        "parameters": {
          "type": "object",
          "properties": {
            "latitude": {
              "type": "string",
              "description": "latitude"
            },
            "longitude": {
                "type": "string",
                "description": "longitude"
            }
          }
        },
        "required": [
          "latitude",
          "longitude"
        ]
      }
    }
  ],
  "stream": true,
  "tool_choice": "auto",
  "messages": [
    {
      "role": "system",
      "content": "You are an expert. Current time: 2024-11-13T08:13:17.778Z."
    },
    {
      "role": "user",
      "content": "I wanna query weather of Beijing."
    }
  ]
}
```

Response (stream: false)

```json
{
  "id": "1028c350-da16-4ae0-bcce-77e877f90695",
  "model": "c37",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "reasoning_content": "The user wants to query the weather for Beijing. To use the `query-weather` function, I need to provide the latitude and longitude of Beijing.\n\nBeijing's approximate coordinates are:\n- Latitude: 39.9042° N (which would be \"39.9042\")\n- Longitude: 116.4074° E (which would be \"116.4074\")\n\nWith these coordinates, I can call the `query-weather` function to get the current weather information for Beijing.",
        "content": "I'd be happy to check the weather in Beijing for you. I'll need to use the coordinates for Beijing to make the query.",
        "tool_calls": [
          {
            "id": "tooluse_su_WaAeJQviJSDZ5BPXNyA",
            "type": "function",
            "function": {
              "name": "query-weather",
              "arguments": "{\"latitude\":\"39.9042\",\"longitude\":\"116.4074\"}"
            }
          }
        ]
      }
    }
  ],
  "usage": {
    "completion_tokens": 219,
    "prompt_tokens": 449,
    "total_tokens": 668
  }
}
```

Response (stream: true)

```
data: {"id":"chatcmpl-689a9c21-4305-4a56-a32a-b0781d4ebcc0","created":1743912748,"object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant","content":"","reasoning_content":"The"},"finish_reason":null,"logprobs":null}],"model":"c37"}

...

data: {"id":"chatcmpl-689a9c21-4305-4a56-a32a-b0781d4ebcc0","created":1743912750,"object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":" that"},"finish_reason":null,"logprobs":null}],"model":"c37"}

...

data: {"id":"chatcmpl-689a9c21-4305-4a56-a32a-b0781d4ebcc0","created":1743912750,"object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant","tool_calls":[{"index":0,"id":"tooluse_uz8oUJ90TQuISdaP1yaU2A","type":"function","function":{"name":"query-weather","arguments":""}}]},"finish_reason":null,"logprobs":null}],"model":"c37"}

data: {"id":"chatcmpl-689a9c21-4305-4a56-a32a-b0781d4ebcc0","created":1743912751,"object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant","tool_calls":[{"index":0,"function":{"arguments":"{\"lat"}}]},"finish_reason":null,"logprobs":null}],"model":"c37"}

...

data: {"id":"chatcmpl-689a9c21-4305-4a56-a32a-b0781d4ebcc0","created":1743912751,"object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant","tool_calls":[{"index":0,"function":{"arguments":"74\"}"}}]},"finish_reason":null,"logprobs":null}],"model":"c37"}

data: {"id":"chatcmpl-689a9c21-4305-4a56-a32a-b0781d4ebcc0","created":1743912751,"object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"tool_use","logprobs":null}],"model":"c37"}

data: {"id":"chatcmpl-689a9c21-4305-4a56-a32a-b0781d4ebcc0","created":1743912751,"object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop","logprobs":null}],"usage":{"completion_tokens":189,"prompt_tokens":449,"total_tokens":638},"model":"c37"}

```

### Embeddings

```
POST {{hostLocal}}/v1/embeddings
Content-Type: application/json
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

{
  "model": "your-embedding-model",
  "input": "Hello world."
}
```

### List models

```
GET /v1/models
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## Admin API

### API key

#### Create an api key

```
POST /admin/api-key/apply
Content-Type: application/json
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

{
  "name": "jack",
  "group_id": 1,
  "role": "user",
  "email": "",
  "month_quota": 1.00
}
```

#### Create an api key with admin role

```
POST /admin/api-key/apply
Content-Type: application/json
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

{
  "name": "rob",
  "group_id": 1,
  "role": "admin",
  "email": ""
}
```

#### Update and api key's info

```
POST /admin/api-key/update
Content-Type: application/json
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

{
  "id": 2,
  "name": "jack",
  "month_quota": 10.00
}
```

#### Recharge up an API key

```
POST /admin/api-key/recharge
Content-Type: application/json
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

{
  "api_key": "br-xxxxxxxxxxxxxxx",
  "balance": 0.23
}
```

#### Recharge history

```
GET /admin/payment/list?key_id=
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

#### List api keys

```
GET /admin/api-key/list?q=&name=&group_id=&role=&limit=10&offset=
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

#### Delete an api key

```
POST /admin/api-key/delete
Content-Type: application/json
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

{
  "id": 1
}
```

### Model

#### List models

```
GET /admin/model/list?q=&limit=10&offset=
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

#### Create a model

```
POST /admin/model/save
Content-Type: application/json
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

{
  "name": "xxxx",
  "group_id": 1,
  "multiple": false, 
  "config": "{\"modelId\": \"somevalue\"}", 
  "provider": "bedrock-converse",
  "price_in": 1,
  "price_out":3
}
```

#### Update a model

```
POST /admin/model/save
Content-Type: application/json
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

{
  "id": 1,
  "name": "xxxx",
  "group_id": 1,
  "multiple": false, 
  "config": "{\"modelId\": \"somevalue\"}", 
  "provider": "bedrock-converse",
  "price_in": 1,
  "price_out":3
}
```

#### Delete a model

```
POST /admin/model/delete
Content-Type: application/json
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

{
  "id": 1
}
```

### Webhook

#### List webhook

```
GET /admin/bot/feishu/list?q=&limit=10&offset=
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

#### Create a webhook

```
POST /admin/bot/feishu/save
Content-Type: application/json
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

{
  "name": "xxxx",
  "config": "{\"appId\": \"cli_xxxxx\", \"apiKey\": \"br-xxxxx\", \"modelId\": \"claude-3-sonnet\", \"appSecret\": \"xxxxx\" }", 
  "provider": "bedrock-converse"
}
```

#### Update a webhook

```
POST /admin/bot/feishu/save
Content-Type: application/json
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

{ 
  "appId": "cli_xxxxx", 
  "apiKey": "br-xxxxx", 
  "modelId": "claude-3-sonnet", 
  "appSecret": "xxxxx" 
}
```

#### Delete a webhook

```
POST /admin/bot/feishu/delete
Content-Type: application/json
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

{
  "id": 1
}
```

### Group

#### List groups

```
GET /admin/group/list?q=&limit=10&offset=
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

#### Delete a group

```
POST /admin/group/delete
Content-Type: application/json
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

{
  "id": 1
}
```

### Model Authorization

- List models of a group
- Authorize the model to a group
- Deauthorize the model from a group
- List models of an api key
- Authorize the model to an api key
- Deauthorize the model from an api key

### Chat records

#### List sessions

```
GET /admin/session/list?q=&limit=10&offset=&key_id=
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

List threads / histories

```
GET /admin/thread/list?q=&limit=10&offset=&key_id=&session_id=
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## User API

#### My sessions

```
GET /user/session/list?q=&limit=10&offset=
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

#### My session detail

```
GET /user/session/detail/1
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

#### My threads / histories

```
GET /user/thread/list?q=&limit=10&offset=&session_id=
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

#### My thread detail

```shell
GET /user/thread/detail/1
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```
