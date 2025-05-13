//openai compatible connector
import OpenAI from 'openai';
import { ChatRequest, ResponseData } from "../entity/chat_request"
import AbstractProvider from "./abstract_provider";
// import helper from '../util/helper';


interface ExtendedDelta {
  content?: string;
  reasoning_content?: string;
}

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

    const chatResponse = await this.client.chat.completions.create({
      model: chatRequest.model_id,
      messages: JSON.parse(JSON.stringify(chatRequest.messages)),
      temperature: chatRequest.temperature || 1.0,
      top_p: chatRequest.top_p || 1.0,
      max_tokens: chatRequest.max_tokens,
      stream: true
    });


    let responseText = "";
    // let i = 0;
    for await (const part of chatResponse) {
      // console.log(JSON.stringify(part));
      const reasoning_content = (part.choices[0]?.delta as ExtendedDelta)?.reasoning_content || '';
      // process.stdout.write(reasoning_content);
      responseText += reasoning_content;
      const content = part.choices[0]?.delta?.content || '';
      responseText += content;
      // i++;
      if (part.choices[0]?.finish_reason === "stop") {
        const {
          completion_tokens = 0,
          prompt_tokens = 0
        } = part.usage ?? {};

        // console.log("response:" + responseText);

        const response: ResponseData = {
          text: responseText,
          input_tokens: prompt_tokens,
          output_tokens: completion_tokens,
        }
        await this.saveThread(ctx, session_id, chatRequest, response);

      }
      ctx.res.write("data: " + JSON.stringify(part) + "\n\n");
    }
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
      messages: messages
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
