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

Chat models, for example `bedrock-converse`, take an image as a `data:` URL (`data:image/png;base64,...`) or as an `http(s)` URL. `bedrock-runtime-anthropic` and `bedrock-runtime-openai` pass the request to Bedrock as sent, so this section does not apply to them.

`nova-canvas` models take an image as an `http(s)` URL, or as an `s3://` URL in the bucket named by the model's `s3Bucket` setting. They do not read `data:` URLs. An `s3://` URL in any other bucket gets HTTP 400 with `s3:// image URLs must point to the model's s3Bucket.`

BRConnector downloads an `http(s)` image itself and accepts the URL only when:

- the host is on a public address, checked again on every redirect; private, loopback, link-local and other reserved ranges are not accepted;
- the image arrives within 15 seconds, after at most 3 redirects;
- the response has an `image/*` content type and is at most 10 MiB.

Any other `http(s)` URL gets HTTP 400 with `Image URL is not allowed: use an http(s) URL on a public address.` Chat models answer the same for a URL with a scheme other than `http`, `https` or `data`. For chat models, an image on a private network can be sent as a `data:` URL instead.

Image URLs are fetched directly from the BRConnector host, not through a proxy: `HTTPS_PROXY` and `HTTP_PROXY` are not used for them. On a deployment without direct internet egress, send images to chat models as `data:` URLs.

Content blocks sent in Bedrock's own format, such as `image`, `document` and `video` (also inside `toolResult`), must carry their content inline. A `source` with `s3Location` gets HTTP 400 with `s3Location sources are not accepted; send the content inline.`
