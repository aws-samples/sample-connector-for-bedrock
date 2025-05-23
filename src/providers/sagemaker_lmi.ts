import { ChatRequest, ResponseData } from "../entity/chat_request";
import AbstractProvider from "./abstract_provider";
import ChatMessageConverter from './chat_message';
import helper from "../util/helper";
import WebResponse from "../util/response";

import {
    SageMakerRuntimeClient,
    InvokeEndpointWithResponseStreamCommand,
    InvokeEndpointCommand,
} from "@aws-sdk/client-sagemaker-runtime";

/**
 * This provider enables communication with SageMaker as an OpenAI Client.
 * The input data format is identical to the OpenAI input format.
 * Similarly, the output data format matches the OpenAI output format.
 *
 * Warning: This provider has not been thoroughly tested.
 */

export default class SagemakerLMI extends AbstractProvider {

    client: SageMakerRuntimeClient;

    chatMessageConverter: ChatMessageConverter;

    constructor() {
        super();
        this.chatMessageConverter = new ChatMessageConverter();
    }

    async chat(chatRequest: ChatRequest, session_id: string, ctx: any) {

        const endpointName = this.modelData.config && (this.modelData.config.endpointName);
        if (!endpointName) {
            throw new Error("You must specify the parameter 'endpointName'.")
        }

        const regions: [string] = this.modelData.config && this.modelData.config.regions || ["us-east-1"]; // If you deployed endpoint to multi-regions.
        if (!Array.isArray(regions)) {
            throw new Error("If you specify regions, please use the array format, such as: [\"us-east-1\", \"us-west-2\"].")
        }

        this.client = new SageMakerRuntimeClient({ region: helper.selectRandomRegion(regions) });

        ctx.status = 200;


        // ctx.logger.debug(body);

        const clonedRequest = JSON.parse(JSON.stringify(chatRequest));
        delete clonedRequest.currency;
        delete clonedRequest.price_in;
        delete clonedRequest.price_out;



        const input: any = {
            EndpointName: endpointName, // required
            Body: Buffer.from(JSON.stringify(clonedRequest)), //new Uint8Array(), // e.g. Buffer.from("") or new TextEncoder().encode("")   // required
            ContentType: "application/json",
            Accept: "application/json",
            // CustomAttributes
        };

        const CustomAttributes = ctx.headers.hasOwnProperty("x-amzn-sagemaker-custom-attributes") ?
            ctx.headers["x-amzn-sagemaker-custom-attributes"] : null;
        if (CustomAttributes && CustomAttributes.length <= 1024) {
            // AWS SDK会自动添加前缀，所以这里直接使用原值
            input.CustomAttributes = CustomAttributes;
        }

        // console.log(JSON.stringify(input, null, 2));

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
    getHeaderString(ctx: any) {
        const headers = { ...ctx.headers };
        delete headers.host;
        delete headers['content-length'];
        console.log("ORI content:\n\n", JSON.stringify(headers, null, 2));
        // ctx.logger.error(headers);
        const rtn = Object.entries(headers)
            .map(([key, value]) => {
                const encodedValue = encodeURIComponent(String(value));
                if (encodedValue.length <= 1024) {
                    return `${key}:${encodedValue}`;
                }
            })
            .join(',');
        console.log("After  :\n\n", rtn, rtn.length);
        // ctx.logger.error(rtn);
        return rtn;
    }
    async chatStream(ctx: any, input: any, chatRequest: ChatRequest, session_id: string) {
        const command = new InvokeEndpointWithResponseStreamCommand(input);
        const response = await this.client.send(command);

        let i = 0;
        if (response.Body) {
            let responseText = "";
            let lineText = "";
            const reqId = this.newRequestID();
            for await (const item of response.Body) {
                if (item.PayloadPart?.Bytes) {
                    let chunk = new TextDecoder().decode(
                        item.PayloadPart.Bytes,
                    );

                    chunk = chunk.trim();

                    // console.log(chunk);

                    if (chunk) {
                        lineText += chunk;
                        lineText = lineText.trim();
                        // console.log(lineText);
                        // Sometimes, output is half json string...
                        if (lineText.startsWith("{") && lineText.endsWith("}]}")) {
                            // console.log(lineText);
                            // try {
                            const chunkObj = JSON.parse(lineText);
                            if (chunkObj.error) {
                                throw new Error(chunkObj.error);
                            }
                            const choice = chunkObj.choices.length > 0 ? chunkObj.choices[0] : null;
                            const content = choice && choice.delta?.content;
                            let finish_reason = choice && choice.finish_reason;
                            if (!this.isLlama3Prefix(content, i) &&
                                !this.isQwen2Prefix(content, i)) {
                                if (content) {
                                    responseText += content;
                                    ctx.res.write("data: " + WebResponse.wrap(i, chatRequest.model, content, finish_reason, null, null, reqId) + "\n\n");
                                }
                            }

                            if (finish_reason == "error") {
                                throw new Error("djl generate error.");
                            }
                            if (finish_reason) {
                                finish_reason = "stop"
                                ctx.res.write("data: " + WebResponse.wrap(i++, chatRequest.model, "", finish_reason, i, 0, reqId) + "\n\n");
                                const response: ResponseData = {
                                    text: responseText,
                                    input_tokens: 0,
                                    output_tokens: i, // one line is one token?
                                    invocation_latency: 0,
                                    first_byte_latency: 0
                                }
                                await this.saveThread(ctx, session_id, chatRequest, response);
                            }
                            lineText = "";
                            // } catch (e) {
                            //     console.log("chunk", chunk);
                            //     console.error(e);
                            //     ctx.logger.error(e);
                            // }

                            i++;
                        }

                    }
                }
            }
        } else {
            throw new Error("No response.");
        }

        ctx.res.write("data: [DONE]\n\n")
        ctx.res.end();

    }



    async chatSync(ctx: any, input: any, chatRequest: ChatRequest, session_id: string) {
        const command = new InvokeEndpointCommand(input);
        const apiResponse = await this.client.send(command);
        const decodedResponseBody = new TextDecoder().decode(apiResponse.Body);
        const responseBody = JSON.parse(decodedResponseBody);

        // console.log(responseBody);
        let content = responseBody.choices[0]["message"]["content"];
        const { prompt_tokens, completion_tokens, total_tokens } = responseBody.usage;
        const response: ResponseData = {
            text: content,
            input_tokens: prompt_tokens || 0,
            output_tokens: completion_tokens || 0,
            invocation_latency: 0,
            first_byte_latency: 0
        }

        await this.saveThread(ctx, session_id, chatRequest, response);

        content = this.cleanContent(content);

        return {
            choices: [{
                message: {
                    content: content,
                    role: "assistant"
                }
            }], usage: {
                completion_tokens,
                prompt_tokens,
                total_tokens
            }
        };
    }

    /**
     * The first 3 lines is the prefix of Llama3 model.
     * @param content 
     * @param i 
     * @returns 
     */
    isLlama3Prefix(content: string, i: number) {
        if (i > 3) return false;
        return (content.indexOf("<|start_header_id|>") >= 0 && i == 0) ||
            (content.indexOf("assistant") >= 0 && i == 1) ||
            (content.indexOf("<|end_header_id|>") >= 0 && i == 2)
    }

    /**
     * Qwen2 instruct first 3 line will be '', 'Assistant', ':'
     * @param content 
     * @param i 
     * @returns 
     */
    isQwen2Prefix(content: string, i: number) {
        if (i > 3) return false;
        return (content.indexOf("Assistant") >= 0 && i < 3) ||
            (content.indexOf(":") >= 0 && i < 3)
    }

    /**
     * clean output string
     * @param content 
     * @returns 
     */
    cleanContent(content: string) {
        content = content.trim();
        if (content.startsWith("<|start_header_id|>")) {
            // Llama3 content
            return content.substring(45);
        }
        if (content.startsWith("Assistant:")) {
            return content.substring(10);
        }
        return content;
    }

}
