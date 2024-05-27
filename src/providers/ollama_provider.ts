import { Ollama } from 'ollama'


import { ChatRequest, ResponseData } from "../entity/chat_request"

import {
    BedrockRuntimeClient,
    InvokeModelCommand,
    InvokeModelWithResponseStreamCommand,
} from "@aws-sdk/client-bedrock-runtime";
import config from '../config';
import helper from "../util/helper";
import WebResponse from "../util/response";
import AbstractProvider from "./abstract_provider";
import ChatMessageConverter from './chat_message'


export default class OllamaAProvider extends AbstractProvider {

    client: Ollama;
    chatMessageConverter: ChatMessageConverter;
    constructor() {
        super();
        this.client = new Ollama({ host: config.ollama.host});
        this.chatMessageConverter = new ChatMessageConverter();
    }

    async chat(chatRequest: ChatRequest, session_id: string, ctx: any) {

        //we only use chatRequest.messages as ollama  input 
        ctx.status = 200;

        if (chatRequest.stream) {
            ctx.set({
                'Connection': 'keep-alive',
                'Cache-Control': 'no-cache',
                'Content-Type': 'text/event-stream',
            });
           await this.chatStream(ctx,"", chatRequest, session_id);
           
        } else {
            ctx.set({
                'Content-Type': 'application/json',
            });
            ctx.body = await this.chatSync(ctx, "", chatRequest, session_id);
        }
    }

    async chatStream(ctx: any, input: any, chatRequest: ChatRequest, session_id: string) {
        let i = 0;
        try {
            
            const options = {
                "temperature": chatRequest.temperature || 1.0,
                "top_p": chatRequest.top_p || 1.0,
            };

            const messages = JSON.parse(JSON.stringify(chatRequest.messages))
            const chatResponse=await this.client.chat({
                model: chatRequest.model_id,
                messages:messages,
                stream: true,
                options
            })

            for await (const part of chatResponse) {
                process.stdout.write(part.message.content)

                ctx.res.write("id: " + i + "\n");
                ctx.res.write("event: message\n");
                ctx.res.write("data: " + JSON.stringify({
                    choices: [
                        { delta: { content: part.message.content } }
                    ]
                }) + "\n\n");

              }

              const response: ResponseData = {
                text: "",
                input_tokens: 0,
                output_tokens: 0,
                invocation_latency: 0,
                first_byte_latency: 0
            }

            await this.saveThread(ctx, session_id, chatRequest, response);
         

        } catch (e: any) {
            console.error(e);
            ctx.res.write("id: " + (i + 1) + "\n");
            ctx.res.write("event: message\n");
            ctx.res.write("data: " + JSON.stringify({
                choices: [
                    { delta: { content: "Error invoking model" } }
                ]
            }) + "\n\n");
        }

        ctx.res.write("id: " + (i + 1) + "\n");
        ctx.res.write("event: message\n");
        ctx.res.write("data: [DONE]\n\n")
        ctx.res.end();
    }

    async chatSync(ctx: any, input: any, chatRequest: ChatRequest, session_id: string) {
        try {

            const messages = JSON.parse(JSON.stringify(chatRequest.messages))
            const chatResponse=await this.client.chat({
                model: chatRequest.model_id,
                messages:messages
                
            })

            const response: ResponseData = {
                text: JSON.stringify(chatResponse.message),
                input_tokens: 0,
                output_tokens: 0,
                invocation_latency: 0,
                first_byte_latency: 0
            }

        

            await this.saveThread(ctx, session_id, chatRequest, response);
            return {
                choices:chatResponse.message, usage: {
                    completion_tokens: 0,
                    prompt_tokens: 0,
                    total_tokens: 0,
                }
            };
        } catch (e: any) {
            return WebResponse.error(e.message);
        }

    }

}
