import { ChatRequest, ResponseData } from "../entity/chat_request";
import AbstractProvider from "./abstract_provider";
import ChatMessageConverter from './chat_message';
import helper from "../util/helper";
// import WebResponse from "../util/response";

import {
    BedrockRuntimeClient,
    InvokeModelCommand,
    InvokeModelWithResponseStreamCommand,
    ResponseStream,
} from "@aws-sdk/client-bedrock-runtime";

// SDK Not ready for Mistral...
export default class BedrockMixtral extends AbstractProvider {

    client: BedrockRuntimeClient;
    chatMessageConverter: ChatMessageConverter;
    constructor() {
        super();
        // this.client = new BedrockRuntimeClient({ region: helper.selectRandomRegion(config.bedrock.region) });
        this.chatMessageConverter = new ChatMessageConverter();
    }

    async chat(chatRequest: ChatRequest, session_id: string, ctx: any) {
        const model_id = this.modelData.config && this.modelData.config.model_id;
        if (!model_id) {
            throw new Error("You must specify the parameters 'model_id' in the backend model configuration.")
        }

        const regions: [string] = this.modelData.config && this.modelData.config.regions || ["us-east-1"];
        if (!Array.isArray(regions)) {
            throw new Error("If you specify regions, please use the array format, such as: [\"us-east-1\", \"us-west-2\"].")
        }

        this.client = new BedrockRuntimeClient({ region: helper.selectRandomRegion(regions) });

        const prompt = await this.chatMessageConverter.toMistralPayload(chatRequest);
        // const payload = await this.chatMessageConverter.toMistralPayload(chatRequest);
        let max_tokens = chatRequest.max_tokens || 8192;
        if (this.modelData.name == "mistral-8x7b") {
            if (max_tokens > 4096 || max_tokens <= 0) max_tokens = 4096
        } else {
            if (max_tokens > 8192 || max_tokens <= 0) max_tokens = 8192
        }
        const body: any = {
            max_tokens,
            prompt,
            "temperature": chatRequest.temperature || 1.0,
        };
        // ctx.logger.debug(body);

        const input = {
            body: JSON.stringify(body),
            contentType: "application/json",
            accept: "application/json",
            modelId: model_id,
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
            for await (const item of streamResponse) {

                if (item.chunk?.bytes) {
                    const decodedResponseBody = new TextDecoder().decode(
                        item.chunk.bytes,
                    );
                    const responseBody = JSON.parse(decodedResponseBody);

                    const { outputs } = responseBody;

                    // const x = outputs && outputs.length > 0 && outputs[0]
                    // console.log("extracted", x);

                    const { text, stop_reason } = outputs && outputs.length > 0 && outputs[0];

                    if (!stop_reason) {
                        i++;
                        responseText += text;
                        // ctx.res.write("id: " + i + "\n");
                        // ctx.res.write("event: message\n");
                        ctx.res.write("data: " + JSON.stringify({
                            choices: [
                                { delta: { content: text } }
                            ]
                        }) + "\n\n");
                    } else if (stop_reason === "stop") {
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
            throw new Error("No response");
        }
    }

    // TODO: Mistral model sync invoke not contains tokens quantity.
    async chatSync(ctx: any, input: any, chatRequest: ChatRequest, session_id: string) {


        const command = new InvokeModelCommand(input);
        const apiResponse = await this.client.send(command);
        const decodedResponseBody = new TextDecoder().decode(apiResponse.body);
        const responseBody = JSON.parse(decodedResponseBody);

        const response: ResponseData = {
            text: responseBody.outputs[0].text,
            input_tokens: 0, // Api response does not contain tokens
            output_tokens: 0,
            invocation_latency: 0,
            first_byte_latency: 0
        }

        await this.saveThread(ctx, session_id, chatRequest, response);


        // return responseBody;
        const choices = responseBody.outputs.map((c: any) => {
            return {
                message: {
                    content: c.text,
                    role: "assistant"
                }
            }
        });
        return {
            choices, usage: {
                completion_tokens: 0,
                prompt_tokens: 0,
                total_tokens: 0,
            }
        };


    }

}