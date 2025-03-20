import { ChatRequest, ResponseData } from "../entity/chat_request"
import {
    BedrockRuntimeClient, ConverseStreamCommand, ConverseCommand
} from "@aws-sdk/client-bedrock-runtime";
import helper from "../util/helper";
// import config from "../config";
import WebResponse from "../util/response";
import AbstractProvider from "./abstract_provider";

/**
 * BedrockConverse Provider uses boto3-converse api to invoke LLM models and support function calling.
 */
export default class BedrockConverse extends AbstractProvider {

    client: BedrockRuntimeClient;
    chatMessageConverter: MessageConverter;
    modelId: string;
    maxTokens: number;
    thinking: boolean;

    constructor() {
        super();
        this.chatMessageConverter = new MessageConverter();
    }

    async init() {
        this.modelId = this.modelData.config && this.modelData.config.modelId;
        if (!this.modelId) {
            throw new Error("You must specify the parameters 'modelId' in the backend model configuration.")
        }
        let regions: any = this.modelData.config && this.modelData.config.regions;
        const region = helper.selectRandomRegion(regions);
        this.client = new BedrockRuntimeClient({ region });

    }

    async complete(chatRequest: ChatRequest, session_id: string, ctx: any) {
        await this.init();
        const payload = await this.chatMessageConverter.toPayload(chatRequest, this.modelData.config);
        if (chatRequest.model_id) {
            payload["modelId"] = chatRequest.model_id;
        } else {
            payload["modelId"] = this.modelId;
        }

        ctx.status = 200;


        if (chatRequest.stream) {
            ctx.set({
                'Connection': 'keep-alive',
                'Cache-Control': 'no-cache',
                'Content-Type': 'text/event-stream',
            });
            await this.completeStream(ctx, payload, chatRequest, session_id);
        } else {
            ctx.set({
                'Content-Type': 'application/json',
            });
            ctx.body = await this.completeSync(ctx, payload, chatRequest, session_id);
        }
    };

    async chat(chatRequest: ChatRequest, session_id: string, ctx: any) {
        await this.init();
        console.log("--chatRequest-------------", JSON.stringify(chatRequest, null, 2));

        const payload = await this.chatMessageConverter.toPayload(chatRequest, this.modelData.config);
        if (chatRequest.model_id) {
            payload["modelId"] = chatRequest.model_id;
        } else {
            payload["modelId"] = this.modelId;
        }
        // payload["modelId"] = this.modelId;

        console.log("--payload-------------", JSON.stringify(payload, null, 2));
        ctx.status = 200;


        if (chatRequest.stream) {
            ctx.set({
                'Connection': 'keep-alive',
                'Cache-Control': 'no-cache',
                'Content-Type': 'text/event-stream'
            });
            await this.chatStream(ctx, payload, chatRequest, session_id);
        } else {
            ctx.set({
                'Content-Type': 'application/json',
            });
            ctx.body = await this.chatSync(ctx, payload, chatRequest, session_id);
        }
    }

    async completeStream(ctx: any, input: any, chatRequest: ChatRequest, session_id: string) {
        let i = 0;
        // console.log("xxxxxxxxxxx ", chatRequest, JSON.stringify(input, null, 2));
        const command = new ConverseStreamCommand(input);
        const response = await this.client.send(command);

        if (response.stream) {
            let responseText = "";
            for await (const item of response.stream) {
                if (item.contentBlockDelta) {
                    responseText += item.contentBlockDelta.delta.text;
                    ctx.res.write("data: " + WebResponse.wrap2(0, chatRequest.model, item.contentBlockDelta.delta.text, null) + "\n\n");
                }
                if (item.metadata) {
                    // console.log("resp----", responseText);
                    const input_tokens = item.metadata.usage.inputTokens;
                    const output_tokens = item.metadata.usage.outputTokens;
                    const first_byte_latency = item.metadata.metrics.latencyMs;
                    const response: ResponseData = {
                        text: responseText,
                        input_tokens,
                        output_tokens,
                        invocation_latency: 0,
                        first_byte_latency
                    }

                    await this.saveThread(ctx, session_id, chatRequest, response);
                }
            }
        } else {
            throw new Error("No response.");
        }
        ctx.res.write("data: [DONE]\n\n")
        ctx.res.end();
    }

    async chatStream(ctx: any, input: any, chatRequest: ChatRequest, session_id: string) {
        // let i = 0;
        // console.log(chatRequest, JSON.stringify(input, null, 2));
        const command = new ConverseStreamCommand(input);
        const response = await this.client.send(command);

        if (response.stream) {
            let responseText = "";
            const reqId = this.newRequestID();
            // ctx.res.write("data: " + WebResponse.wrap(0, chatRequest.model, "", null, null, null, reqId) + "\n\n");

            let index = 1;
            let think_end = false;
            for await (const item of response.stream) {
                // console.log(JSON.stringify(item));
                if (item.contentBlockDelta) {
                    const thinkingContent = item.contentBlockDelta.delta?.reasoningContent?.text;
                    const content = item.contentBlockDelta.delta?.text;
                    if (thinkingContent && index == 1) {
                        responseText += "<think>";

                    }
                    if (thinkingContent) {
                        responseText += thinkingContent;
                        ctx.res.write("data: " + WebResponse.wrapReasoning(index, chatRequest.model, thinkingContent, reqId) + "\n\n");
                    }
                    if (content && index > 1 && !think_end) {
                        think_end = true;
                        responseText += "</think>";
                    }
                    if (content) {
                        responseText += content;
                        ctx.res.write("data: " + WebResponse.wrap(index, chatRequest.model, content, null, null, null, reqId) + "\n\n");

                    }
                    // const p = item.contentBlockDelta["p"];
                    index++;
                }
                // if (item.contentBlockStop) {
                //     const p = item.contentBlockStop["p"];
                //     ctx.res.write("data: " + WebResponse.wrap("chatcmpl-" + p, chatRequest.model, "", "stop") + "\n\n");
                // }
                if (item.metadata) {
                    // console.log(item);
                    const input_tokens = item.metadata.usage.inputTokens;
                    const output_tokens = item.metadata.usage.outputTokens;
                    const first_byte_latency = item.metadata.metrics.latencyMs;

                    ctx.res.write("data: " + WebResponse.wrap(index, chatRequest.model, "", "stop", output_tokens, input_tokens, reqId) + "\n\n");
                    const response: ResponseData = {
                        text: responseText,
                        input_tokens,
                        output_tokens,
                        invocation_latency: 0,
                        first_byte_latency
                    }
                    await this.saveThread(ctx, session_id, chatRequest, response);
                }
            }
        } else {
            throw new Error("No response.");
        }
        ctx.res.write("data: [DONE]\n\n")
        ctx.res.end();
    }

    async completeSync(ctx: any, input: any, chatRequest: ChatRequest, session_id: string) {
        const command = new ConverseCommand(input);
        const apiResponse = await this.client.send(command);

        const content = apiResponse.output.message?.content;
        // console.log("ori content:", JSON.stringify(content, null, 2));
        const { inputTokens, outputTokens, totalTokens } = apiResponse.usage;
        const { latencyMs } = apiResponse.metrics;
        const response: ResponseData = {
            text: content[0].text,
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            invocation_latency: 0,
            first_byte_latency: latencyMs
        }
        await this.saveThread(ctx, session_id, chatRequest, response);

        const choices = content.map((c: any, index: number) => {
            if (c.text) {
                return {
                    index,
                    text: c.text
                }
            }
        });
        return {
            model: chatRequest.model,
            choices, usage: {
                completion_tokens: outputTokens,
                prompt_tokens: inputTokens,
                total_tokens: totalTokens
            }
        };

    }

    async chatSync(ctx: any, input: any, chatRequest: ChatRequest, session_id: string) {
        const command = new ConverseCommand(input);
        const apiResponse = await this.client.send(command);

        const content = apiResponse.output.message?.content;
        console.log("ori content:", JSON.stringify(apiResponse, null, 2));
        const { inputTokens, outputTokens, totalTokens } = apiResponse.usage;
        const { latencyMs } = apiResponse.metrics;
        const { requestId } = apiResponse["$metadata"];
        const response: ResponseData = {
            text: content[0]?.text,
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            invocation_latency: 0,
            first_byte_latency: latencyMs
        }
        await this.saveThread(ctx, session_id, chatRequest, response);

        const choices = content.map((c: any, index: number) => {
            if (c.reasoningContent) {
                return {
                    index,
                    message: {
                        reasoning_content: c.reasoningContent.reasoningText.text,
                        role: "assistant"
                    }
                }
            }
            if (c.text) {
                return {
                    index,
                    message: {
                        content: c.text,
                        role: "assistant"
                    }
                }
            }
            if (c.toolUse) {
                return {
                    message: {
                        role: "assistant",
                        tool_calls: [
                            {
                                id: c.toolUse.id,
                                type: "function",
                                function: {
                                    name: c.toolUse.name,
                                    // arguments: c.toolUse.input //fix to fit openai schema.
                                    arguments: JSON.stringify(c.toolUse.input) //fix to fit openai schema.
                                }
                            }
                        ]
                    }
                }
            }
        }).filter(Boolean);
        // console.log({
        //     choices, usage: {
        //         completion_tokens: outputTokens,
        //         prompt_tokens: inputTokens,
        //         total_tokens: totalTokens
        //     }
        // })
        return {
            id: requestId,
            model: chatRequest.model,
            choices, usage: {
                completion_tokens: outputTokens,
                prompt_tokens: inputTokens,
                total_tokens: totalTokens
            }
        };
    }
}

class MessageConverter {

    convertImageExt(mime?: string) {
        if (mime.indexOf('image/jpeg') >= 0 || mime.indexOf('image/jpg') >= 0) {
            return 'jpeg';
        }
        if (mime.indexOf('image/png') >= 0) {
            return 'png';
        }
        if (mime.indexOf('image/gif') >= 0) {
            return 'gif';
        }
        if (mime.indexOf('image/webp') >= 0) {
            return 'webp';
        }
        return 'jpeg';
    }


    async parseImageUrl(url: string): Promise<any> {
        if (url.indexOf('http://') >= 0 || url.indexOf('https://') >= 0) {
            const imageRes = await fetch(url);
            const mime = imageRes.headers.get('Content-Type');
            const blob = await imageRes.blob();
            let bytes = Buffer.from(await blob.arrayBuffer());

            return {
                format: helper.convertImageExt(mime), // required
                source: {
                    bytes
                },
            }
        } else if (url.indexOf('data:') >= 0) {
            const media_type = url.substring(5, url.indexOf(';'));
            const type = url.substring(url.indexOf(';') + 1, url.indexOf(','));
            const data = url.substring(url.indexOf(',') + 1);

            return {
                format: helper.convertImageExt(type), // required
                source: {
                    bytes: Buffer.from(data, 'base64')
                },
            }
        }
        return null;
    }

    async convertContent(content: any): Promise<any[]> {
        if (typeof content === "string") {
            if (!content || content.trim() === "") {
                return [{
                    text: "."
                }];
            }
            return [{
                text: content
            }];
        }

        const rtn: any[] = [];
        if (Array.isArray(content)) {
            for (const item of content) {
                rtn.push(await this.convertConverseSingleType(item));
            }
        }
        return rtn;
    }

    async convertConverseSingleType(contentItem: any): Promise<any> {
        if (contentItem.type === "image_url") {
            const url = contentItem.image_url.url;
            const image = await this.parseImageUrl(url);
            return {
                image
            }
        } else if (contentItem.type === "text") {
            return {
                text: contentItem.text
            }
        } else if (contentItem.type === "doc") {
            // This is for BRClient
            return {
                document: {
                    name: contentItem.doc.name,
                    format: contentItem.doc.format,
                    source: {
                        bytes: Uint8Array.from(Object.values(contentItem.doc.source.bytes)),
                        name: contentItem.doc.source.name + (new Date()).getTime(),
                        format: contentItem.doc.source.format
                    }
                }
            }
        }
        return contentItem;
    }


    async toPayload(chatRequest: ChatRequest, config: any): Promise<any> {

        let maxTokens = config && config.maxTokens;
        if (!maxTokens || isNaN(maxTokens)) {
            maxTokens = 2048;
        }
        maxTokens = chatRequest.max_tokens || maxTokens;
        let thinking = config && config.thinking;
        if (!thinking) {
            thinking = false;
        }
        let thinkBudget = config && config.thinkBudget;
        if (!thinkBudget) {
            thinkBudget = 1024;
        }

        if (maxTokens <= thinkBudget) {
            maxTokens = thinkBudget + 1024;
        }

        const messages = chatRequest.messages;
        for (let i = 0; i < messages.length; i++) {
            // console.log("message", messages[i]);
            if (messages[i].content === null) {
                if (messages[i]?.tool_calls && messages[i].tool_calls.length > 0) {
                    messages[i].content = "正在使用工具...";
                } else {
                    messages[i].content = "";
                }
            }
        }
        const tools = chatRequest.tools;
        const tool_choice = chatRequest.tool_choice;
        const systemMessages = messages.filter(message => message.role === 'system');
        const uaMessages = messages.filter(message => message.role === 'user' || message.role === 'assistant' || message.role === 'tool' || message.role === 'function');
        let stopSequences = chatRequest.stop;

        const inferenceConfig: any = {
            maxTokens,
            temperature: chatRequest.temperature || 0.7,
            topP: chatRequest.top_p || 0.7
        };
        if (thinking) {
            delete inferenceConfig.topP;
            inferenceConfig.temperature = 1;
        }

        const additionalModelRequestFields: any = {
        }
        if (stopSequences && Array.isArray(stopSequences)) {
            inferenceConfig.stopSequences = stopSequences.slice(0, 4);
        }
        if (thinking) {
            additionalModelRequestFields.thinking = {
                type: "enabled",
                budget_tokens: thinkBudget
            }
        }

        //First element must be user message
        const newMessages = [];
        for (const message of uaMessages) {
            const nowLen = newMessages.length;
            const shouldBeUser = nowLen % 2 === 0;
            if (message.role === 'tool' || message.role === 'function') { // tool and function are not supported in converse
                message.role = 'assistant';
            }
            message.content = await this.convertContent(message.content);
            if (shouldBeUser) {
                if (message.role === 'user') {
                    newMessages.push(message);
                } else {
                    newMessages.push({
                        role: 'user',
                        content: [
                            {
                                "type": "text",
                                "text": "."
                            }
                        ]
                    });
                    newMessages.push(message);
                }

            } else {
                if (message.role === 'assistant') {
                    newMessages.push(message);
                } else {
                    newMessages.push({
                        role: 'assistant',
                        content: [
                            {
                                "type": "text",
                                "text": "."
                            }
                        ]
                    });
                    newMessages.push(message);
                }

            }
        }
        const rtn: any = { messages: newMessages, inferenceConfig, additionalModelRequestFields };

        if (systemMessages.length > 0) {
            const system = systemMessages.map(msg => ({
                text: msg.content || "."
            }));
            rtn.system = system;
        }


        let xtools: any, toolChoice: any;

        if (tools) {
            xtools = {};
            xtools = tools.map((tool: any) => ({
                toolSpec: {
                    name: tool.function?.name,
                    description: tool.function?.description,
                    inputSchema: { json: tool.function?.parameters }
                }
            }));
        }

        if (tool_choice) {
            toolChoice = {};
            if (typeof tool_choice === 'string') {
                toolChoice["auto"] = {}
            } else if (typeof tool_choice === 'object' && tool_choice.type === 'function') {
                toolChoice["tool"] = { name: tool_choice.function.name }
            }
            rtn.toolConfig = {};
            rtn.toolConfig.toolChoice = toolChoice;
        }

        if (xtools || toolChoice) {
            rtn.toolConfig = {};
            xtools && (rtn.toolConfig.tools = xtools);
            toolChoice && (rtn.toolConfig.toolChoice = toolChoice);
        }

        // console.log("tools:", JSON.stringify(rtn, null, 2))

        return rtn;
    }


}
