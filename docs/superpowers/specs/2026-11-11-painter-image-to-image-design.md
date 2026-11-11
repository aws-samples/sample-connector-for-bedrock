# Painter: image plus text to image

## Problem

Users of the `painter` provider want to upload a picture and describe what to do with it. There are two kinds of use:

- **Edit**: use the uploaded picture as the base and change it.
- **Reference**: borrow the style or the composition of a picture to make a new one.

Both need the picture and a sentence together. Today painter cannot do either. Its single `draw` tool takes `prompt`, `negative_prompt`, `width` and `height` only. A client sends pictures as `image_url` content parts. The model that writes the prompt sees them, but the tool has no place for a picture, so the picture is lost and only the model's text description reaches the image model.

Amazon Nova Canvas, Amazon Titan Image and SDXL have reached end of life on Amazon Bedrock and were removed from painter before this change. The Stability AI models are the only image models left, so this design assumes a Stability-only painter.

## Goals

- A user uploads pictures in BRClient with one sentence and gets an edited picture or a picture made from the reference.
- Eight capabilities: text to image, image to image, search and replace, remove background, style guide, style transfer, control structure and control sketch. The chat model picks the capability. The user does not learn tool names, prefixes or a syntax.
- One request can chain several steps, for example take a style and then edit a picture. Each step's result is visible as soon as it exists.
- Each step is billed at the price of the model that the step used.

## Non-goals

- No masks. The capabilities that need a mask (inpaint, erase object, outpaint) are out of scope.
- No image proxy endpoint. Generated pictures are still shared through S3 presigned URLs.
- No S3 lifecycle rules, and no lifecycle example in the docs.
- No change to BRClient.
- Billing is a reference, not an exact ledger: no pre-charge, no quota stop.
- No change to the `azure-openai-image` provider.
- Non-stream requests do not draw. BRClient sends a non-stream request to name a conversation, with the whole history, pictures included. Drawing there would make and bill a picture each time a title is made. The non-stream path keeps forwarding the request to `/v1/chat/completions`, and only the chat model's tokens are billed.

A design that works but does any of the following is a failure:

- The user has to remember tool names, write a prefix or follow a fixed format.
- One request spends money the user did not expect, and the user cannot tell which step spent it.
- A filtered picture shows the user a stack trace instead of "the picture was filtered".
- One wrong config field makes a capability silently unavailable or silently free.

## Facts about the models

All nine models take `contentType` and `accept` of `application/json`. Bedrock wraps the Stability multipart API in JSON with base64 pictures, so `InvokeModelCommand` works for all of them.

| Capability | Tool | Model ID | Request fields besides `output_format` | Size control | Price per output picture (USD) | Regions |
|---|---|---|---|---|---|---|
| Text to image | `txt2img` | `stability.stable-image-ultra-v1:1`, `stability.stable-image-core-v1:1` or `stability.sd3-5-large-v1:0` (from `paintModelId`) | `prompt`, `negative_prompt`, `aspect_ratio` | `aspect_ratio` | 0.14 / 0.04 / 0.08 | us-west-2 |
| Image to image | `img2img` | Ultra or SD3.5 Large | `prompt`, `negative_prompt`, `image`, `strength`; SD3.5 also `mode: "image-to-image"` | follows the input | 0.14 / 0.08 | us-west-2 |
| Search and replace | `search_replace` | `us.stability.stable-image-search-replace-v1:0` | `prompt`, `search_prompt`, `negative_prompt`, `image` | none | 0.07 | us-east-1, us-east-2, us-west-2 |
| Remove background | `remove_background` | `us.stability.stable-image-remove-background-v1:0` | `image` only | follows the input | 0.07 | same |
| Style guide | `style_guide` | `us.stability.stable-image-style-guide-v1:0` | `prompt`, `negative_prompt`, `image`, `fidelity`, `aspect_ratio` | `aspect_ratio` | 0.07 | same |
| Style transfer | `style_transfer` | `us.stability.stable-style-transfer-v1:0` | `init_image`, `style_image`, `prompt`, `negative_prompt`, `style_strength`, `change_strength` | follows `init_image` | 0.08 | same |
| Control structure | `control_structure` | `us.stability.stable-image-control-structure-v1:0` | `prompt`, `negative_prompt`, `image`, `control_strength` | follows the input | 0.07 | same |
| Control sketch | `control_sketch` | `us.stability.stable-image-control-sketch-v1:0` | `prompt`, `negative_prompt`, `image`, `control_strength` | follows the input | 0.07 | same |

Field ranges:

- `aspect_ratio` is one of `16:9`, `1:1`, `21:9`, `2:3`, `3:2`, `4:5`, `5:4`, `9:16`, `9:21`. No model takes `width` or `height`.
- `strength` (image to image) is 0 to 1. 0 keeps the input, 1 ignores it.
- `fidelity` (style guide) is 0 to 1, default 0.5.
- `style_strength` is 0 to 1, default 1. `change_strength` is 0.1 to 1, default 0.9.
- `control_strength` is 0 to 1, default 0.7.
- `prompt` and `negative_prompt` are up to 10,000 characters.
- `output_format` is `jpeg`, `png` or `webp`. There is no `jpg`.
- Input pictures for the image services: each side at least 64 pixels, at most 9,437,184 pixels in total, aspect ratio between 1:2.5 and 2.5:1, format jpeg, png or webp. The Stability API documents a smaller total of 4,194,304 pixels for remove background.

Responses:

- A response is `{ seeds, finish_reasons, images }`. The picture is `images[0]`, base64 without a `data:` prefix.
- A filtered call returns HTTP 200 with only `finish_reasons`, and no `images` key. `finish_reasons[0]` is one of `null` (success), `"Filter reason: prompt"`, `"Filter reason: input image"`, `"Filter reason: output image"` or `"Inference error"`. The code reads `finish_reasons[0]` before it reads `images[0]`.

Invocation:

- Ultra, Core and SD3.5 Large are on-demand models in us-west-2 only. They are called by their bare model ID.
- The six image services are called only through their `us.` cross-Region inference profile. A call with the bare `stability.` ID fails with a clear `ValidationException` that names the inference profile, so the code does not check the prefix itself. The profiles exist in us-east-1, us-east-2 and us-west-2, and the caller must be in one of them.
- Real calls confirmed that Ultra accepts `image` with `strength`, although the model's listed input modalities are text only. Core is text to image only.

## Design

### One request

```
POST /v1/chat/completions, stream: true
  │
  ├─ collect the pictures in the messages
  │    · the last user message holds this turn's uploads:
  │        more than 5 pictures, or one larger than 10 MB → refuse and say which limit
  │        each upload → stored in <s3Prefix>/uploads/<date>/, named image_1, image_2, ...
  │    · pictures from earlier turns and pictures painter generated earlier get names too
  │    · each picture in the messages is replaced by a small JPEG copy for the chat model,
  │      next to a text part with its name
  │
  ├─ loop:
  │    1. call /v1/chat/completions with localLlmModel, the eight tools and the list of names
  │    2. no tool call → stream the text, end (the normal exit)
  │    3. for each tool call, in order:
  │         · 5 steps already ran → stream "limit reached", end
  │         · resolve the model and the Region of the tool
  │         · download each referenced picture from S3, fit it to the model's limits
  │         · InvokeModel
  │         · finish_reasons[0] is null → store the picture in <s3Prefix>/<date>/, stream
  │           the step line and ![](presigned URL), record its price, name it image_N
  │         · anything else → stream the reason in plain words, end
  │    4. append the tool calls, their results and a small copy of the newest picture to
  │       the messages, go to 1
  │
  └─ once a step has run: bill the pictures that were made and save the thread, even when a
     later step fails
```

### Picture names

The chat model never handles picture bytes. Tool arguments take a picture name, and the code turns the name back into bytes.

- Names are `image_1`, `image_2`, and so on, assigned per request in the order the pictures appear in the conversation. Each picture in the chat model's messages is preceded by a text part `[image_N]`.
- Pictures in the last user message are this turn's uploads. Only they count against the limit of 5 pictures and 10 MB each. They are stored in S3 before the first model call.
- A client resends the whole history on every turn, earlier uploads included. Those pictures get names too, but they are stored in S3 only when a tool uses them. Storing them on every turn would write the same picture again and again, and counting them would make a conversation unusable after its fifth picture.
- Pictures painter generated in earlier turns are in the history as `![](presigned URL)` in assistant messages. Before the chat model sees the history, each presigned URL that points into the model's `s3Bucket` is replaced by its name. So "remove the background of that last picture" works without the chat model rewriting URLs.
- A tool argument also accepts `s3://<bucket>/<key>`. It is read only from the model's `s3Bucket`; any other bucket is refused with a 400, the same check as `preprocess.downloadImageForNovaToBase64`.
- Each step downloads its pictures from S3 again. No picture bytes are kept between steps. The S3 copy is the single source for every step.

### Three copies of a picture

| Use | Size | Why |
|---|---|---|
| S3 (`uploads/` or the dated folder) | unchanged | every step reads from here |
| What the chat model sees | longest side 1024 px, JPEG | the model must see a picture to choose a tool, but five full pictures in base64 would pass the Bedrock request size limit |
| What a Stability model gets | fitted to the model's limits, format kept | see [ADR 0002](../../adr/0002-painter-picture-sizing.md) |

The chat model also sees the newest picture that a step made in this request, as the same small JPEG copy. Older step outputs stay in the messages as names only. Without the newest picture, a chain such as "take this style, then change the picture" runs blind. With every picture, the input grows with each step and the chat model's tokens can cost more than the pictures.

### Tools

Each tool maps to one model. The seven tools other than `txt2img` and `img2img` have a fixed model, because only one model can do each job. `txt2img` uses `paintModelId`. `img2img` uses `paintModelId` when it is Ultra or SD3.5 Large and SD3.5 Large when it is Core, which cannot take a picture. The step line in the stream names the model that ran.

The code sets `output_format`, never the chat model: `png` for `remove_background`, so the cut-out keeps its transparency, and `jpeg` for the other tools. The S3 key extension and `ContentType` follow the format.

Tool descriptions tell the chat model what each capability is for, because the choice is entirely the chat model's.

### Regions

```
stability.*      (Ultra, Core, SD3.5 Large) → us-west-2
us.stability.*   (the six image services)   → the host Region if it is us-east-1, us-east-2 or us-west-2, else us-west-2
```

The host Region is `AWS_REGION`, then `AWS_DEFAULT_REGION`. The `regions` field of the model config no longer applies to painter. If it is set, painter logs that it ignores it and goes on, so existing configs keep working after an upgrade.

### Billing

The model config can carry a price for each model ID:

```json
"image_prices": {
  "stability.stable-image-ultra-v1:1": 0.14,
  "us.stability.stable-image-search-replace-v1:0": 0.07
}
```

The price of one picture is looked up in this order:

1. `image_prices[modelId]` in the model config.
2. `price_per_image` in the model config. It stays in the chain so that a config written before this change is not billed at 0 after an upgrade.
3. The built-in table, which holds the prices in the table above.
4. 0, with a warning in the log. A missing price never stops a call.

Every picture that a step makes is billed at the price of the model of that step. The calls to `localLlmModel` go through the chat API and are billed there, as before. See [ADR 0003](../../adr/0003-painter-billing-per-step.md) for how the fee is recorded.

### Keeping the stream alive

CloudFront closes an origin connection that sends nothing for 30 seconds, its default origin read timeout, and one Stability call often takes 10 to 40 seconds. While painter waits for the chat model or for Bedrock, it writes an SSE comment line every 15 seconds. SSE clients ignore comment lines, so the user sees nothing. A code-side keep-alive reaches every deployed stack with the next image update. A change to the CloudFormation timeout would reach only new or updated stacks.

### What the user sees when something goes wrong

| Case | Message |
|---|---|
| More than 5 pictures, or one over 10 MB | the limit, and which picture passed it |
| A picture that cannot be read (for example HEIC) | the picture, and the formats that work |
| A picture outside the model's limits | the rule it breaks and its actual value |
| `finish_reasons[0]` is not `null` | the prompt, the input picture or the output picture was filtered, or the model failed |
| `AccessDeniedException` | the role may lack `bedrock:InvokeModel` in the target Region, with the Region named |
| The step limit | the limit was reached, and the pictures already made stay |

A failed step ends the request. Pictures made by earlier steps were already streamed and billed; nothing is rolled back. When the client has disconnected, painter starts no further step.

## Known limitations

- History pictures break when their presigned URL expires. The URL now lasts up to 4 hours instead of 1. A URL signed with temporary credentials stops working when the credentials expire, so it can expire sooner.
- Uploaded pictures stay in the bucket. There is no lifecycle rule.
- A wrong tool choice is hard to see. Each step line names the capability, the model and the input pictures so the user can tell.
- Non-stream clients cannot draw.
- When the host is outside us-east-1, us-east-2 and us-west-2, pictures and prompts are sent to us-west-2. The `us.` inference profiles can also route a call to another of the three US Regions.

## Implementation decisions

- [ADR 0001](../../adr/0001-painter-picture-names-and-step-loop.md): picture names, the step loop, the step limit and what ends a request.
- [ADR 0002](../../adr/0002-painter-picture-sizing.md): sizes and formats of the chat model's copy and the Stability model's copy.
- [ADR 0003](../../adr/0003-painter-billing-per-step.md): how per-step prices reach the fee and the thread record.
