import { Ollama } from 'ollama'
import { ChatRequest, ResponseData } from "../entity/chat_request"
import WebResponse from "../util/response";
import AbstractProvider from "./abstract_provider";


export default class OllamaAProvider extends AbstractProvider {

    client: Ollama;
    // chatMessageConverter: ChatMessageConverter;
    constructor() {
        super();
        // this.chatMessageConverter = new ChatMessageConverter();
    }

    async chat(chatRequest: ChatRequest, session_id: string, ctx: any) {
        // console.log(this.modelData);
        const { host, model } = this.modelData.config;
        if (!host || !model) {
            throw new Error("You must specify the parameters 'host' and 'model' in the backend model configuration.")
        }
        if (!this.client) {
            this.client = new Ollama({ host });
        }
        chatRequest.model_id = model;

        //we only use chatRequest.messages as ollama input 
        ctx.status = 200;

        if (chatRequest.stream) {
            ctx.set({
                'Connection': 'keep-alive',
                'Cache-Control': 'no-cache',
                'Content-Type': 'text/event-stream',
            });
            await this.chatStream(ctx, chatRequest, session_id);
        } else {
            ctx.set({
                'Content-Type': 'application/json',
            });
            ctx.body = await this.chatSync(ctx, chatRequest, session_id);
        }
    }

    async chatStream(ctx: any, chatRequest: ChatRequest, session_id: string) {
        const options = {
            "temperature": chatRequest.temperature || 1.0,
            "top_p": chatRequest.top_p || 1.0,
        };

        // const messages = JSON.parse(JSON.stringify(chatRequest.messages))
        const messages = chatRequest.messages;
        const chatResponse = await this.client.chat({
            model: chatRequest.model_id,
            messages: messages,
            stream: true,
            options
        })

        let responseText = "";
        let i = 0;
        for await (const part of chatResponse) {
            // console.log(part);
            const content = part.message?.content || '';
            responseText += content;
            i++;
            if (part.done) {
                const {
                    total_duration, load_duration,
                    prompt_eval_count, prompt_eval_duration,
                    eval_count, eval_duration,
                } = part;

                const response: ResponseData = {
                    text: responseText,
                    input_tokens: prompt_eval_count,
                    output_tokens: eval_count,
                    invocation_latency: Math.round(total_duration / 1e6) || 0,
                    first_byte_latency: Math.round(load_duration / 1e6) || 0,
                }
                await this.saveThread(ctx, session_id, chatRequest, response);
            } else {
                ctx.res.write("data:" + WebResponse.wrap(i, chatRequest.model_id, content, null) + "\n\n");
            }

        }
        ctx.res.write("data: [DONE]\n\n")
        ctx.res.end();

    }

    async chatSync(ctx: any, chatRequest: ChatRequest, session_id: string) {
        const messages = JSON.parse(JSON.stringify(chatRequest.messages));
        const chatResponse = await this.client.chat({
            model: chatRequest.model_id,
            messages: messages
        });
        // console.log("xxxxxxxxxxxxxxx", chatResponse);

        const {
            total_duration, load_duration,
            prompt_eval_count, prompt_eval_duration,
            eval_count, eval_duration,
        } = chatResponse;

        // console.log(chatResponse);

        const content = chatResponse.message?.content || "";

        const response: ResponseData = {
            text: content,
            input_tokens: prompt_eval_count,
            output_tokens: eval_count,
            invocation_latency: Math.round(total_duration / 1e6) || 0,
            first_byte_latency: Math.round(load_duration / 1e6) || 0,
        }

        await this.saveThread(ctx, session_id, chatRequest, response);
        return {
            choices: [{
                message: {
                    content,
                    role: "assistant"
                }
            }], usage: {
                completion_tokens: eval_count,
                prompt_tokens: prompt_eval_count,
                total_tokens: eval_count + prompt_eval_count,
            }
        };

    }

}
