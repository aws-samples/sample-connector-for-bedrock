import { ChatRequest, ResponseData } from "../entity/chat_request"
import {
  BedrockAgentRuntimeClient, InvokeAgentCommand
} from "@aws-sdk/client-bedrock-agent-runtime";
import helper from "../util/helper";
// import config from "../config";
import WebResponse from "../util/response";
import AbstractProvider from "./abstract_provider";
import { ResponseItemsPage } from "openai/resources/responses/input-items.mjs";

// The tokens of the model invocations reported in one InvokeAgent trace event. Every step that invokes the model
// (pre-processing, orchestration, post-processing and the routing classifier) reports them in
// modelInvocationOutput.metadata.usage; other trace events count as 0.
export function agentTraceUsage(trace: any): { input_tokens: number; output_tokens: number } {
  const usage = { input_tokens: 0, output_tokens: 0 };
  const steps = trace?.trace;
  if (steps && typeof steps === 'object') {
    for (const step of Object.values<any>(steps)) {
      const tokens = step?.modelInvocationOutput?.metadata?.usage;
      usage.input_tokens += Number(tokens?.inputTokens) || 0;
      usage.output_tokens += Number(tokens?.outputTokens) || 0;
    }
  }
  return usage;
}

function addTraceUsage(usage: { input_tokens: number; output_tokens: number }, trace: any) {
  const tokens = agentTraceUsage(trace);
  usage.input_tokens += tokens.input_tokens;
  usage.output_tokens += tokens.output_tokens;
}

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

    // The last message is read, not removed, so saveThread records it as the prompt.
    const { messages } = chatRequest;
    const lastMsg = messages[messages.length - 1];
    const inputText = lastMsg.content;

    // The trace carries the token usage of every model invocation, which the call is billed for. Trace events are
    // read for that only: they are neither sent to the client nor logged.
    const agentRequest: any = {
      agentId, agentAliasId, sessionId: session_id, inputText, enableTrace: true
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
      await this.chatStream(ctx, agentRequest, chatRequest, session_id);
    } else {
      ctx.set({
        'Content-Type': 'application/json',
      });
      ctx.body = await this.chatSync(ctx, agentRequest, chatRequest, session_id);
    }
  }


  async chatStream(ctx: any, input: any, chatRequest: ChatRequest, session_id: string) {
    const command = new InvokeAgentCommand(input);
    const response = await this.client.send(command);

    if (response.completion) {
      let responseText = "";
      const usage = { input_tokens: 0, output_tokens: 0 };
      const reqId = this.newRequestID();
      // ctx.res.write("data: " + WebResponse.wrap(0, chatRequest.model, "", null, null, null, reqId) + "\n\n");

      for await (const item of response.completion) {
        if (item.chunk?.bytes) {
          const chunk = new TextDecoder().decode(
            item.chunk.bytes,
          );
          responseText += chunk;
          ctx.res.write("data: " + WebResponse.wrap(1, "bedrock-agent", chunk, null, null, null, reqId) + "\n\n");
        } else if (item.trace) {
          addTraceUsage(usage, item.trace);
        }
      }
      await this.saveThread(ctx, session_id, chatRequest, { text: responseText, ...usage });
    } else {
      throw new Error("No response.");
    }
    ctx.res.write("data: [DONE]\n\n")
    ctx.res.end();
  }

  async chatSync(ctx: any, input: any, chatRequest: ChatRequest, session_id: string) {

    const command = new InvokeAgentCommand(input);
    const response = await this.client.send(command);
    let responseText = "";
    if (response.completion) {
      const usage = { input_tokens: 0, output_tokens: 0 };
      for await (const item of response.completion) {
        if (item.chunk?.bytes) {
          const chunk = new TextDecoder().decode(
            item.chunk.bytes,
          );
          responseText += chunk;
        } else if (item.trace) {
          addTraceUsage(usage, item.trace);
        }
      }
      await this.saveThread(ctx, session_id, chatRequest, { text: responseText, ...usage });
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