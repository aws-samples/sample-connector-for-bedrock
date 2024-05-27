import { ChatRequest, ResponseData } from "../entity/chat_request";
import AbstractProvider from "./abstract_provider";
import ChatMessageConverter from './chat_message';
import config from '../config';
import WebResponse from "../util/response";

import {
    BedrockRuntimeClient,
    InvokeModelCommand,
    InvokeModelWithResponseStreamCommand,
    ResponseStream,
} from "@aws-sdk/client-bedrock-runtime";


export default class BedrockLlama3 extends AbstractProvider {

    client: BedrockRuntimeClient;
    chatMessageConverter: ChatMessageConverter;
    constructor() {
        super();
        this.client = new BedrockRuntimeClient({ region: config.bedrock.region });
        this.chatMessageConverter = new ChatMessageConverter();
    }

    async chat(chatRequest: ChatRequest, session_id: string, ctx: any) {

        const prompt = await this.chatMessageConverter.toLlama3Payload(chatRequest);

        const body: any = {
            "max_gen_len": chatRequest.max_tokens || 2048,
            prompt,
            "temperature": chatRequest.temperature || 1.0,
            "top_p": chatRequest.top_p || 1.0,
        };

        // ctx.logger.debug(body);

        const input = {
            body: JSON.stringify(body),
            contentType: "application/json",
            accept: "application/json",
            modelId: chatRequest.model_id,
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
        try {
            const command = new InvokeModelWithResponseStreamCommand(input);
            const response = await this.client.send(command);

            if (response.body) {
                let responseText = "";
                for await (const item of response.body) {
                    if (item.chunk?.bytes) {
                        const chunk = new TextDecoder().decode(
                            item.chunk.bytes,
                        );

                        const responseBody = JSON.parse(chunk);
                        // console.log(i, responseBody);

                        if ("amazon-bedrock-invocationMetrics" in responseBody) {
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
                        } else {
                            const genChunk = responseBody.generation;
                            responseText += genChunk;

                            i++;
                            if (i > 3) { // first three chunk is tag
                                // ctx.res.write("id: " + i + "\n");
                                // ctx.res.write("event: message\n");

                                ctx.res.write("data: " + JSON.stringify({
                                    choices: [
                                        { delta: { content: responseBody.generation } }
                                    ]
                                }) + "\n\n");
                            }
                        }
                    }
                }
            } else {
                ctx.res.write("id: " + (i + 1) + "\n");
                ctx.res.write("event: message\n");
                ctx.res.write("data: " + JSON.stringify({
                    choices: [
                        { delta: { content: "Error invoking model" } }
                    ]
                }) + "\n\n");
            }
        } catch (e: any) {
            ctx.logger.error(e.message);
            if (config.debugMode) {
                console.error(e);
            }
            ctx.res.write("id: " + (i + 1) + "\n");
            ctx.res.write("event: message\n");
            ctx.res.write("data: " + JSON.stringify({
                choices: [
                    { delta: { content: "Error invoking model: " + e.message } }
                ]
            }) + "\n\n");
        }

        // ctx.res.write("id: " + (i + 1) + "\n");
        // ctx.res.write("event: message\n");
        ctx.res.write("data: [DONE]\n\n")
        ctx.res.end();
    }

    async chatSync(ctx: any, input: any, chatRequest: ChatRequest, session_id: string) {
        try {
            const command = new InvokeModelCommand(input);
            const apiResponse = await this.client.send(command);

            const decodedResponseBody = new TextDecoder().decode(apiResponse.body);

            const responseBody = JSON.parse(decodedResponseBody);

            let content = responseBody.generation;
            content = content.substring("<|start_header_id|>assistant<|end_header_id|>\n".length);

            const response: ResponseData = {
                text: content,
                input_tokens: responseBody.prompt_token_count,
                output_tokens: responseBody.generation_token_count,
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
                    completion_tokens: responseBody.prompt_token_count,
                    prompt_tokens: responseBody.generation_token_count,
                    total_tokens: responseBody.prompt_token_count + responseBody.generation_token_count,
                }
            };
        } catch (e: any) {
            return WebResponse.error(e.message);
        }

    }

}