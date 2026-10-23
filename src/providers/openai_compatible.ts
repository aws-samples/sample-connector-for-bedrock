//openai compatible connector
import OpenAI from 'openai';
import { ChatRequest, ResponseData } from "../entity/chat_request"
import AbstractProvider from "./abstract_provider";
import { pipeOpenAIStream } from "./openai_stream";
// import helper from '../util/helper';

export default class OpenAICompatible extends AbstractProvider {

  client: OpenAI;
  constructor() {
    super();
  }

  async chat(chatRequest: ChatRequest, session_id: string, ctx: any) {
    // console.log(this.modelData);
    const { baseURL, model, apiKey } = this.modelData.config;
    if (!baseURL) {
      throw new Error("You must specify the parameters 'baseURL' in the backend model configuration.")
    }
    if (!apiKey) {
      throw new Error("You must specify the parameters 'apiKey' in the backend model configuration.")
    }
    // if (!model) {
    //   throw new Error("You must specify the parameters 'model' in the backend model configuration.")
    // }
    if (!this.client || this.client.baseURL != baseURL) {
      this.client = new OpenAI({
        baseURL,
        apiKey
      });
    }

    if (!chatRequest.model_id && model) {
      chatRequest.model_id = model;
    }

    ctx.status = 200;

    if (chatRequest.stream) {
      ctx.set({
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache',
        'Content-Type': 'text/event-stream',
      });
      await this.chatStream(ctx, chatRequest, session_id);
    } else {
      ctx.set({
        'Content-Type': 'application/json',
      });
      ctx.body = await this.chatSync(ctx, chatRequest, session_id);
    }
  }

  async chatStream(ctx: any, chatRequest: ChatRequest, session_id: string) {
    // The upstream is asked for usage so the call can be billed, unless the model config turns that off for an
    // upstream that rejects stream_options.
    const streamUsage = this.modelData.config?.streamUsage !== false;

    const chatResponse = await this.client.chat.completions.create({
      model: chatRequest.model_id,
      messages: JSON.parse(JSON.stringify(chatRequest.messages)),
      temperature: chatRequest.temperature || 1.0,
      top_p: chatRequest.top_p || 1.0,
      max_tokens: chatRequest.max_tokens,
      max_completion_tokens: chatRequest.max_completion_tokens,
      stream: true,
      ...(streamUsage && { stream_options: { include_usage: true } }),
      ...(chatRequest.tools && { tools: chatRequest.tools }),
      ...(chatRequest.tool_choice && { tool_choice: chatRequest.tool_choice })
    });

    const { text, usage } = await pipeOpenAIStream(ctx, chatResponse, {
      forwardUsageChunk: chatRequest.stream_options?.include_usage === true,
    });
    // Billed once the stream has ended, whatever its finish reason.
    if (!usage) {
      ctx.logger.warn({ message: 'openai-compatible stream had no usage, so it is billed as zero tokens', model: this.modelData.name, modelId: chatRequest.model_id });
    }
    const response: ResponseData = {
      text,
      input_tokens: usage?.prompt_tokens ?? 0,
      output_tokens: usage?.completion_tokens ?? 0,
    }
    await this.saveThread(ctx, session_id, chatRequest, response);

    ctx.res.write("data: [DONE]\n\n")
    ctx.res.end();

  }

  async chatSync(ctx: any, chatRequest: ChatRequest, session_id: string) {
    const messages = JSON.parse(JSON.stringify(chatRequest.messages));
    const chatResponse = await this.client.chat.completions.create({
      model: chatRequest.model_id,
      temperature: chatRequest.temperature || 1.0,
      top_p: chatRequest.top_p || 1.0,
      max_tokens: chatRequest.max_tokens,
      max_completion_tokens: chatRequest.max_completion_tokens,
      messages: messages,
      ...(chatRequest.tools && { tools: chatRequest.tools }),
      ...(chatRequest.tool_choice && { tool_choice: chatRequest.tool_choice })
    });

    const {
      completion_tokens = 0,
      prompt_tokens = 0
    } = chatResponse.usage ?? {};

    // console.log(chatResponse);

    const content = chatResponse.choices[0].message.content || "";

    const response: ResponseData = {
      text: content,
      input_tokens: prompt_tokens,
      output_tokens: completion_tokens,
    }

    await this.saveThread(ctx, session_id, chatRequest, response);

    return chatResponse;

  }

}
