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

## Image URLs in Chat Requests {#image-urls}

An image in a chat request can be a `data:` URL (`data:image/png;base64,...`) or an `http(s)` URL. Where BRConnector downloads an `http(s)` image itself, for example for `bedrock-converse` and `nova-canvas` models, it accepts the URL only when:

- the host is on a public address, checked again on every redirect; private, loopback, link-local and other reserved ranges are not accepted;
- the image arrives within 15 seconds, after at most 3 redirects;
- the response has an `image/*` content type and is at most 10 MiB.

Any other URL gets HTTP 400 with `Image URL is not allowed: use an http(s) URL on a public address, or a data: URL.` An image on a private network can be sent as a `data:` URL instead.

Image URLs are fetched directly from the BRConnector host, not through a proxy: `HTTPS_PROXY` and `HTTP_PROXY` are not used for them. A deployment without direct internet egress should send images as `data:` URLs.

For `nova-canvas` models, an `s3://` image URL must name the bucket in the model's `s3Bucket` setting; any other bucket gets HTTP 400.
