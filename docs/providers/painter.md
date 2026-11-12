# painter

> Since Docker image version 0.0.9
> Updated in Docker image version 0.0.12
> Updated in Docker image version 0.0.13
> Updated in Docker image version 0.0.19

Draw and edit pictures with Stability AI models on Amazon Bedrock.

A user can type a sentence, or upload up to 5 pictures and type a sentence, in BRClient. The chat model reads the request, chooses one of eight capabilities, and calls it. Each picture appears in the reply as soon as it is made.

## Configuration

```json
{
  "s3Bucket": "<your-bucket>",
  "s3Prefix": "<your-prefix>",
  "s3Region": "us-east-1",
  "paintModelId": "stability.stable-image-ultra-v1:1",
  "localLlmModel": "claude-sonnet-5-5-chat",
  "image_prices": {
    "stability.stable-image-ultra-v1:1": 0.14
  }
}
```

| Key | Type | Required | Default value | Description |
| --- | --- | --- | --- | --- |
| localLlmModel | string | Y | | The chat model that reads the request and chooses what to draw. It must support **function calling** and be able to **see images**. A model that cannot see images cannot tell which picture the user means. Use a Claude Sonnet model. See [Choosing the chat model](#choose-chat-model). |
| paintModelId | string | Y | | The text-to-image model. See the options below. |
| s3Bucket | string | Y | | The bucket that stores uploaded and generated pictures. Grant the access described in [IAM permissions](#iam-permissions). |
| s3Prefix | string | N | "" | The S3 key prefix. Generated pictures go to `<s3Prefix>/<date>/` and uploaded pictures go to `<s3Prefix>/uploads/<date>/`. |
| s3Region | string | Y | | The Region of the bucket. |
| image_prices | object | N | | The price of one picture for each model ID, in the model's currency. See [Billing](#billing). |
| price_per_image | number | N | | One price for every picture, in the model's currency. It is used for a model ID that is not in `image_prices`. See [Billing](#billing). |

`paintModelId` options:

- `stability.stable-image-ultra-v1:1`
- `stability.stable-image-core-v1:1`
- `stability.sd3-5-large-v1:0`

`paintModelId` sets the model for text to image. It also sets the model for image to image when it is Ultra or SD3.5 Large. Core cannot take a picture as input, so with Core, image to image uses SD3.5 Large.

painter ignores the `regions` field and logs a message when it is set. It picks the Region for each model. See [Regions and data residency](#regions-and-data-residency). Remove `regions` from existing configs.

Then grant this model to a group or an API key.

### Choosing the chat model {#choose-chat-model}

Use a Claude Sonnet model, such as `claude-sonnet-5-5-chat`, as `localLlmModel`. The chat model decides how many steps a request runs, and every step makes a picture that is billed.

In tests with Amazon Nova Pro (`us.amazon.nova-pro-v1:0`) as `localLlmModel`, a text-only request for one picture ran more steps than the user asked for. After the first picture, the model called style transfer or image to image on that picture by itself. Each extra step was billed. Nova Pro also wrote its `<thinking>...</thinking>` text into the reply, so the user saw it.

With Claude Sonnet, the same request ran one step, and the reply had no such text.

To use a different model, create the model config yourself and test it with your own requests before users rely on it.

## What users can say

Users do not need tool names or a fixed format. They write what they want, and the chat model chooses the capability. If the choice is wrong, the user can say so and ask again.

| Capability | Model ID | Price per picture (USD) | A user might say |
| --- | --- | --- | --- |
| Text to image | `paintModelId` | 0.14 (Ultra), 0.04 (Core), 0.08 (SD3.5 Large) | "Draw a lighthouse at dawn" |
| Image to image | Ultra or SD3.5 Large | 0.14 (Ultra), 0.08 (SD3.5 Large) | "Make this street photo look like autumn" |
| Search and replace | `us.stability.stable-image-search-replace-v1:0` | 0.07 | "Replace the cat with a dog" |
| Remove background | `us.stability.stable-image-remove-background-v1:0` | 0.07 | "Remove the background of this photo" |
| Style guide | `us.stability.stable-image-style-guide-v1:0` | 0.07 | "Draw a harbor in the style of this painting" |
| Style transfer | `us.stability.stable-style-transfer-v1:0` | 0.08 | "Make my photo look like this painting" |
| Control structure | `us.stability.stable-image-control-structure-v1:0` | 0.07 | "Keep the layout of this photo and make it a winter scene" |
| Control sketch | `us.stability.stable-image-control-sketch-v1:0` | 0.07 | "Turn my hand-drawn sketch into a finished poster" |

The prices are list prices at the time of writing. Check the [Amazon Bedrock pricing page](https://aws.amazon.com/bedrock/pricing/) for the current ones.

Painter does not support masks, so it cannot inpaint, erase an object or outpaint.

### Steps in one request

One request can run up to 5 steps. For example, "take the style of the first picture, apply it to the second, then remove the background" runs two steps. Each step's picture appears as it is made. Before each picture, the stream shows a line that names the step's capability, the model and the input pictures, so the user can check that the chat model made the right choice.

A later message can refer to earlier pictures, for example "remove the background of the last one". If a step fails, the request stops. Pictures from earlier steps stay in the reply and stay billed. If the 5-step limit is reached, the reply says so and keeps the pictures already made.

The last chunk of the stream, before `[DONE]`, has a `finish_reason`. It is `length` when the 5-step limit stopped the request, and `content_filter` when the image model filtered the prompt or a picture. In all other cases it is `stop`. This includes a failed step, whose reply ends with the error message.

A request that is not streamed does not draw. It goes to the chat model as before. BRClient uses such requests to name conversations.

On the `lambda` compute type, a request stops after 60 seconds, and a chain of two or three steps can reach that limit. Each picture is billed when it is made, so the pictures already shown stay billed. Use the `ec2`, `ecs` or `lambda-web` compute type for longer chains.

## Uploads

- At most 5 pictures in one message, and at most 10 MB each.
- JPEG, PNG or WebP. HEIC cannot be read, so convert it first.
- A picture outside the limits of the chosen model gets an error that names the rule and the picture's actual value.
- If Bedrock filters the prompt, an input picture or the output picture, the reply says which one. The reply does not show an error trace.

Uploaded pictures are stored in `<s3Prefix>/uploads/<date>/`. Generated pictures are stored in `<s3Prefix>/<date>/`. BRConnector sets no lifecycle rule, so the pictures stay until you delete them.

The generated pictures in a reply are links to S3 presigned URLs. A URL lasts at most 4 hours. A URL signed with temporary credentials stops working when the credentials expire. The credentials of an EC2 instance role last about 6 hours, so older pictures in a conversation can stop loading sooner than 4 hours.

## Regions and data residency

painter picks the Region for each model.

- Ultra, Core and SD3.5 Large always run in us-west-2.
- The six `us.stability.*` image services run in the Region where BRConnector runs when it is us-east-1, us-east-2 or us-west-2. In any other Region they run in us-west-2.

`us.stability.*` are cross-Region inference profiles, so Bedrock may route a call to another of the three US Regions.

When BRConnector runs outside us-east-1, us-east-2 and us-west-2, the prompts and uploaded pictures go to us-west-2. If you have data-residency requirements, do not use painter.

## IAM permissions

The role that runs BRConnector needs:

- `bedrock:InvokeModel` in the target Region, on the foundation models and on the `us.stability.*` inference profiles.
- `s3:PutObject` and `s3:GetObject` on the bucket and prefix.

Stability models are third-party models that AWS Marketplace sells. The first call to a model in an AWS account subscribes the account to that model. This call needs `aws-marketplace:Subscribe` and `aws-marketplace:ViewSubscriptions`, and the account needs a valid payment method for AWS Marketplace. Give these permissions to the role, or ask someone who has them to invoke each model once in the Amazon Bedrock console. After the subscription is complete, the role needs only `bedrock:InvokeModel`. A subscription can take up to 15 minutes.

A service control policy that limits `aws:RequestedRegion` blocks calls to us-west-2.

If a call returns `AccessDeniedException`, the reply quotes the message from Bedrock and adds a hint:

- If the message names AWS Marketplace, the subscription for the model is not complete. Complete it in one of the two ways above, and try again after a few minutes.
- Otherwise, the reply names the Region that BRConnector called. Make sure that the role and all service control policies allow `bedrock:InvokeModel` in that Region.

The message from Bedrock can include the ARN of the role that runs BRConnector. The log records each denial with the model ID, the Region, the error name, the message from Bedrock and the request ID. The log does not record the prompt or the pictures.

## Billing

painter looks up the price of one picture in this order:

1. `image_prices[modelId]` in the model config.
2. `price_per_image` in the model config.
3. The built-in list prices in the table above. They are in USD, so set `image_prices` when the model's currency is not USD.
4. 0, with a warning in the log. A missing price never blocks a call.

Each picture is billed at the price of the model that made it. A request with a search-and-replace step and a remove-background step is billed for two pictures at 0.07 each. A step that fails makes no picture and is not billed.

- A config with no price at all is billed at the built-in list prices. Before, it was billed at 0.
- A config with `price_per_image` keeps that one price for every capability until you set `image_prices`. Set `image_prices` to bill each capability at its own price.
- The calls to `localLlmModel` are billed as calls to that model, at its prices.
- The prices are for reference. painter does not charge before a call and does not stop a request on a quota.

## Features and Screenshots in BRClient

Features:

- Supports natural language conversation
- Supports multi-turn conversation to refine prompts
- Supports multiple languages, and replies in the language of your latest message
- Supports uploading pictures to edit them or to use them as a reference
- Supports aspect ratios for the models that take one

Screenshots in BRClient:

![Wukong](./screenshots/sd-ultra.webp)

![demo dish](./screenshots/demo-dish-1.png)

![demo dish](./screenshots/demo-dish-2.png)
