import { ChatRequest, ResponseData } from "../entity/chat_request"
import {
    BedrockRuntimeClient,
    InvokeModelCommand,
    InvokeModelWithResponseStreamCommand,
} from "@aws-sdk/client-bedrock-runtime";
import helper from "../util/helper";
// import config from "../config";
import WebResponse from "../util/response";
import AbstractProvider from "./abstract_provider";
import ChatMessageConverter from './chat_message';


export default class BedrockClaude extends AbstractProvider {

    client: BedrockRuntimeClient;
    chatMessageConverter: ChatMessageConverter;
    constructor() {
        super();
        this.chatMessageConverter = new ChatMessageConverter();
    }

    async chat(chatRequest: ChatRequest, session_id: string, ctx: any) {
        const anthropic_version = this.modelData.config?.anthropic_version || "bedrock-2023-05-31";
        const modelId = this.modelData.config && (this.modelData.config.model_id || this.modelData.config.modelId);
        if (!modelId) {
            throw new Error("You must specify the parameters 'modelId' in the backend model configuration.")
        }

        let regions: any = this.modelData.config && this.modelData.config.regions;
        const region = helper.selectRandomRegion(regions);
        this.client = new BedrockRuntimeClient({ region });
        const payload = await this.chatMessageConverter.toClaude3Payload(chatRequest);

        const body: any = {
            anthropic_version,
            "max_tokens": chatRequest.max_tokens || 4096,
            "messages": payload.messages,
            "temperature": chatRequest.temperature || 1.0,
            "top_p": chatRequest.top_p || 1,
            "top_k": chatRequest["top_k"] || 50
        };
        if (payload.systemPrompt && payload.systemPrompt.length > 0) {
            body.system = JSON.stringify(payload.systemPrompt);
        }

        const input = {
            body: JSON.stringify(body),
            contentType: "application/json",
            accept: "application/json",
            modelId,
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
        // console.log(input);
        const response = await this.client.send(command);

        if (response.body) {
            let responseText = "";
            let model: any, content: any, finish_reason: any, completion_tokens: number, prompt_tokens: number;
            for await (const item of response.body) {
                if (item.chunk?.bytes) {
                    const decodedResponseBody = new TextDecoder().decode(
                        item.chunk.bytes,
                    );
                    i++;
                    const responseBody = JSON.parse(decodedResponseBody);
                    // console.log(responseBody);

                    if (responseBody.type === "message_start") {
                        model = responseBody.message.model;
                        content = null;
                        finish_reason = responseBody.message.stop_reason;
                        completion_tokens = responseBody.message.output_tokens;
                        prompt_tokens = responseBody.message.input_tokens;
                    } else if (responseBody.type === "content_block_start") {
                        finish_reason = null;
                        content = responseBody.content_block?.text;
                        content && (responseText += content);
                        completion_tokens = 0;
                        prompt_tokens = 0;
                    } else if (responseBody.type === "content_block_delta") {
                        content = responseBody.delta?.text;
                        content && (responseText += content);
                        completion_tokens = 0;
                        prompt_tokens = 0;
                        finish_reason = null;
                        ctx.res.write("data:" + WebResponse.wrap(i, model, content, finish_reason) + "\n\n");
                    } else if (responseBody.type === "message_delta") {
                        content = null;
                        completion_tokens = responseBody.usage?.output_tokens;
                        prompt_tokens = 0;
                        finish_reason = responseBody.delta?.stop_reason;
                    } else if (responseBody.type === "message_stop") {
                        const {
                            inputTokenCount, outputTokenCount,
                            invocationLatency, firstByteLatency
                        } = responseBody["amazon-bedrock-invocationMetrics"];

                        const response: ResponseData = {
                            text: responseText,
                            input_tokens: inputTokenCount,
                            output_tokens: outputTokenCount,
                            invocation_latency: invocationLatency,
                            first_byte_latency: firstByteLatency
                        }

                        await this.saveThread(ctx, session_id, chatRequest, response);
                    }
                }
            }
            ctx.res.write("data: [DONE]\n\n")
            ctx.res.end();
        } else {
            throw new Error("No response.");
        }
    }

    async chatSync(ctx: any, input: any, chatRequest: ChatRequest, session_id: string) {

        const command = new InvokeModelCommand(input);
        const apiResponse = await this.client.send(command);
        const decodedResponseBody = new TextDecoder().decode(apiResponse.body);
        const responseBody = JSON.parse(decodedResponseBody);
        const response: ResponseData = {
            text: responseBody.content[0].text,
            input_tokens: responseBody.usage.input_tokens,
            output_tokens: responseBody.usage.output_tokens,
            invocation_latency: 0,
            first_byte_latency: 0
        }
        await this.saveThread(ctx, session_id, chatRequest, response);
        const choices = responseBody.content.map((c: any) => {
            return {
                message: {
                    content: c.text,
                    role: "assistant"
                }
            }
        });
        return {
            choices, usage: {
                completion_tokens: responseBody.usage.output_tokens,
                prompt_tokens: responseBody.usage.input_tokens,
                total_tokens: responseBody.usage.input_tokens + responseBody.usage.output_tokens,
            }
        };
    }

}
