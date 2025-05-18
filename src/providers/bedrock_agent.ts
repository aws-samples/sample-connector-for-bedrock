import { ChatRequest, ResponseData } from "../entity/chat_request"
import {
  BedrockAgentRuntimeClient, InvokeAgentCommand
} from "@aws-sdk/client-bedrock-agent-runtime";
import helper from "../util/helper";
// import config from "../config";
import WebResponse from "../util/response";
import AbstractProvider from "./abstract_provider";
import { ResponseItemsPage } from "openai/resources/responses/input-items.mjs";

/**
* BedrockConverse Provider uses boto3-converse api to invoke LLM models and support function calling.
*/
export default class BedrockAgent extends AbstractProvider {

  client: BedrockAgentRuntimeClient;
  constructor() {
    super();
  }

  async chat(chatRequest: ChatRequest, session_id: string, ctx: any) {
    // console.log(this.modelData);
    const { agentId, agentAliasId, region } = this.modelData.config;
    if (!agentId) {
      throw new Error("You must specify the parameters 'agentId' in the backend model configuration.")
    }
    if (!agentAliasId) {
      throw new Error("You must specify the parameters 'agentAliasId' in the backend model configuration.")
    }
    if (!region) {
      throw new Error("You must specify the parameters 'region' in the backend model configuration.")
    }

    if (!this.client) {
      this.client = new BedrockAgentRuntimeClient({
        region
      })
    }

    ctx.status = 200;

    const { messages } = chatRequest;
    const lastMsg = messages.pop();
    const inputText = lastMsg.content;

    const agentRequest: any = {
      agentId, agentAliasId, sessionId: session_id, inputText, enableTrace: false
    }


    if (chatRequest.stream) {
      ctx.set({
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache',
        'Content-Type': 'text/event-stream',
      });
      // agentRequest.streamingConfigurations = {
      //   streamFinalResponse: true
      // }
      await this.chatStream(ctx, agentRequest);
    } else {
      ctx.set({
        'Content-Type': 'application/json',
      });
      ctx.body = await this.chatSync(ctx, agentRequest);
    }
  }


  async chatStream(ctx: any, input: any) {
    const command = new InvokeAgentCommand(input);
    const response = await this.client.send(command);

    if (response.completion) {
      let responseText = "";
      const reqId = this.newRequestID();
      // ctx.res.write("data: " + WebResponse.wrap(0, chatRequest.model, "", null, null, null, reqId) + "\n\n");

      for await (const item of response.completion) {
        // console.log(JSON.stringify(item));
        if (item.chunk?.bytes) {
          const chunk = new TextDecoder().decode(
            item.chunk.bytes,
          );
          // console.log(chunk);
          ctx.res.write("data: " + WebResponse.wrap(1, "bedrock-agent", chunk, null, null, null, reqId) + "\n\n");
        }
      }
    } else {
      throw new Error("No response.");
    }
    ctx.res.write("data: [DONE]\n\n")
    ctx.res.end();
  }

  async chatSync(ctx: any, input: any) {

    const command = new InvokeAgentCommand(input);
    const response = await this.client.send(command);
    let responseText = "";
    if (response.completion) {
      const reqId = this.newRequestID();
      for await (const item of response.completion) {
        // console.log(JSON.stringify(item));
        if (item.chunk?.bytes) {
          const chunk = new TextDecoder().decode(
            item.chunk.bytes,
          );
          // console.log(chunk, "non stream")
          responseText += chunk;
        }
      }
    } else {
      throw new Error("No response.");
    }
    return {
      choices: [{
        message: {
          content: responseText,
          role: "assistant"
        }
      }]
    };
  }


}