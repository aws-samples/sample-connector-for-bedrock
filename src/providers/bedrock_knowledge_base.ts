import { ChatRequest } from "../entity/chat_request";
import AbstractProvider from "./abstract_provider";
import {
  BedrockAgentRuntimeClient,
  BedrockAgentRuntime,
  RetrieveCommand,
} from "@aws-sdk/client-bedrock-agent-runtime";

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelWithResponseStreamCommand,
} from "@aws-sdk/client-bedrock-runtime";

// In dev-ing
export default class BedrockClaude extends AbstractProvider {

  client: BedrockRuntimeClient;
  clientAgent: BedrockAgentRuntimeClient;

  chat(chatRequest: ChatRequest, session_id: string, ctx: any): void {
    throw new Error("Method not implemented.");
  }
}