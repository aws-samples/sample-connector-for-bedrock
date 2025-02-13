import { ChatRequest, ResponseData } from "../entity/chat_request"
import {
  BedrockRuntimeClient, InvokeModelCommand, InvokeModelWithResponseStreamCommand,
  ResponseStream
} from "@aws-sdk/client-bedrock-runtime";
import ChatMessageConverter from './chat_message';
import helper from "../util/helper";
// import config from "../config";
import WebResponse from "../util/response";
import AbstractProvider from "./abstract_provider";

export default class BedrockDeepSeek extends AbstractProvider {

  client: BedrockRuntimeClient;
  chatMessageConverter: ChatMessageConverter;
  modelId: string;
  maxTokens: number;
  promptFormat: string;
  constructor() {
    super();
    this.chatMessageConverter = new ChatMessageConverter();
  }

  async init() {
    this.modelId = this.modelData.config && this.modelData.config.modelId;
    if (!this.modelId) {
      throw new Error("You must specify the parameters 'modelId' in the backend model configuration.")
    }
    this.maxTokens = this.modelData.config && this.modelData.config.maxTokens;
    if (!this.maxTokens || isNaN(this.maxTokens)) {
      this.maxTokens = 1024;
    }
    this.promptFormat = this.modelData.config && this.modelData.config.promptFormat;
    if (!this.promptFormat) {
      this.promptFormat = "mistral";
    }
    let regions: any = this.modelData.config && this.modelData.config.regions;
    const region = helper.selectRandomRegion(regions);
    this.client = new BedrockRuntimeClient({ region });

  }

  async complete(chatRequest: ChatRequest, session_id: string, ctx: any) {
    throw new Error("Not ready.");
  };

  async chat(chatRequest: ChatRequest, session_id: string, ctx: any) {
    await this.init();

    // const payload = await this.chatMessageConverter.toLlama3Payload(chatRequest);

    // const prompt = await this.chatMessageConverter.toMistralPayload(chatRequest)
    // const prompt = await this.chatMessageConverter.toLlama3Payload(chatRequest) + (chatRequest.stream ? "<think>" : "")
    let prompt = "";
    // Llama 格式
    if (this.promptFormat === "llama") {
      prompt = await this.chatMessageConverter.toLlama3Payload(chatRequest)
    } else {
      prompt = await this.chatMessageConverter.toMistralPayload(chatRequest)
    }
    prompt += "<think>";


    let max_new_tokens = chatRequest.max_tokens || this.maxTokens;
    let top_p = chatRequest.top_p || 0.9;
    if (top_p <= 0) top_p = 0.1
    if (top_p >= 1) top_p = 0.99


    const body: any = {
      // messages: chatRequest.messages,
      max_new_tokens,
      prompt,
      temperature: chatRequest.temperature || 1.0,
      top_p,
      // stop: "[]"
    };

    console.log(body);

    const input = {
      body: JSON.stringify(body),
      contentType: "application/json",
      accept: "application/json",
      modelId: this.modelId
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
    const command = new InvokeModelWithResponseStreamCommand(input);
    const response = await this.client.send(command);

    if (response.body) {
      const streamResponse: AsyncIterable<ResponseStream> = response.body;
      let responseText = "";
      ctx.res.write("data: " + WebResponse.wrap(i, chatRequest.model, "> Think: \n> ", null) + "\n\n"); // Thinking..
      let thinking = true;
      const countResult = { completion_tokens: 0, prompt_tokens: 0 };
      for await (const item of streamResponse) {

        if (item.chunk?.bytes) {
          const decodedResponseBody = new TextDecoder().decode(
            item.chunk.bytes,
          );

          const responseBody = JSON.parse(decodedResponseBody);

          // const text = responseBody.choices[0]["text"];

          const { choices: [{ text, finish_reason }], usage: { prompt_tokens, completion_tokens } = {} } = responseBody;

          if (prompt_tokens && completion_tokens > 0) {
            countResult.completion_tokens = completion_tokens;
          }
          if (prompt_tokens && prompt_tokens > 0) {
            countResult.prompt_tokens = prompt_tokens;
          }

          responseText += text;
          // console.log("xxxxx", text, finish_reason, prompt_tokens);


          if (finish_reason === "eos_token") {
            ctx.res.write("data: [DONE]\n\n")
          } else if (text != "</think>") {
            responseText += text;

            if (text.endsWith("\n") && thinking) {
              const newText = text.replace(/\n/g, "\n>");
              ctx.res.write("data: " + WebResponse.wrap(i, chatRequest.model, newText, null) + "\n\n");
            } else {
              ctx.res.write("data: " + WebResponse.wrap(i, chatRequest.model, text, null) + "\n\n");
            }
          }
          if (text === "</think>") {
            thinking = false;
          }



        }

      }
      i++;

      const response2: ResponseData = {
        text: responseText,
        input_tokens: countResult.prompt_tokens,
        output_tokens: countResult.prompt_tokens
      }

      await this.saveThread(ctx, session_id, chatRequest, response2);
      ctx.res.end();
    } else {
      throw new Error("No response");
    }
  }

  async chatSync(ctx: any, input: any, chatRequest: ChatRequest, session_id: string) {


    const command = new InvokeModelCommand(input);
    const apiResponse = await this.client.send(command);
    const decodedResponseBody = new TextDecoder().decode(apiResponse.body);
    const responseBody = JSON.parse(decodedResponseBody);

    console.log(responseBody);


    const { choices: [{ text }], usage: { prompt_tokens, completion_tokens, total_tokens } = {} } = responseBody;

    const endIndex = text.indexOf("</think>") + "</think>".length;
    const result = text.slice(endIndex).trim();

    const response: ResponseData = {
      text: result,
      input_tokens: prompt_tokens,
      output_tokens: completion_tokens,
      invocation_latency: 0,
      first_byte_latency: 0
    }

    await this.saveThread(ctx, session_id, chatRequest, response);


    return {
      choices: [{
        message: {
          content: result,
          role: "assistant"
        }
      }], usage: {
        completion_tokens,
        prompt_tokens,
        total_tokens,
      }
    };


  }
}
