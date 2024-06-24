import { ChatRequest, ResponseData } from "../../entity/chat_request";
import AbstractProvider from "../abstract_provider";
import ChatMessageConverter from '../chat_message';
import config from '../../config';
import helper from "../../util/helper";
import WebResponse from "../../util/response";

import {
  SageMakerRuntimeClient,
  InvokeEndpointWithResponseStreamCommand,
  InvokeEndpointCommand,
} from "@aws-sdk/client-sagemaker-runtime";

export default class SagemakerLlama3 extends AbstractProvider {

  client: SageMakerRuntimeClient;

  chatMessageConverter: ChatMessageConverter;

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

    this.client = new SageMakerRuntimeClient({ region: helper.selectRandomRegion(regions) });

    const prompt = await this.chatMessageConverter.toLlama3Payload(chatRequest);
    let max_gen_len = chatRequest.max_tokens || 8000; // sum input and output must less than 2048
    if (max_gen_len > 8000) {
      max_gen_len = 8000;
    }

    const body: any = {
      inputs: prompt,
      parameters: {
        max_new_tokens: max_gen_len,
        return_full_text: false,
        temperature: chatRequest.temperature || 1.0,
        top_p: chatRequest.top_p >= 1 ? 0.9 : chatRequest.top_p,
        do_sample: chatRequest.temperature < 1.0,
        stop: ["<|eot_id|>"]
      },
      stream: chatRequest.stream
    };

    // ctx.logger.debug(body);

    const input = {
      EndpointName: endpointName, // required
      Body: Buffer.from(JSON.stringify(body)), //new Uint8Array(), // e.g. Buffer.from("") or new TextEncoder().encode("")   // required
      ContentType: "application/json",
      Accept: "application/json",
    };

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
  async chatStream(ctx: any, input: any, chatRequest: ChatRequest, session_id: string) {
    let i = 0;
    const command = new InvokeEndpointWithResponseStreamCommand(input);
    const response = await this.client.send(command);
    // console.log(response);

    if (response.Body) {
      let responseText = "";
      let oneSentence = "";
      for await (const item of response.Body) {
        i++;
        // console.log(item);
        if (item.PayloadPart?.Bytes) {
          let chunk = new TextDecoder().decode(
            item.PayloadPart.Bytes,
          );
          chunk = chunk.trim();
          if (chunk.endsWith("null}")) {
            oneSentence += chunk;
            const sentenses = oneSentence.split("data:");
            oneSentence = "";
            for (const oneJson of sentenses) {
              if (oneJson == "") {
                continue;
              }
              const responseBody = JSON.parse(oneJson);
              // console.log("responseBody", responseBody);
              if (responseBody.error) {
                throw new Error(responseBody.error);
              }
              const text = responseBody.token.text;
              // console.log(text);
              if (text == "<|eot_id|>") {
                const response: ResponseData = {
                  text: responseText,
                  input_tokens: 0,
                  output_tokens: 0,
                  invocation_latency: 0,
                  first_byte_latency: 0
                }

                await this.saveThread(ctx, session_id, chatRequest, response);
              } else {
                responseText += text;

                ctx.res.write("data:" + WebResponse.wrap(0, chatRequest.model, text, null) + "\n\n");

              }
            }
          } else {
            oneSentence += chunk.trim();
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

    // console.log("---------", apiResponse);


    const decodedResponseBody = new TextDecoder().decode(apiResponse.Body);

    console.log("gen...", decodedResponseBody);


    const responseBody = JSON.parse(decodedResponseBody);

    let content = responseBody[0]["generated_text"];
    // content = content.substring("<|start_header_id|>assistant<|end_header_id|>\n".length);

    const response: ResponseData = {
      text: content,
      input_tokens: 0,
      output_tokens: 0,
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
        completion_tokens: 0,
        prompt_tokens: 0,
        total_tokens: 0,
      }
    };


  }

}