// A\
import { ChatRequest, ResponseData } from "../entity/chat_request";
import {
  BedrockRuntimeClient,
  ConverseStreamCommand,
  ConverseCommand,
  InvokeModelCommand
} from "@aws-sdk/client-bedrock-runtime";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
import helper from "../util/helper";
// import config from "../config";
import WebResponse from "../util/response";
import AbstractProvider from "./abstract_provider";

/**
 * Use llm and sdxl to chat with openai completions api
 */
export default class Painter extends AbstractProvider {
  s3Client: S3Client;
  client: BedrockRuntimeClient;
  chatMessageConverter: MessageConverter;
  sdModelId: string;
  llmModelId: string;
  s3Bucket: string;
  s3Region: string;
  s3Prefix: string;

  constructor() {
    super();
    this.chatMessageConverter = new MessageConverter();

  }

  async chat(chatRequest: ChatRequest, session_id: string, ctx: any) {


    // console.log("--------------｜｜chatreq-", chatRequest);
    this.sdModelId = this.modelData.config && this.modelData.config.sdModelId;
    this.llmModelId = this.modelData.config && this.modelData.config.llmModelId;
    this.s3Bucket = this.modelData.config && this.modelData.config.s3Bucket;
    this.s3Region = this.modelData.config && this.modelData.config.s3Region;
    this.s3Prefix = this.modelData.config && this.modelData.config.s3Prefix || "";
    if (this.s3Prefix.endsWith("/")) {
      this.s3Prefix = this.s3Prefix.substring(0, this.s3Prefix.length - 1);
    }

    if (!this.sdModelId) {
      this.sdModelId = "stability.stable-diffusion-xl-v1";
    }
    if (!this.llmModelId) {
      this.llmModelId = "anthropic.claude-3-sonnet-20240229-v1:0";
    }

    let regions: any = this.modelData.config && this.modelData.config.regions;
    const region = helper.selectRandomRegion(regions);
    this.client = new BedrockRuntimeClient({ region });
    this.s3Client = new S3Client({
      region: this.s3Region
    });

    const payload = await this.chatMessageConverter.toPayload(chatRequest);
    payload["modelId"] = this.llmModelId;

    const tools = [
      {
        "toolSpec": {
          "name": "draw",
          "description": "According to the user's input, \
          extract the prompt (positive and negative) words in the Stable Diffusion style. \
          If the prompt words are not in English, please translate them into English. \
          You can also optimize the prompt words based on the situation. \
          Do not include size infomation in the prompt.",
          "inputSchema": {
            "json": {
              "type": "object",
              "properties": {
                "prompt": {
                  "type": "string",
                  "description": "Positive prompt. Translate it to English."
                },
                "negative_prompt": {
                  "type": "string",
                  "description": "Negative English prompt. Translate it to English. Please add nsfw always."
                },
                "width": {
                  "type": "number",
                  "description": "Round the number to an integer, must be devided by 64, less than 6000, default is 768. "
                },
                "height": {
                  "type": "number",
                  "description": "Round the number to an integer, must be devided by 64, less than 6000, default is 768. "
                }
              },
              "required": [
                "prompt",
                "width",
                "height"
              ]
            }
          }
        }
      }
    ];


    ctx.status = 200;

    if (chatRequest.stream) {
      payload.toolConfig = { tools };
      ctx.set({
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache',
        'Content-Type': 'text/event-stream',
      });
      await this.functionCallingStream(ctx, payload);
    } else {
      ctx.set({
        'Content-Type': 'application/json',
      });
      ctx.body = await this.chatSync(ctx, payload, chatRequest, session_id);
    }
  }

  async functionCallingStream(ctx: any, input: any) {

    // let i = 0;
    const command = new ConverseStreamCommand(input);
    const response = await this.client.send(command);
    let toolUseId = null;
    let toolName = null;

    if (response.stream) {
      let responseText = "";
      let responseTextTool = "";
      for await (const item of response.stream) {
        // console.log(JSON.stringify(item, null, 2));
        if (item.contentBlockStart) {
          if (item.contentBlockStart.start?.toolUse) {
            toolName = item.contentBlockStart.start.toolUse.name;
            toolUseId = item.contentBlockStart.start.toolUse.toolUseId;
          }
        }
        if (item.contentBlockDelta) {
          if (toolName) {
            responseTextTool += item.contentBlockDelta.delta.toolUse.input;
          } else {
            responseText += item.contentBlockDelta.delta.text;
            ctx.res.write("data:" + WebResponse.wrap(0, "paiter", item.contentBlockDelta.delta.text, null) + "\n\n");
          }
          // console.log(JSON.stringify(item.contentBlockDelta.delta))
        }
        if (item.contentBlockStop) {
          if (toolName == "draw") {
            // console.log("----------all tools", toolName, responseTextTool);
            const sdInput = JSON.parse(responseTextTool)
            ctx.logger.debug(sdInput);
            // console.log(sdInput)
            try {
              const responseImage = await this.draw(sdInput);
              const mdImage = `\n\n![](${responseImage})`
              ctx.res.write("data:" + WebResponse.wrap(0, "painter", mdImage, null) + "\n\n");
            } catch (ex) {
              ctx.logger.error(ex.message);
              ctx.res.write("data:" + WebResponse.wrap(0, "painter", "\n\n" + ex.message + "\n\n", null) + "\n\n");
            }

          }
          // console.log(JSON.stringify(item.contentBlockDelta.delta))
          // ctx.res.write("data:" + WebResponse.wrap(0, chatRequest.model, item.contentBlockDelta.delta.text, null) + "\n\n");
        }
        if (item.metadata) {
          // console.log(item);
          const input_tokens = item.metadata.usage.inputTokens;
          const output_tokens = item.metadata.usage.outputTokens;
          const first_byte_latency = item.metadata.metrics.latencyMs;
          const response: ResponseData = {
            text: responseText,
            input_tokens,
            output_tokens,
            invocation_latency: 0,
            first_byte_latency
          }
          // await this.saveThread(ctx, session_id, chatRequest, response);
        }
      }
    } else {
      throw new Error("No response.");
    }

    if (!toolName) {
      ctx.res.write("data: [DONE]\n\n")
      ctx.res.end();
    }
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

  async draw(input: any) {
    let [width, height] = this.nearestMultiplesOf64AndScaleDown(input.width || 768, input.height || 768);
    width = width < 256 ? 256 : width;
    height = height < 256 ? 256 : height;
    const inputBody = {
      "cfg_scale": 7,
      width,
      height,
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

    const req = {
      body: JSON.stringify(inputBody),
      contentType: "application/json",
      accept: "application/json",
      modelId: this.sdModelId
    };

    const command = new InvokeModelCommand(req);
    const response = await this.client.send(command);
    const jsonString: any = new TextDecoder().decode(response.body);
    const parsedResponse = JSON.parse(jsonString);
    const base64ImageData = parsedResponse.artifacts[0].base64;
    const base64Data = base64ImageData.replace(/^data:image\/\w+;base64,/, "");
    const bufferData = Buffer.from(base64Data, 'base64');

    const now = new Date();

    const key = `${this.s3Prefix}/${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate() + 1}/${now.getTime()}.jpg`;

    const inputS3 = {
      "Body": bufferData,
      "Bucket": this.s3Bucket,
      "Key": key
    };
    // console.log(inputS3);
    const commandPut = new PutObjectCommand(inputS3);
    await this.s3Client.send(commandPut);
    const commandGet = new GetObjectCommand(inputS3);
    const url = await getSignedUrl(this.s3Client, commandGet, { expiresIn: 3600 });
    return url;
  }

  // async functionCallingSync(ctx: any, input: any) {
  //   const command = new ConverseCommand(input);
  //   const apiResponse = await this.client.send(command);

  //   console.log(JSON.stringify(apiResponse, null, 2));

  //   const content = apiResponse.output.message?.content
  //   const { inputTokens, outputTokens, totalTokens } = apiResponse.usage;
  //   const { latencyMs } = apiResponse.metrics;
  //   const response: ResponseData = {
  //     text: content[0].text,
  //     input_tokens: inputTokens,
  //     output_tokens: outputTokens,
  //     invocation_latency: 0,
  //     first_byte_latency: latencyMs
  //   }
  //   const choices = content.map((c: any) => {
  //     return {
  //       message: {
  //         content: c.text,
  //         role: "assistant"
  //       }
  //     }
  //   });
  //   return {
  //     choices, usage: {
  //       completion_tokens: outputTokens,
  //       prompt_tokens: inputTokens,
  //       total_tokens: totalTokens
  //     }
  //   };
  // }


  async chatSync(ctx: any, input: any, chatRequest: ChatRequest, session_id: string) {
    const command = new ConverseCommand(input);
    const apiResponse = await this.client.send(command);

    const content = apiResponse.output.message?.content
    const { inputTokens, outputTokens, totalTokens } = apiResponse.usage;
    const { latencyMs } = apiResponse.metrics;
    const response: ResponseData = {
      text: content[0].text,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      invocation_latency: 0,
      first_byte_latency: latencyMs
    }
    await this.saveThread(ctx, session_id, chatRequest, response);
    const choices = content.map((c: any) => {
      return {
        message: {
          content: c.text,
          role: "assistant"
        }
      }
    });
    return {
      choices, usage: {
        completion_tokens: outputTokens,
        prompt_tokens: inputTokens,
        total_tokens: totalTokens
      }
    };
  }
}

class MessageConverter {

  convertImageExt(mime?: string) {
    if (mime.indexOf('image/jpeg') >= 0 || mime.indexOf('image/jpg') >= 0) {
      return 'jpeg';
    }
    if (mime.indexOf('image/png') >= 0) {
      return 'png';
    }
    if (mime.indexOf('image/gif') >= 0) {
      return 'gif';
    }
    if (mime.indexOf('image/webp') >= 0) {
      return 'webp';
    }
    return 'jpeg';
  }


  async parseImageUrl(url: string): Promise<any> {
    if (url.indexOf('http://') >= 0 || url.indexOf('https://') >= 0) {
      const imageRes = await fetch(url);
      const mime = imageRes.headers.get('Content-Type');
      const blob = await imageRes.blob();
      let bytes = Buffer.from(await blob.arrayBuffer());

      return {
        format: helper.convertImageExt(mime), // required
        source: {
          bytes
        },
      }
    } else if (url.indexOf('data:') >= 0) {
      const media_type = url.substring(5, url.indexOf(';'));
      const type = url.substring(url.indexOf(';') + 1, url.indexOf(','));
      const data = url.substring(url.indexOf(',') + 1);

      return {
        format: helper.convertImageExt(type), // required
        source: {
          bytes: Buffer.from(data, 'base64')
        },
      }
    }
    return null;
  }

  async convertContent(content: any): Promise<any[]> {
    if (typeof content === "string") {
      return [{
        text: content
      }];
    }
    const rtn: any[] = [];
    if (Array.isArray(content)) {
      for (const item of content) {
        rtn.push(await this.convertConverseSingleType(item));
      }
    }
    return rtn;
  }

  async convertConverseSingleType(contentItem: any): Promise<any> {
    if (contentItem.type === "image_url") {
      const url = contentItem.image_url.url;
      const image = await this.parseImageUrl(url);
      return {
        image
      }
    } else if (contentItem.type === "text") {
      return {
        text: contentItem.text
      }
    }
    return contentItem;
  }


  async toPayload(chatRequest: ChatRequest): Promise<any> {
    const messages = chatRequest.messages;
    const tools = chatRequest.tools;
    const tool_choice = chatRequest.tool_choice;
    const systemMessages = messages.filter(message => message.role === 'system');
    const userMessages = messages.filter(message => message.role === 'user');


    let newMessageJoin = "";
    for (const message of userMessages) {
      // console.log("ori msg: ", message)
      if (typeof message.content === "string") {
        newMessageJoin += (message.content || "\n\n");
      }
    }
    const inferenceConfig: any = {
      maxTokens: chatRequest.max_tokens || 256,
      stopSequences: chatRequest.stop_sequences || [],
      temperature: chatRequest.temperature || 0.5,
      topP: chatRequest.top_p || 1
    }

    const rtn: any = {
      messages: [{
        role: 'user',
        content: [
          {
            "type": "text",
            "text": newMessageJoin
          }
        ]
      }], inferenceConfig
    };



    // if (systemMessages.length > 0) {
    //   const system = systemMessages.map(msg => ({
    //     text: msg.content
    //   }));
    //   rtn.system = system;
    // }


    let xtools: any, toolChoice: any;

    if (tools) {
      xtools = tools.map(tool => ({
        toolSpec: {
          name: tool.function?.name,
          description: tool.function?.description,
          inputSchema: { json: JSON.stringify(tool.function?.parameters) }
        }
      }));
    }

    if (tool_choice) {
      if (typeof tool_choice === 'string') {
        toolChoice["auto"] = {}
      } else if (typeof tool_choice === 'object' && tool_choice.type === 'function') {
        toolChoice["tool"] = { name: tool_choice.function.name }
      }
      rtn.toolConfig.toolChoice = toolChoice;
    }

    if (xtools || toolChoice) {
      xtools && (rtn.toolConfig.tools = xtools);
      toolChoice && (rtn.toolConfig.toolChoice = toolChoice);
    }

    return rtn;
  }

}