import { ChatRequest } from "../entity/chat_request";
import {
  BedrockRuntimeClient,
  InvokeModelCommand
} from "@aws-sdk/client-bedrock-runtime";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
// const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import helper from "../util/helper";
// import config from "../config";
import WebResponse from "../util/response";
import AbstractProvider from "./abstract_provider";
import logger from "../util/logger";
import { selfBaseUrl } from "../util/self";

const PAINT_MODELS = ["stability.stable-image-ultra-v1:1", "stability.stable-image-core-v1:1", "stability.sd3-5-large-v1:0"];

export default class Painter extends AbstractProvider {
  s3Client: S3Client;
  client: BedrockRuntimeClient;
  llmModelId: string;
  s3Bucket: string;
  s3Region: string;
  s3Prefix: string;
  localLlmModel: string;

  constructor() {
    super();
  }

  async chat(chatRequest: ChatRequest, session_id: string, ctx: any) {
    // console.log("--------------｜｜chatreq-", chatRequest);
    let { paintModelId, localLlmModel, s3Bucket, s3Region, s3Prefix } = this.modelData.config;

    if (!localLlmModel) {
      throw new Error("You must specify the parameter 'localLlmModel'.")
    }
    if (!paintModelId) {
      throw new Error("You must specify the parameter 'paintModelId'.")
    }
    if (!s3Bucket) {
      throw new Error("You must specify the parameter 's3Bucket'.")
    }
    if (!s3Region) {
      throw new Error("You must specify the parameter 's3Region'.")
    }
    if (!s3Prefix) {
      s3Prefix = "";
      // throw new Error("You must specify the parameter 's3Prefix'.")
    }
    if (s3Prefix.endsWith("/")) {
      s3Prefix = s3Prefix.slice(0, -1);
    }

    let regions: any = this.modelData.config && this.modelData.config.regions;
    const region = helper.selectRandomRegion(regions);
    this.client = new BedrockRuntimeClient({ region });
    this.s3Client = new S3Client({
      region: s3Region
    });

    this.s3Bucket = s3Bucket;
    this.s3Prefix = s3Prefix;
    this.s3Region = s3Region;

    chatRequest.model = localLlmModel;
    ctx.status = 200;

    const reqId = this.newRequestID();

    if (chatRequest.stream) {
      // The user's messages, before toPaintPrompt appends its system prompt, for the image call's thread.
      const userRequest: ChatRequest = { ...chatRequest, messages: [...chatRequest.messages] };
      const promptResult = await this.toPaintPrompt(chatRequest, session_id, ctx);

      const { choices } = promptResult;

      let content: string;
      let prompt: string;
      let negative_prompt: string;
      let width: number;
      let height: number;

      for (const choice of choices) {
        const { message } = choice;

        if (message.content) {
          content = message.content;
        }

        if (message.tool_calls) {
          const drawTool = message.tool_calls.find(tool => tool["function"]["name"] === "draw");

          if (drawTool) {
            const args = JSON.parse(drawTool["function"]["arguments"]);
            prompt = args.prompt;
            negative_prompt = args.negative_prompt;
            width = args.width;
            height = args.height;
          }
        }
      }



      // let content: string, prompt: string, negative_prompt: string, width: number, height: number;

      // for (const c of promptResult.choices) {
      //   if (c.message.content) {
      //     content = c.message.content;
      //   }
      //   if (c.message.tool_calls) {
      //     for (const tool of c.message.tool_calls) {
      //       if (tool["function"]["name"] == "draw") {
      //         const jArgs = JSON.parse(tool["function"]["arguments"]);
      //         prompt = tool["function"]["arguments"]["prompt"];
      //         negative_prompt = jArgs["negative_prompt"];
      //         width = jArgs["width"];
      //         height = jArgs["height"];
      //       }
      //     }
      //   }
      // }

      ctx.set({
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache',
        'Content-Type': 'text/event-stream',
      });
      ctx.res.write("data: " + WebResponse.wrap(0, null, content || "No content found in the prompt.", null, null, null, reqId) + "\n\n");
      prompt && ctx.res.write("data: " + WebResponse.wrap(0, null, "\n\nPrompt:\n\n```" + prompt + "```", null, null, null, reqId) + "\n\n");
      negative_prompt && ctx.res.write("data: " + WebResponse.wrap(0, null, "\n\nNegative prompt:\n\n ```" + negative_prompt + "```", null, null, null, reqId) + "\n\n");

      if (prompt) {
        const { markdown, images } = await this.draw(paintModelId, {
          prompt,
          negative_prompt,
          width,
          height
        });
        ctx.res.write("data: " + WebResponse.wrap(0, "painter", `\n\n${markdown}`, null, null, null, reqId) + "\n\n");
        // The prompt call is billed by the chat API it went to. The drawing is billed here, per image returned.
        await this.saveThread(ctx, session_id, userRequest, { text: content ?? "", input_tokens: 0, output_tokens: 0, images });
      }
      ctx.res.write("data: [DONE]\n\n")
    } else {
      ctx.set({
        'Content-Type': 'application/json',
      });
      ctx.body = await this.chatSync(ctx, chatRequest, session_id);
    }
  }


  async chatSync(ctx: any, chatRequest: ChatRequest, session_id: string) {

    const response = await fetch(`${selfBaseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + ctx.user.api_key,
        'Session-Id': session_id
      },
      body: JSON.stringify(chatRequest)
    });

    return await response.json();
  }

  async toPaintPrompt(chatRequest: ChatRequest, session_id: string, ctx: any) {
    const tools = [
      {
        type: "function",
        function: {
          name: "draw",
          description: `Draw a picture in AI mode.`,
          parameters: {
            type: "object",
            properties: {
              prompt: {
                type: "string",
                description: "Positive prompt. Translate it to English.",
              },
              negative_prompt: {
                type: "string",
                description: "Negative English prompt. Translate it to English. Please add nsfw always."
              },
              width: {
                type: "number",
                description: "Round the number to an integer, must be devided by 64, less than 3840, default is 768. "
              },
              height: {
                type: "number",
                description: "Round the number to an integer, must be devided by 64, less than 3840, default is 768. "
              }
            },
            required: [
              "prompt",
              "width",
              "height"
            ],
          }
        }
      }
    ];

    const kRequest = {
      model: chatRequest.model,
      messages: chatRequest.messages,
      tools,
      tool_choice: "auto"
    }

    chatRequest.messages.push({
      role: "system",
      content: `You're a great AI painter and a master of semantic understanding, and you'll need to listen to your customers' input, find out the positive and negative keywords and size information, and I'll give you tips in the tool. Please note that the keywords you extract must be in English. In response to a user question, please include the following meaning: Wait a minute, I'm sorting out the keywords and starting to draw`
    });

    const response = await fetch(`${selfBaseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + ctx.user.api_key,
        'Session-Id': session_id
      },
      body: JSON.stringify(kRequest)
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }

    const jRes: any = await response.json();

    // console.log(JSON.stringify(jRes, null, 2));

    if ("success" in jRes && jRes.success === false) {
      throw new Error(jRes.data);
    }
    return jRes;
  }
  getImageRatio(width: number, height: number) {
    const aspectRatios = [
      { ratio: '16:9', value: 16 / 9 },
      { ratio: '1:1', value: 1 },
      { ratio: '21:9', value: 21 / 9 },
      { ratio: '2:3', value: 2 / 3 },
      { ratio: '3:2', value: 3 / 2 },
      { ratio: '4:5', value: 4 / 5 },
      { ratio: '5:4', value: 5 / 4 },
      { ratio: '9:16', value: 9 / 16 },
      { ratio: '9:21', value: 9 / 21 },
    ];

    const aspectRatio = width / height;

    const closestRatio = aspectRatios.reduce((prev, curr) =>
      Math.abs(curr.value - aspectRatio) < Math.abs(prev.value - aspectRatio) ? curr : prev
    );

    return closestRatio.ratio;
  }

  nearestMultiplesOf64AndScaleDown(num1: number, num2: number) {

    const max = Math.max(num1, num2);

    if (max > 1536) {
      const scaleFactor = 1536 / max;
      return [
        this.nearestMultipleOf64(Math.round(num1 * scaleFactor)),
        this.nearestMultipleOf64(Math.round(num2 * scaleFactor))
      ];
    }
    const nearest1 = this.nearestMultipleOf64(num1);
    const nearest2 = this.nearestMultipleOf64(num2);
    return [nearest1, nearest2];
  }

  nearestMultipleOf64(num: number) {
    const lowerMultiple = Math.floor(num / 64) * 64;
    const diff = num - lowerMultiple;
    return diff < 32 ? lowerMultiple : lowerMultiple + 64;
  }

  async drawBySD(modelId: string, input: any): Promise<string> {
    // console.log(modelId, input);
    const aspect_ratio = this.getImageRatio(input.width, input.height);
    let inputBody: any = {
      prompt: input.prompt,
      aspect_ratio,
      output_format: "jpg"
    };
    if (modelId.indexOf("stable-image-ultra") > 0) {
      inputBody.negative_prompt = input.negative_prompt;
    } else if (modelId.indexOf("stable-image-core") > 0) {
      inputBody.mode = "text-to-image";
    }
    // console.log(JSON.stringify(inputBody, null, 2))
    const req = {
      body: JSON.stringify(inputBody),
      contentType: "application/json",
      accept: "application/json",
      modelId: modelId
    };
    const command = new InvokeModelCommand(req);
    const response = await this.client.send(command);
    const jsonString = new TextDecoder().decode(response.body);
    const parsedResponse = JSON.parse(jsonString);
    // console.log("xxxx", parsedResponse);
    const base64Data = parsedResponse.images[0].replace(/^data:image\/\w+;base64,/, "");
    return base64Data;
  }

  // Returns the markdown to show and the number of images drawn, which is 0 when the drawing failed.
  async draw(modelId: string, input: any): Promise<{ markdown: string; images: number }> {
    if (!modelId.startsWith("stability.")) {
      return { markdown: `> Error: Unsupported paintModelId. Use one of ${PAINT_MODELS.join(", ")}.`, images: 0 };
    }

    let [width, height] = this.nearestMultiplesOf64AndScaleDown(input.width || 768, input.height || 768);
    width = width < 256 ? 256 : width;
    height = height < 256 ? 256 : height;

    input.width = width;
    input.height = height;

    let base64Data: string;

    try {
      base64Data = await this.drawBySD(modelId, input);
    } catch (e) {
      logger.error((e as any)?.message ?? String(e));
      return { markdown: "> Error: " + (e['message'] || e), images: 0 };
    }

    const now = new Date();
    const key = `${this.s3Prefix}/${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}/${now.getTime()}.jpg`;

    const bufferData = Buffer.from(base64Data, 'base64');

    const inputS3 = {
      "Body": bufferData,
      "Bucket": this.s3Bucket,
      "Key": key
    };
    const commandPut = new PutObjectCommand(inputS3);
    await this.s3Client.send(commandPut);
    const commandGet = new GetObjectCommand(inputS3);
    const url = await getSignedUrl(this.s3Client, commandGet, { expiresIn: 3600 });

    return { markdown: `![](${url})`, images: 1 };
  }
}
