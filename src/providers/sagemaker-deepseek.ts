import { ChatRequest, ResponseData } from "../entity/chat_request";
import AbstractProvider from "./abstract_provider";
import ChatMessageConverter from './chat_message';
import helper from "../util/helper";
import WebResponse from "../util/response";

import {
  SageMakerRuntimeClient,
  InvokeEndpointWithResponseStreamCommand,
  InvokeEndpointCommand,
} from "@aws-sdk/client-sagemaker-runtime";


/**
 * This provider enables communication with SageMaker Bedrock as an OpenAI Client.
 * The input data format is identical to the OpenAI input format.
 * Similarly, the output data format matches the OpenAI output format.
 *
 * Warning: This provider has not been thoroughly tested.
 */

export default class SagemakerDeepSeek extends AbstractProvider {

  client: SageMakerRuntimeClient;

  chatMessageConverter: ChatMessageConverter;

  platform: string;

  thinking: boolean = false;

  constructor() {
    super();
    this.chatMessageConverter = new ChatMessageConverter();
  }

  async chat(chatRequest: ChatRequest, session_id: string, ctx: any) {

    const endpointName = this.modelData.config && (this.modelData.config.endpointName);
    if (!endpointName) {
      throw new Error("You must specify the parameter 'endpointName'.")
    }
    const regions: [string] = this.modelData.config && this.modelData.config.regions || ["us-east-1"]; // If you deployed endpoint to multi-regions.
    if (!Array.isArray(regions)) {
      throw new Error("If you specify regions, please use the array format, such as: [\"us-east-1\", \"us-west-2\"].")
    }
    this.platform = (this.modelData.config && (this.modelData.config.platform)) || "openai";

    const thinking = this.modelData.config && (this.modelData.config.thinking);

    this.client = new SageMakerRuntimeClient({ region: helper.selectRandomRegion(regions) });

    ctx.status = 200;


    // ctx.logger.debug(body);

    // console.log(JSON.stringify(chatRequest, null, 2))
    const clonedRequest = JSON.parse(JSON.stringify(chatRequest));
    delete clonedRequest.currency;
    delete clonedRequest.price_in;
    delete clonedRequest.price_out;
    for (const message of clonedRequest.messages) {
      message.content = JSON.stringify(message.content)
    }

    if (thinking) {
      this.thinking = true;
      const lastQ = clonedRequest.messages[chatRequest.messages.length - 1];
      // lastQ.content += "\n<think>";
    }
    if (clonedRequest.temperature >= 1 || clonedRequest.temperature <= 0) {
      clonedRequest.temperature = 0.5
    }
    if (clonedRequest.top_p >= 1 || clonedRequest.top_p <= 0) {
      clonedRequest.top_p = 0.99
    }

    console.log(clonedRequest)
    // console.log(JSON.stringify(clonedRequest));

    const input: any = {
      EndpointName: endpointName, // required
      Body: Buffer.from(JSON.stringify(clonedRequest)), //new Uint8Array(), // e.g. Buffer.from("") or new TextEncoder().encode("")   // required
      ContentType: "application/json",
      Accept: "application/json",
      // CustomAttributes
    };
    // console.log(JSON.stringify(input, null, 2));

    ctx.status = 200;

    if (chatRequest.stream) {
      ctx.set({
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache',
        'Content-Type': 'text/event-stream',
      });

      await this.chatStream(ctx, input, chatRequest, session_id);
    } else {
      ctx.set({
        'Content-Type': 'application/json',
      });
      ctx.body = await this.chatSync(ctx, input, chatRequest, session_id);
    }
  }

  parseChunk(lineText: any) {
    // console.log(lineText);
    const chunkObj = JSON.parse(lineText);
    // console.log(JSON.stringify(chunkObj, null, 2));
    if (chunkObj.error) {
      throw new Error(chunkObj.error);
    }
    let content: string, finish_reason: string,
      id: string, reasoning_content: string;
    switch (this.platform) {
      case "deepseek":
        id = chunkObj.id;
        const choice2 = chunkObj.choices.length > 0 ? chunkObj.choices[0] : null;
        content = choice2 && choice2.delta?.content;
        reasoning_content = choice2 && choice2.delta?.reasoning_content;
        finish_reason = choice2 && choice2.finish_reason;
        break;
      default:
        id = this.newRequestID();
        const choice1 = chunkObj.choices.length > 0 ? chunkObj.choices[0] : null;
        const theContent = choice1 && choice1.delta?.content;
        let skipThinkTag = false;
        if (this.thinking && theContent.indexOf("</think>") >= 0) {
          this.thinking = false;
          skipThinkTag = true;
        }
        if (this.thinking) {
          reasoning_content = theContent;
        } else if (!skipThinkTag) {
          content = theContent;
        }
        finish_reason = choice1 && choice1.finish_reason;
        break;
    }
    return { id, content, finish_reason, reasoning_content };
  }

  async chatStream(ctx: any, input: any, chatRequest: ChatRequest, session_id: string) {
    const command = new InvokeEndpointWithResponseStreamCommand(input);
    const response = await this.client.send(command);

    let i = 0;
    if (response.Body) {
      let responseText = "";
      let lineText = "";
      const reqId = this.newRequestID();
      for await (const item of response.Body) {
        if (item.PayloadPart?.Bytes) {
          let chunk = new TextDecoder().decode(
            item.PayloadPart.Bytes,
          );
          //TODO if chunk is error, should throw it out...

          chunk = chunk.trim();
          if (chunk) {
            lineText += chunk;
            lineText = lineText.trim();
            console.log(lineText);

            if (lineText.startsWith("data:")) {
              lineText = lineText.substring(5);
              lineText = lineText.trim();
            }
            // Sometimes, output is half json string...
            if (lineText.startsWith("{") && lineText.endsWith("}")) {
              let { id, content, finish_reason, reasoning_content } = this.parseChunk(lineText);

              if (reasoning_content) {
                ctx.res.write("data: " + WebResponse.wrapReasoning(i, chatRequest.model, reasoning_content, id) + "\n\n");
              }
              if (content) {
                responseText += content;
                ctx.res.write("data: " + WebResponse.wrap(i, chatRequest.model, content, finish_reason, null, null, reqId) + "\n\n");
              }

              if (finish_reason == "error") {
                throw new Error("djl generate error.");
              }
              if (finish_reason) {
                finish_reason = "stop"

                console.log("responseText", responseText);
                ctx.res.write("data: " + WebResponse.wrap(i++, chatRequest.model, "", finish_reason, i, 0, reqId) + "\n\n");
                const response: ResponseData = {
                  text: responseText,
                  input_tokens: 0,
                  output_tokens: i, // one line is one token?
                  invocation_latency: 0,
                  first_byte_latency: 0
                }
                await this.saveThread(ctx, session_id, chatRequest, response);
              }
              lineText = "";
              // } catch (e) {
              //     console.log("chunk", chunk);
              //     console.error(e);
              //     ctx.logger.error(e);
              // }

              i++;
            }

          }
        }
      }
    } else {
      throw new Error("No response.");
    }

    ctx.res.write("data: [DONE]\n\n")
    ctx.res.end();

  }



  async chatSync(ctx: any, input: any, chatRequest: ChatRequest, session_id: string) {
    const command = new InvokeEndpointCommand(input);
    const apiResponse = await this.client.send(command);
    const decodedResponseBody = new TextDecoder().decode(apiResponse.Body);
    const responseBody = JSON.parse(decodedResponseBody);

    // console.log(responseBody);
    let content = responseBody.choices[0]["message"]["content"];
    const { prompt_tokens, completion_tokens, total_tokens } = responseBody.usage;
    const response: ResponseData = {
      text: content,
      input_tokens: prompt_tokens || 0,
      output_tokens: completion_tokens || 0,
      invocation_latency: 0,
      first_byte_latency: 0
    }

    await this.saveThread(ctx, session_id, chatRequest, response);

    return {
      choices: [{
        message: {
          content: content,
          role: "assistant"
        }
      }], usage: {
        completion_tokens,
        prompt_tokens,
        total_tokens
      }
    };
  }
}