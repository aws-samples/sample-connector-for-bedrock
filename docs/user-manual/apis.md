# API Reference

## LLM API

Completions

```text
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

List models

```text
GET /v1/models
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## Admin API

### API key

Create an api key

```text
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

Create an api key with admin role

```text
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

Update and api key's info

```text
POST /admin/api-key/update
Content-Type: application/json
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

{
  "id": 2,
  "name": "jack",
  "month_quota": 10.00
}
```

Recharge up an API key

```text
POST /admin/api-key/recharge
Content-Type: application/json
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

{
  "api_key": "br-xxxxxxxxxxxxxxx",
  "balance": 0.23
}
```

recharge history

```text
GET /admin/payment/list?key_id=
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

List api keys

```text
GET /admin/api-key/list?q=&name=&group_id=&role=&limit=10&offset=
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Delete an api key

```text
POST /admin/api-key/delete
Content-Type: application/json
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

{
  "id": 1
}
```

### Model

List models

```text
GET /admin/model/list?q=&limit=10&offset=
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Create a model

```text
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

Update a model

```text
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

Delete a model

```text
POST /admin/model/delete
Content-Type: application/json
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

{
  "id": 1
}
```

### Group

List groups

```text
GET /admin/group/list?q=&limit=10&offset=
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Delete a group

```text
POST /admin/group/delete
Content-Type: application/json
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

{
  "id": 1
}
```

### Model Authorization

List models of a group

Authorize the model to a group

Deauthorize the model from a group

List models of an api key

Authorize the model to an api key

Deauthorize the model from an api key

### Chat records

List sessions

```text
GET /admin/session/list?q=&limit=10&offset=&key_id=
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

List threads / histories

```text
GET /admin/thread/list?q=&limit=10&offset=&key_id=&session_id=
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## User API

My sessions

```text
GET /user/session/list?q=&limit=10&offset=
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

My session detail

```text
GET /user/session/detail/1
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

My threads / histories

```text
GET /user/thread/list?q=&limit=10&offset=&session_id=
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

My thread detail

```text
GET /user/thread/detail/1
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```
