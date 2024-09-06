import { ChatRequest, ResponseData } from "../entity/chat_request"
import {
  BedrockRuntimeClient, ConverseStreamCommand, ConverseCommand
} from "@aws-sdk/client-bedrock-runtime";
// import helper from "../util/helper";
// import config from "../config";
// import WebResponse from "../util/response";
import AbstractProvider from "./abstract_provider";

/**
 * BedrockConverse Provider uses boto3-converse api to invoke LLM models and support function calling.
 */
export default class ContinueCoder extends AbstractProvider {

  client: BedrockRuntimeClient;
  chatMessageConverter: MessageConverter;
  modelId: string;
  constructor() {
    super();
    this.chatMessageConverter = new MessageConverter();
  }

  init(chatRequest: ChatRequest) {
    let { localLlmModel } = this.modelData.config;
    if (!localLlmModel) {
      throw new Error("You must specify the parameter 'localLlmModel'.")
    }
    chatRequest.model = localLlmModel;
  }
  async complete(chatRequest: ChatRequest, session_id: string, ctx: any) {
    this.init(chatRequest);
    const payload = await this.chatMessageConverter.toPayload(chatRequest);

    ctx.status = 200;

    if (payload.stream) {
      ctx.set({
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache',
        'Content-Type': 'text/event-stream',
      });
      await this.localCompleteStream(ctx, payload, session_id);
    } else {
      ctx.set({
        'Content-Type': 'application/json',
      });

      ctx.body = await this.localCompleteSync(ctx, payload, session_id);
    }
  }



  async chat(chatRequest: ChatRequest, session_id: string, ctx: any) {
    // console.log("--payload-------------", JSON.stringify(chatRequest, null, 2));
    // console.log("-ori--------------", JSON.stringify(chatRequest, null, 2));
    this.init(chatRequest);
    // const payload = await this.chatMessageConverter.toPayload(chatRequest);

    ctx.status = 200;


    if (chatRequest.stream) {
      ctx.set({
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache',
        'Content-Type': 'text/event-stream',
      });
      await this.localChatStream(ctx, chatRequest, session_id);
      // ctx.body = "ok"
    } else {
      ctx.set({
        'Content-Type': 'application/json',
      });
      // ctx.body = "ok";

      ctx.body = await this.localChatSync(ctx, chatRequest, session_id);
    }
  }

}

class MessageConverter {
  async toPayload(chatRequest: ChatRequest): Promise<any> {
    const prompt = chatRequest.prompt;
    const stop = chatRequest.stop;
    const max_tokens = chatRequest.max_tokens || 1024;
    const temperature = chatRequest.temperature || 0.01;

    const newMessages = [
      {
        "role": "system",
        "content": `You are a professional code generation assistant. Your task is to generate accurate and concise code snippets based on user requests. Please follow these rules:

1. Generate only code, without any explanations or comments.
2. The code should be complete and runnable.
3. Use standard coding style and best practices.
4. Do not include any additional text, markers, or formatting.
5. Start writing the code directly, without adding function names or other prefixes.
6. Do not add any ending markers or comments at the end.
7. Keep the code concise, including only necessary logic.
8. If you cannot infer the programming language, use Python.

Remember, your output should contain pure code only, without any other content. Accurately understand the user's requirements and provide the most suitable code implementation.
`
      },
      {
        role: "user",
        content: prompt
      }
    ];

    return {
      model: chatRequest.model, messages: newMessages, stream: true, max_tokens, temperature, stop
    };

  }


}