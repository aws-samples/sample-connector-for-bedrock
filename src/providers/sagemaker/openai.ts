import { ChatRequest, ResponseData } from "../../entity/chat_request";
import AbstractProvider from "../abstract_provider";
import ChatMessageConverter from '../chat_message';
import config from '../../config';
import helper from "../../util/helper";
import WebResponse from "../../util/response";

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

export default class SagemakerOpenAI extends AbstractProvider {

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
        const input = {
            EndpointName: endpointName, // required
            Body: Buffer.from(JSON.stringify(clonedRequest)), //new Uint8Array(), // e.g. Buffer.from("") or new TextEncoder().encode("")   // required
            ContentType: "application/json",
            Accept: "application/json",
        };

        console.log(JSON.stringify(clonedRequest, null, 2), input);

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
        const command = new InvokeEndpointWithResponseStreamCommand(input);
        const response = await this.client.send(command);


        let responseText = "";
        let i = 0;
        if (response.Body) {
            let responseText = "";
            for await (const item of response.Body) {
                i++;
                // console.log(item);
                if (item.PayloadPart?.Bytes) {
                    let chunk = new TextDecoder().decode(
                        item.PayloadPart.Bytes,
                    );

                    const chunkObj = JSON.parse(chunk);
                    if (chunkObj.error) {
                        throw new Error(chunkObj.error);
                    }
                    const choice = chunkObj.choices.length > 0 ? chunkObj.choices[0] : null;

                    const content = choice & choice.delta?.content;
                    const finish_reason = choice & choice.finish_reason;

                    if (content) {
                        responseText += content;
                    }
                    if (finish_reason) {
                        const response: ResponseData = {
                            text: responseText,
                            input_tokens: 0,
                            output_tokens: 0,
                            invocation_latency: 0,
                            first_byte_latency: 0
                        }
                        await this.saveThread(ctx, session_id, chatRequest, response);
                    }

                    ctx.res.write("data:" + WebResponse.wrap(0, chatRequest.model, content, finish_reason) + "\n\n");

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

        let content = responseBody.choices[0]["message"]["content"];

        const response: ResponseData = {
            text: content,
            input_tokens: 0,
            output_tokens: 0,
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
                completion_tokens: 0,
                prompt_tokens: 0,
                total_tokens: 0,
            }
        };


    }

}