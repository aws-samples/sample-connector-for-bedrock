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

/**
* Use llm and sdxl to chat with openai completions api
*/
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
      s3Prefix = s3Prefix.substring(0, this.s3Prefix.length - 1);
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
        const responseImage = await this.draw(paintModelId, {
          prompt,
          negative_prompt,
          width,
          height
        });
        ctx.res.write("data: " + WebResponse.wrap(0, "painter", `\n\n${responseImage}`, null, null, null, reqId) + "\n\n");
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

    const response = await fetch("http://localhost:8866/v1/chat/completions", {
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

    const response = await fetch("http://localhost:8866/v1/chat/completions", {
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

  scaleTitanRatio(width: number, height: number) {
    const allowedSizes = [
      { width: 1024, height: 1024, ratio: "1:1", price: "1024 x 1024" },
      { width: 768, height: 768, ratio: "1:1", price: "512 x 512" },
      { width: 512, height: 512, ratio: "1:1", price: "512 x 512" },
      { width: 768, height: 1152, ratio: "2:3", price: "1024 x 1024" },
      { width: 384, height: 576, ratio: "2:3", price: "512 x 512" },
      { width: 1152, height: 768, ratio: "3:2", price: "1024 x 1024" },
      { width: 576, height: 384, ratio: "3:2", price: "512 x 512" },
      { width: 768, height: 1280, ratio: "3:5", price: "1024 x 1024" },
      { width: 384, height: 640, ratio: "3:5", price: "512 x 512" },
      { width: 1280, height: 768, ratio: "5:3", price: "1024 x 1024" },
      { width: 640, height: 384, ratio: "5:3", price: "512 x 512" },
      { width: 896, height: 1152, ratio: "7:9", price: "1024 x 1024" },
      { width: 448, height: 576, ratio: "7:9", price: "512 x 512" },
      { width: 1152, height: 896, ratio: "9:7", price: "1024 x 1024" },
      { width: 576, height: 448, ratio: "9:7", price: "512 x 512" },
      { width: 768, height: 1408, ratio: "6:11", price: "1024 x 1024" },
      { width: 384, height: 704, ratio: "6:11", price: "512 x 512" },
      { width: 1408, height: 768, ratio: "11:6", price: "1024 x 1024" },
      { width: 704, height: 384, ratio: "11:6", price: "512 x 512" },
      { width: 640, height: 1408, ratio: "5:11", price: "1024 x 1024" },
      { width: 320, height: 704, ratio: "5:11", price: "512 x 512" },
      { width: 1408, height: 640, ratio: "11:5", price: "1024 x 1024" },
      { width: 704, height: 320, ratio: "11:5", price: "512 x 512" },
      { width: 1152, height: 640, ratio: "9:5", price: "1024 x 1024" },
      { width: 1173, height: 640, ratio: "16:9", price: "1024 x 1024" }
    ];

    let nearestSize = null;
    let minDifference = Infinity;

    for (const size of allowedSizes) {
      const difference = Math.abs(size.width - width) + Math.abs(size.height - height);
      if (difference < minDifference) {
        minDifference = difference;
        nearestSize = size;
      }
    }

    return nearestSize;
  }


  // scaleTitanRatio(width: number, height: number) {
  //   //TODO: fit the titan's ratio: https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-titan-image.html
  //   return {
  //     width: 768,
  //     height: 768
  //   };
  // }

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

  async drawByTitan(modelId: string, input: any): Promise<string> {
    const size = this.scaleTitanRatio(input.width, input.height);
    const inputBody = {
      taskType: "TEXT_IMAGE",
      textToImageParams: {
        text: input.prompt,
        negativeText: input.negative_prompt
      },
      imageGenerationConfig: {
        "numberOfImages": 1,
        "quality": "standard",
        "cfgScale": 8.0,
        "width": size.width,
        "height": size.height,
      }
    }

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
    const base64ImageData = parsedResponse.images[0];
    const base64Data = base64ImageData.replace(/^data:image\/\w+;base64,/, "");
    return base64Data;
  }

  async drawByNova(modelId: string, input: any): Promise<string> {
    let inputBody: any = {
      "taskType": "TEXT_IMAGE",
      "textToImageParams": {
        "text": input.prompt,
        "negativeText": input.negative_prompt
      },
      "imageGenerationConfig": {
        "width": input.width,
        "height": input.height,
        "quality": "standard",
        "numberOfImages": 1,
        "seed": Math.ceil(Math.random() * 858993459),
      }
    }

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

    let base64ImageData = parsedResponse.images && parsedResponse.images[0];
    if (!base64ImageData) {
      base64ImageData = parsedResponse.images[0];
    }
    const base64Data = base64ImageData.replace(/^data:image\/\w+;base64,/, "");
    return base64Data;
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
    } else if (modelId.indexOf("sd3-large") > 0) {
      inputBody.mode = "text-to-image";
    } else if (modelId.indexOf("stable-diffusion-xl") > 0) {
      inputBody = {
        "cfg_scale": 7,
        width: input.width,
        height: input.height,
        "steps": 30,
        "text_prompts": [
          {
            "text": input.prompt,
            "weight": 1
          },
          {
            "text": input.negative_prompt,
            "weight": -1
          },
        ]
      }
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
    let base64ImageData = parsedResponse.artifacts && parsedResponse.artifacts[0].base64;
    if (!base64ImageData) {
      base64ImageData = parsedResponse.images[0];
    }
    const base64Data = base64ImageData.replace(/^data:image\/\w+;base64,/, "");
    return base64Data;
  }

  async draw(modelId: string, input: any) {
    let [width, height] = this.nearestMultiplesOf64AndScaleDown(input.width || 768, input.height || 768);
    width = width < 256 ? 256 : width;
    height = height < 256 ? 256 : height;

    input.width = width;
    input.height = height;

    let base64Data: any;

    try {
      if (modelId.startsWith("stability.")) {
        base64Data = await this.drawBySD(modelId, input);
      } else if (modelId.startsWith("amazon.titan-image-generator")) {
        base64Data = await this.drawByTitan(modelId, input);
      } else if (modelId.startsWith("amazon.nova-canvas")) {
        base64Data = await this.drawByNova(modelId, input);
      } else {
        return "> Error: Unsupported paint modelId";
      }
    } catch (e) {
      logger.error(e);
      return "> Error: " + (e['message'] || e);
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

    return `![](${url})`
  }
}
