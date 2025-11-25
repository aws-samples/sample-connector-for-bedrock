import { ChatRequest, ResponseData } from "../entity/chat_request"
import {
    BedrockRuntimeClient, ConverseStreamCommand, ConverseCommand
} from "@aws-sdk/client-bedrock-runtime";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { HttpsProxyAgent } from 'https-proxy-agent';
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
    maxRetry: number = 3;
    retryCount: number = 0;
    excludeAccessKeyId: any;
    currentAK: any;

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

        // Support three authentication methods:
        // 1. bearerToken (AWS Bedrock API Key) - highest priority
        // 2. apiKey (base64 encoded "accessKeyId:secretAccessKey")
        // 3. credentials array (traditional AKSK)

        let credentials = null;
        let useBearerToken = false;
        if (this.modelData.config?.bearerToken) {
            // Use AWS Bedrock Bearer Token (API Key)
            // Set environment variable for AWS SDK to use
            process.env.AWS_BEARER_TOKEN_BEDROCK = this.modelData.config.bearerToken;
            useBearerToken = true;
            this.currentAK = 'bearer-token';
        } else if (this.modelData.config?.apiKey) {
            // Parse apiKey (format: base64 encoded "accessKeyId:secretAccessKey")
            credentials = helper.parseApiKey(this.modelData.config.apiKey);
            this.currentAK = credentials?.accessKeyId;
        } else {
            // Use credentials array (traditional AKSK)
            credentials = helper.selectCredentials(this.modelData.config?.credentials, this.excludeAccessKeyId);
            this.currentAK = credentials?.accessKeyId;
        }

        this.maxRetry = this.modelData.config?.maxRetries || 3;
        const region = helper.selectRandomRegion(regions);

        // Configure proxy for local debugging
        const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
        const clientConfig: any = { region };

        // Only set credentials if not using bearer token
        if (credentials && !useBearerToken) {
            clientConfig.credentials = credentials;
        }

        if (proxyUrl) {
            const agent = new HttpsProxyAgent(proxyUrl);
            clientConfig.requestHandler = new NodeHttpHandler({
                httpAgent: agent,
                httpsAgent: agent
            });
            console.log(`Using proxy: ${proxyUrl}`);
        }

        this.client = new BedrockRuntimeClient(clientConfig);
    }

    async complete(chatRequest: ChatRequest, session_id: string, ctx: any) {
        await this.init();
        const payload = await this.chatMessageConverter.toPayload(chatRequest, this.modelData.config);
        if (chatRequest.model_id) {
            payload["modelId"] = chatRequest.model_id;
        } else {
            payload["modelId"] = this.modelId;
        }

        // Log Bedrock request
        console.log("=== Bedrock Complete Request ===");
        console.log(JSON.stringify({
            modelId: payload.modelId,
            messages: payload.messages,
            inferenceConfig: payload.inferenceConfig,
            toolConfig: payload.toolConfig,
            system: payload.system
        }, null, 2));
        console.log("================================");

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
            const result = await this.completeSync(ctx, payload, chatRequest, session_id);

            // Log Bedrock response
            console.log("=== Bedrock Complete Response ===");
            console.log(JSON.stringify(result, null, 2));
            console.log("=================================");

            ctx.body = result;
        }
    };

    async chat(chatRequest: ChatRequest, session_id: string, ctx: any) {
        await this.init();
        // console.log("--chatRequest-------------", JSON.stringify(chatRequest, null, 2));
        // console.log(ctx.headers)

        const headerThinkBudget = "think-budget" in ctx.headers && ctx.headers["think-budget"];
        if (headerThinkBudget && !isNaN(headerThinkBudget)) {
            const intBudget = ~~headerThinkBudget;
            if (intBudget > 0) {
                this.modelData.config.thinking = true;
                this.modelData.config.thinkBudget = intBudget;
            }
            // console.log(this.modelData.config)
        }

        const payload = await this.chatMessageConverter.toPayload(chatRequest, this.modelData.config);
        if (chatRequest.model_id) {
            payload["modelId"] = chatRequest.model_id;
        } else {
            payload["modelId"] = this.modelId;
        }

        // Log Bedrock request
        // console.log("=== Bedrock Chat Request ===");
        // console.log(JSON.stringify({
        //     modelId: payload.modelId,
        //     messages: payload.messages,
        //     inferenceConfig: payload.inferenceConfig,
        //     additionalModelRequestFields: payload.additionalModelRequestFields,
        //     toolConfig: payload.toolConfig,
        //     system: payload.system
        // }, null, 2));
        // console.log("============================");

        ctx.status = 200;

        try {
            this.retryCount++;
            // console.log("retry times:", this.retryCount);
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
                const result = await this.chatSync(ctx, payload, chatRequest, session_id);
                //
                // // Log Bedrock response (non-streaming)
                // console.log("=== Bedrock Chat Response ===");
                // console.log(JSON.stringify(result, null, 2));
                // console.log("=============================");

                ctx.body = result;
            }
            this.excludeAccessKeyId = null;
            this.retryCount = 0;
        } catch (err) {
            ctx.logger.error(err);
            ctx.logger.error(`retryCount: ${this.retryCount}, currentKey: ${this.currentAK}, excludedKey: ${this.excludeAccessKeyId}`);

            this.excludeAccessKeyId = this.currentAK;
            if (this.retryCount <= this.maxRetry) {
                await this.chat(chatRequest, session_id, ctx);
            } else {
                this.excludeAccessKeyId = null;
                this.retryCount = 0;
                throw new Error(`Maximum retry attempts (${this.maxRetry}) exceeded. Operation failed to complete successfully.`);
            }
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
        // // let i = 0;
        // writeFile('./api-test/output.txt', JSON.stringify(chatRequest, null, 2), 'utf8', (err) => {
        //     if (err) {
        //         console.error('写入文件时出错:', err);
        //         return;
        //     }
        //     console.log('文件已成功写入');
        // });

        // console.log(JSON.stringify(input, null, 2));
        const command = new ConverseStreamCommand(input);
        const response = await this.client.send(command);

        if (response.stream) {
            let responseText = "";
            const reqId = this.newRequestID();
            // ctx.res.write("data: " + WebResponse.wrap(0, chatRequest.model, "", null, null, null, reqId) + "\n\n");

            let index = 0;
            let think_end = false;
            let finish_reason = "stop";
            for await (const item of response.stream) {
                // console.log(JSON.stringify(item, null, 2))
                if (item.contentBlockStart?.start?.toolUse) {
                    const xblock =
                    {
                        "index": 0,
                        "id": item.contentBlockStart?.start?.toolUse?.toolUseId,
                        "type": "function",
                        "function": {
                            "name": item.contentBlockStart?.start?.toolUse?.name,
                            "arguments": ""
                        }
                    };
                    ctx.res.write("data: " + WebResponse.wrapToolUse(index, chatRequest.model, [xblock], reqId) + "\n\n");
                }
                if (item.messageStop?.stopReason) {
                    // Coverse end_turn | tool_use | max_tokens | stop_sequence | guardrail_intervened | content_filtered
                    // OpenAI reason:  stop, tool_call, content_filter, length, tool_calls
                    // ctx.res.write("data: " + WebResponse.wrap(index, chatRequest.model, "", item.messageStop?.stopReason, null, null, reqId) + "\n\n");

                    finish_reason = item.messageStop?.stopReason;
                    switch (finish_reason) {
                        case "end_turn":
                            finish_reason = "stop";
                            break;
                        case "tool_use":
                            finish_reason = "tool_calls";
                            break;
                        case "max_tokens":
                            finish_reason = "length";
                            break;
                        case "stop_sequence":
                            finish_reason = "stop";
                            break;
                        case "guardrail_intervened":
                        case "content_filtered":
                            finish_reason = "content_filter";
                            break;
                        default:
                            finish_reason = "stop";
                            break;
                    }
                }
                if (item.contentBlockDelta) {
                    const thinkingContent = item.contentBlockDelta.delta?.reasoningContent?.text;
                    const content = item.contentBlockDelta.delta?.text;
                    const tool_use_args = item.contentBlockDelta.delta?.toolUse?.input;
                    if (tool_use_args) {
                        const xblock =
                        {
                            "index": 0,
                            "function": {
                                "arguments": tool_use_args
                            }
                        };
                        ctx.res.write("data: " + WebResponse.wrapToolUse(index, chatRequest.model, [xblock], reqId) + "\n\n");
                    }
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

                    ctx.res.write("data: " + WebResponse.wrap(index, chatRequest.model, "", finish_reason, output_tokens, input_tokens, reqId) + "\n\n");
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
        // console.log("ori content:", JSON.stringify(apiResponse, null, 2));
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

        const choices = [];
        let assistantMessage: any = { role: "assistant" };
        let hasReasoningContent = false;
        let hasContent = false;

        // console.log(1111, content);

        content.map((c: any, index: number) => {
            if (c.reasoningContent) {
                assistantMessage.reasoning_content = c.reasoningContent.reasoningText.text;
                hasReasoningContent = true;
            }
            if (c.text) {
                assistantMessage.content = c.text;
                hasContent = true;
            }

            if (c.toolUse) {
                assistantMessage.tool_calls = [
                    {
                        id: c.toolUse.toolUseId,
                        type: "function",
                        function: {
                            name: c.toolUse.name,
                            arguments: JSON.stringify(c.toolUse.input)
                        }
                    }
                ]
            }
            // if (c.toolUse) {
            //     choices.push({
            //         message: {
            //             role: "assistant",
            //             tool_calls: [
            //                 {
            //                     id: c.toolUse.id,
            //                     type: "function",
            //                     function: {
            //                         name: c.toolUse.name,
            //                         // arguments: c.toolUse.input //fix to fit openai schema.
            //                         arguments: JSON.stringify(c.toolUse.input) //fix to fit openai schema.
            //                     }
            //                 }
            //             ]
            //         }
            //     });
            // }
        });

        if (hasReasoningContent || hasContent) {
            choices.unshift({
                index: 0,
                message: assistantMessage
            });
        }
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
        maxTokens = chatRequest.max_tokens || chatRequest.max_completion_tokens || maxTokens;

        if (config.maxTokens && (maxTokens > config.maxTokens)) {
            maxTokens = config.maxTokens;
        }
        let thinking = config && config.thinking;
        if (!thinking) {
            thinking = false;
        }

        // 只有在thinking=true时才处理thinkBudget
        let thinkBudget;
        if (thinking) {
            thinkBudget = config && config.thinkBudget;
            if (!thinkBudget || thinkBudget < 1024) {
                thinkBudget = 1024; // 确保thinkBudget最小值为1024
            }

            // 只有在thinking=true且thinkBudget有值时才校验maxTokens
            if (maxTokens <= thinkBudget) {
                maxTokens = thinkBudget + 1024;
            }
        }

        const pcFields = (config && config.promptCache && config.promptCache.fields) || [];
        const pcMessagePositions = (config && config.promptCache && config.promptCache.messagePositions) || [];

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

        if (config.modelId.includes("anthropic")) {
            // fix: temperature and top_p cannot both be specified
            if (chatRequest.top_p && (!chatRequest.temperature)) {
                delete inferenceConfig.temperature;
            } else {
                delete inferenceConfig.topP;
            }
            const anthropicBetaFeatures = [];
            if (config.modelId.includes("anthropic.claude-3-7-sonnet")) {
                anthropicBetaFeatures.push("output-128k-2025-02-19")
                anthropicBetaFeatures.push("token-efficient-tools-2025-02-19")
            }
            if (config.modelId.includes("anthropic.claude-sonnet-4")) {
                anthropicBetaFeatures.push("context-1m-2025-08-07")
            }
            if (config.modelId.includes("anthropic.claude-sonnet-4-5")) {

                anthropicBetaFeatures.push("context-management-2025-06-27")
            }
            additionalModelRequestFields["anthropic_beta"] = anthropicBetaFeatures;
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


        // fix last message is not user:
        // if (thinking) {
        const lastAsisMsg = newMessages[newMessages.length - 1];
        // const asisContent = lastAsisMsg.content;
        if (lastAsisMsg.role !== "user") {
            newMessages.push({
                role: 'user',
                content: [
                    {
                        "type": "text",
                        "text": "This is an automatically generated placeholder message to maintain proper API format. Please continue our previous conversation and ignore this message."
                    }
                ]
            });
        }

        // }
        if (pcFields.indexOf("messages") >= 0) {
            newMessages.forEach((message, index) => {
                if (pcMessagePositions.includes(index)) {
                    message.content.push({
                        "cachePoint": {
                            "type": "default"
                        }
                    });
                }
            });
        }

        const rtn: any = { messages: newMessages, inferenceConfig, additionalModelRequestFields };

        if (systemMessages.length > 0) {
            const system = [];
            systemMessages.forEach(msg => {
                if (msg.content && (typeof msg.content === "string")) {
                    system.push({ text: msg.content });
                } else if (msg.content && Array.isArray(msg.content)) {
                    msg.content.forEach((msg2: any) => {
                        msg2?.text && system.push({ text: msg2.text });
                    })
                }
            });
            // console.log("system", JSON.stringify(system, null, 2) );
            if (pcFields.indexOf("system") >= 0) {
                system.push({
                    "cachePoint": {
                        "type": "default"
                    }
                });
            }
            rtn.system = system;
        }


        let xtools: any, toolChoice: any;


        if (tools && tools.length > 0) {
            xtools = {};
            xtools = tools.map((tool: any) => ({
                toolSpec: {
                    name: tool.function?.name,
                    description: tool.function?.description || 'No description provided',
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

        if (rtn.toolConfig && rtn.toolConfig.tools && pcFields.indexOf("tools") >= 0) {
            rtn.toolConfig.tools.push({
                "cachePoint": {
                    "type": "default"
                }
            })
        }

        return rtn;
    }


}
