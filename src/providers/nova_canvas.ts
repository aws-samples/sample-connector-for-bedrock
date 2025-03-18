// Use the nova model to modify images.
import { ChatRequest } from "../entity/chat_request";
import {
  BedrockRuntimeClient,
  InvokeModelCommand
} from "@aws-sdk/client-bedrock-runtime";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import preprocess from "../util/preprocess";
import helper from '../util/helper';
// import config from "../config";
import WebResponse from "../util/response";
import AbstractProvider from "./abstract_provider";
// import logger from "../util/logger";

import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
// const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

export default class NovaCanvas extends AbstractProvider {
  s3Client: S3Client;
  client: BedrockRuntimeClient;
  llmModelId: string;
  s3Bucket: string;
  s3Region: string;
  s3Prefix: string;
  localLlmModel: string;
  paintModelId: string;

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
    this.paintModelId = paintModelId;

    chatRequest.model = localLlmModel;
    ctx.status = 200;
    const promptResult = await this.toPaintPrompt(chatRequest, session_id, ctx);


    const { choices } = promptResult;
    // console.log(JSON.stringify(choices, null, 2));

    const choiceContent = choices.find(c => c.message.content);
    const choiceToolUse = choices.find(c => c.message.tool_calls);
    // console.log("some", choiceContent, choiceToolUse);

    // if (!choice) {
    //   // 处理没有找到合适的选择的情况
    //   return;
    // }

    const { content } = choiceContent.message;
    const { tool_calls } = choiceToolUse?.message;
    let funName, args, imgs;

    if (content) {
      // 处理 content 的情况
    }

    // console.log(tool_calls);

    if (tool_calls) {
      const tool = tool_calls.find(t => t["function"]["name"]);
      if (tool) {
        funName = tool["function"]["name"];
        args = tool["function"]["arguments"];
      }
    }

    const reqId = this.newRequestID();
    if (chatRequest.stream) {
      ctx.set({
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache',
        'Content-Type': 'text/event-stream',
      });
      content && ctx.res.write("data: " + WebResponse.wrap(0, null, content, null, null, null, reqId) + "\n\n");

      // args && ctx.res.write("data: " +
      //   WebResponse.wrap(0,
      //     null,
      //     "\n\n tool: " + funName + "\n\nparameters:\n\n```\n" + JSON.stringify(args, null, 2) + "\n```", null) + "\n\n");
    }

    if (funName && typeof this[funName] === 'function') {
      try {
        const jArgs = JSON.parse(args);
        console.log(funName, jArgs)
        imgs = await this[funName](jArgs);
      } catch (error) {
        throw new Error("Error: " + error);
      }
    }



    // if (this[funName]) {
    //   const jArgs = JSON.parse(args);
    //   imgs = await this[funName](jArgs);
    // }

    if (chatRequest.stream) {
      if (imgs && Array.isArray(imgs)) {
        for (const img of imgs) {
          const url = await this.uploadImage(img);
          const mdImg = `![](${url})`
          ctx.res.write("data: " + WebResponse.wrap(0, this.paintModelId, `\n\n${mdImg}`, null, null, null, reqId) + "\n\n");
        }
      }
      ctx.res.write("data: [DONE]\n\n");
    } else {
      ctx.set({
        'Content-Type': 'application/json',
      });
      let images = [];
      if (imgs && Array.isArray(imgs)) {
        for (const img of imgs) {
          const url = await this.uploadImage(img);
          images.push(url);
        }
      }
      promptResult.images = images;
      ctx.body = promptResult;
    }
  }

  async uploadImage(base64Data: string) {
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
    return await getSignedUrl(this.s3Client, commandGet, { expiresIn: 7200 });
    // return url;
  }

  async colorize(input: any) {
    if (!input.image_url) {
      return {
        message: "No image url."
      }
    }
    const imageData = await preprocess.downloadImageForNovaToBase64(input.image_url, this.s3Client);

    let inputBody: any = {
      taskType: "COLOR_GUIDED_GENERATION",
      colorGuidedGenerationParams: {
        colors: input.colors,
        referenceImage: imageData,
        text: input.prompt,
        negativeText: input.negative_prompt
      },
      imageGenerationConfig: {
        width: input.width,
        height: input.height,
        numberOfImages: input.quantity || 1,
        seed: Math.ceil(Math.random() * 858993459),
      }
    }

    const req = {
      body: JSON.stringify(inputBody),
      contentType: "application/json",
      accept: "application/json",
      modelId: this.paintModelId
    };
    const command = new InvokeModelCommand(req);
    const response = await this.client.send(command);
    const jsonString = new TextDecoder().decode(response.body);
    const parsedResponse = JSON.parse(jsonString);
    if (parsedResponse.images) {
      return parsedResponse.images;
    }
    return {
      message: "No content."
    }
  }

  async variate(input: any) {
    if (!input.image_urls) {
      return {
        message: "No image urls."
      }
    }
    const imageDatas = [];

    for (const imgUrl of input.image_urls) {
      imageDatas.push(await preprocess.downloadImageForNovaToBase64(imgUrl, this.s3Client));
    }

    let inputBody: any = {
      taskType: "IMAGE_VARIATION",
      imageVariationParams: {
        text: input.prompt,
        negativeText: input.negative_prompt,
        images: imageDatas
      },
      imageGenerationConfig: {
        width: input.width,
        height: input.height,
        numberOfImages: input.quantity || 1,
        seed: Math.ceil(Math.random() * 858993459),
      }
    }

    const req = {
      body: JSON.stringify(inputBody),
      contentType: "application/json",
      accept: "application/json",
      modelId: this.paintModelId
    };
    const command = new InvokeModelCommand(req);
    const response = await this.client.send(command);
    const jsonString = new TextDecoder().decode(response.body);
    const parsedResponse = JSON.parse(jsonString);
    if (parsedResponse.images) {
      return parsedResponse.images;
    }
    return {
      message: "No content."
    }
  }

  async outpaint(input: any) {
    if (!input.image_url) {
      return {
        message: "No image url."
      }
    }
    const imageData = await preprocess.downloadImageForNovaToBase64(input.image_url, this.s3Client);
    // console.log("VVVVVV", imageData);

    let inputBody: any = {
      taskType: "OUTPAINTING",
      outPaintingParams: {
        text: input.prompt,
        negativeText: input.negative_prompt,
        maskPrompt: input.mask_prompt,
        image: imageData
      },
      imageGenerationConfig: {
        quality: "standard",
        numberOfImages: input.quantity || 1,
        seed: Math.ceil(Math.random() * 858993459),
      }
    }
    // console.log("args:", inputBody);

    const req = {
      body: JSON.stringify(inputBody),
      contentType: "application/json",
      accept: "application/json",
      modelId: this.paintModelId
    };
    const command = new InvokeModelCommand(req);
    const response = await this.client.send(command);
    const jsonString = new TextDecoder().decode(response.body);
    const parsedResponse = JSON.parse(jsonString);
    if (parsedResponse.images) {
      return parsedResponse.images;
    }
    return {
      message: "No content."
    }
  }

  async inpaint(input: any) {
    if (!input.image_url) {
      return {
        message: "No image url."
      }
    }
    const imageData = await preprocess.downloadImageForNovaToBase64(input.image_url, this.s3Client);
    let inputBody: any = {
      taskType: "INPAINTING",
      inPaintingParams: {
        text: input.prompt,
        negativeText: input.negative_prompt,
        maskPrompt: input.mask_prompt,
        image: imageData
      },
      imageGenerationConfig: {
        quality: "standard",
        numberOfImages: input.quantity || 1,
        seed: Math.ceil(Math.random() * 858993459),
      }
    }
    // console.log("args:", inputBody);

    const req = {
      body: JSON.stringify(inputBody),
      contentType: "application/json",
      accept: "application/json",
      modelId: this.paintModelId
    };
    const command = new InvokeModelCommand(req);
    const response = await this.client.send(command);
    const jsonString = new TextDecoder().decode(response.body);
    const parsedResponse = JSON.parse(jsonString);
    if (parsedResponse.images) {
      return parsedResponse.images;
    }
    return {
      message: "No content."
    }
  }

  async rembg(input: any) {
    if (!input.image_url) {
      return {
        message: "No image url."
      }
    }
    const imageData = await preprocess.downloadImageForNovaToBase64(input.image_url, this.s3Client);
    let inputBody: any = {
      "taskType": "BACKGROUND_REMOVAL",
      "backgroundRemovalParams": {
        image: imageData
      }
    }

    const req = {
      body: JSON.stringify(inputBody),
      contentType: "application/json",
      accept: "application/json",
      modelId: this.paintModelId
    };
    const command = new InvokeModelCommand(req);
    const response = await this.client.send(command);
    const jsonString = new TextDecoder().decode(response.body);
    const parsedResponse = JSON.parse(jsonString);

    if (parsedResponse.images) {
      return parsedResponse.images;
    }
    return {
      message: "No content."
    }
  }


  async img2img(input: any) {
    if (!input.image_url) {
      return {
        message: "No image url."
      }
    }
    const imageData = await preprocess.downloadImageForNovaToBase64(input.image_url, this.s3Client);

    let inputBody: any = {
      taskType: "TEXT_IMAGE",
      textToImageParams: {
        conditionImage: imageData,
        controlMode: input.control_mode,
        text: input.prompt,
        negativeText: input.negative_prompt
      },
      imageGenerationConfig: {
        width: input.width,
        height: input.height,
        quality: "standard",
        numberOfImages: input.quantity || 1,
        seed: Math.ceil(Math.random() * 858993459),
      }
    }

    const req = {
      body: JSON.stringify(inputBody),
      contentType: "application/json",
      accept: "application/json",
      modelId: this.paintModelId
    };
    const command = new InvokeModelCommand(req);
    const response = await this.client.send(command);
    const jsonString = new TextDecoder().decode(response.body);
    const parsedResponse = JSON.parse(jsonString);
    if (parsedResponse.images) {
      return parsedResponse.images;
    }
    return {
      message: "No content."
    }
  }

  async txt2img(input: any) {
    let inputBody: any = {
      taskType: "TEXT_IMAGE",
      textToImageParams: {
        text: input.prompt,
        negativeText: input.negative_prompt
      },
      imageGenerationConfig: {
        width: input.width,
        height: input.height,
        quality: "standard",
        numberOfImages: input.quantity || 1,
        seed: Math.ceil(Math.random() * 858993459),
      }
    }

    const req = {
      body: JSON.stringify(inputBody),
      contentType: "application/json",
      accept: "application/json",
      modelId: this.paintModelId
    };
    const command = new InvokeModelCommand(req);
    const response = await this.client.send(command);
    const jsonString = new TextDecoder().decode(response.body);
    const parsedResponse = JSON.parse(jsonString);
    if (parsedResponse.images) {
      return parsedResponse.images;
    }
    return {
      message: "No content."
    }
  }

  async toPaintPrompt(chatRequest: ChatRequest, session_id: string, ctx: any) {
    const widthProp = {
      type: "number",
      description: "The desired width of the generated image in pixels. It should be an integer divisible by 64 and less than 2048. The default value is 512."
    };
    const heightProp = {
      type: "number",
      description: "The desired height of the generated image in pixels. It should be an integer divisible by 64 and less than 2048. The default value is 512."
    };
    const promptProp = {
      type: "string",
      description: "The main text prompt describing the desired image. Provide it in English."
    };
    const negativePromptProp = {
      type: "string",
      description: "An optional negative text prompt to exclude specific elements or styles from the generated image. Provide it in English and always include 'nsfw' to avoid explicit content."
    };
    const imageUrlProp = {
      type: "string",
      description: "The URL of the image to be edited. It can be an S3 URL or an HTTP(S) URL. If it's an S3 presigned URL, please replace it with an S3 address in the format: s3://{bucket-name}/{key}"
    };
    const quantityProp = {
      type: "number",
      description: "The number of images, default value is 1, max value is 5."
    }

    const tools = [
      {
        type: "function",
        function: {
          name: "txt2img",
          description: `Generates an image based on a given text description (prompt).`,
          parameters: {
            type: "object",
            properties: {
              prompt: promptProp,
              negative_prompt: negativePromptProp,
              width: widthProp,
              height: heightProp,
              quantity: quantityProp
            },
            required: [
              "prompt",
              "width",
              "height"
            ],
          }
        }
      },
      {
        type: "function",
        function: {
          name: "img2img",
          description: `Generates an image based on a given text description (prompt) and image.`,
          parameters: {
            type: "object",
            properties: {
              image_url: imageUrlProp,
              control_mode: {
                type: "string",
                description: "Specifies the conditioning mode to be used. Can be 'CANNY_EDGE' or 'SEGMENTATION', default is 'CANNY_EDGE'.",
              },
              prompt: promptProp,
              negative_prompt: negativePromptProp,
              width: widthProp,
              height: heightProp,
              quantity: quantityProp
            },
            required: [
              "prompt",
              "width",
              "height",
              "image_url"
            ],
          }
        }
      },
      {
        type: "function",
        function: {
          name: "inpaint",
          description: `Enables users to seamlessly modify or replace selected regions of an existing image while intelligently preserving the surrounding context and style.`,
          parameters: {
            type: "object",
            properties: {
              image_url: imageUrlProp,
              mask_prompt: {
                type: "string",
                description: "A natural language text prompt describing the regions of the image to be edited."
              },
              prompt: promptProp,
              negative_prompt: negativePromptProp,
              quantity: quantityProp
            },
            required: [
              "image_url",
              "mask_prompt",
              "prompt",
            ],
          }
        }
      },
      {
        type: "function",
        function: {
          name: "outpaint",
          description: `Modify an image by changing the area outside of a masked region. Can be used to replace the background behind a subject.`,
          parameters: {
            type: "object",
            properties: {
              image_url: imageUrlProp,
              mask_prompt: {
                type: "string",
                description: "A natural language text prompt describing the regions of the image to be edited."
              },
              outpainting_mode: {
                type: "string",
                description: "'DEFAULT' or 'PRECISE'"
              },
              prompt: promptProp,
              negative_prompt: negativePromptProp,
              quantity: quantityProp
            },
            required: [
              "image_url",
              "mask_prompt",
              "prompt",
            ],
          }
        }
      },
      {
        type: "function",
        function: {
          name: "variate",
          description: `Image variates allow you to influence the generated image by providing input images, with or without text prompts, enabling visual style control, image variations, and creative effects.`,
          parameters: {
            type: "object",
            properties: {
              image_urls: {
                type: "array",
                description: "The URLs of the images to be edited. These can be either S3 URLs or HTTP(S) URLs."
              },
              prompt: promptProp,
              negative_prompt: negativePromptProp,
              width: widthProp,
              height: heightProp,
              quantity: quantityProp
            },
            required: [
              "image_urls",
              "prompt",
              "width",
              "height"
            ],
          }
        }
      },
      {
        type: "function",
        function: {
          name: "colorize",
          description: `Provide a reference image along with a text prompt, resulting in outputs that follow the layout and structure of the user-supplied reference.`,
          parameters: {
            type: "object",
            properties: {
              colors: {
                type: "array",
                description: "list of hexadecimal color values.",
              },
              image_url: imageUrlProp,
              prompt: promptProp,
              negative_prompt: negativePromptProp,
              width: widthProp,
              height: heightProp,
              quantity: quantityProp
            },
            required: [
              "colors",
              "image_url",
              "prompt",
              "width",
              "height"
            ],
          }
        }
      },
      {
        type: "function",
        function: {
          name: "rembg",
          description: `Background removal: Automatically remove background from images containing single or multiple objects.`,
          parameters: {
            type: "object",
            properties: {
              image_url: {
                type: "string",
                description: "A S3 Image URL or a http(s) image url."
              },
            },
            required: [
              "image_url"
            ],
          }
        }
      },
    ];

    const kRequest = {
      model: chatRequest.model,
      messages: chatRequest.messages,
      tools,
      tool_choice: "auto"
    }

    chatRequest.messages.push({
      role: "system",
      content: `You are an AI assistant specializing in image generation and editing tasks. Your role is to carefully analyze the user's request, identify the specific task they need assistance with, and provide the appropriate guidance or parameters to fulfill that task accurately and effectively.

Maintain a professional and helpful demeanor throughout the interaction. Do not attempt tasks that are beyond your abilities or violate ethical principles. If you are unsure about a request, seek clarification from the user before proceeding.

You must return all parameters through function calls only. Do not output parameters directly as Markdown or JSON text. Always use the tool_calls structure for parameter passing.
`
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

    if ("success" in jRes && jRes.success === false) {
      throw new Error(jRes.data);
    }
    return jRes;
  }

}


