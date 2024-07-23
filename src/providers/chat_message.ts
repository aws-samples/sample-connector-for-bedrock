
import { ChatRequest } from "../entity/chat_request";


export default class ChatMessageConverter {

    async convertContent(content: any): Promise<any[]> {
        if (typeof content === "string") {
            return [{
                type: "text",
                text: content
            }];
        }
        const rtn: any[] = [];
        if (Array.isArray(content)) {
            for (const item of content) {
                rtn.push(await this.convertSingleType(item));
            }
        }
        return rtn;
    }

    async parseImageUrl(url: string): Promise<any> {
        if (url.indexOf('http://') >= 0 || url.indexOf('https://') >= 0) {
            const imageReq = await fetch(url);
            const blob = await imageReq.blob();
            let buffer = Buffer.from(await blob.arrayBuffer());

            return {
                "type": "base64",
                "media_type": blob.type,
                "data": buffer.toString('base64')
            };
        } else if (url.indexOf('data:') >= 0) {
            const media_type = url.substring(5, url.indexOf(';'));
            const type = url.substring(url.indexOf(';') + 1, url.indexOf(','));
            const data = url.substring(url.indexOf(',') + 1);
            return {
                type,
                media_type,
                data
            }
        }
        return null;
    }

    async convertSingleType(contentItem: any): Promise<any> {
        if (contentItem.type === "image_url") {
            const url = contentItem.image_url.url;
            const source = await this.parseImageUrl(url);
            return {
                type: "image",
                source
            }
        } else if (contentItem.type === "text") {
            return {
                type: "text",
                text: contentItem.text
            }
        }
        return contentItem;
    }



    async toClaude3Payload(chatRequest: ChatRequest): Promise<any> {

        const messages = chatRequest.messages;

        const systemMessages = messages.filter(message => message.role === 'system');
        const userMessages = messages.filter(message => message.role === 'user');
        const assistantMessages = messages.filter(message => message.role === 'assistant');


        const systemPrompt = systemMessages.reduce((acc, message) => {
            return acc + message.content;
        }, "");
        const inferenceConfig: any = {
            maxTokens: chatRequest.max_tokens || 1024,
            temperature: chatRequest.temperature || 0.7,
            topP: chatRequest.top_p || 0.7,
        };

        let userPrompts = [];
        let assistantPrompts = [];
        for (const message of userMessages) {
            userPrompts = userPrompts.concat(await this.convertContent(message.content));
        }
        for (const message of assistantMessages) {
            assistantPrompts = assistantPrompts.concat(await this.convertContent(message.content));
        }
        const new_messages: any = [];

        if (assistantMessages.length == 0) {
            new_messages.push({
                role: "user",
                content: userPrompts
            });

        } else {
            const lastPrompt = userPrompts.pop();
            new_messages.push({
                role: "user",
                content: userPrompts
            });
            new_messages.push({
                role: "assistant",
                content: assistantPrompts
            });

            new_messages.push({
                role: "user",
                content: [lastPrompt]
            });
        }

        return { messages: new_messages, systemPrompt, inferenceConfig }

    }

    async toMistralPayload(chatRequest: ChatRequest) {
        const messages = chatRequest.messages;
        const systemMessages = messages.filter(message => message.role === 'system');
        const qaMessages = messages.filter(message => message.role !== 'system');
        // const userMessages = messages.filter(message => message.role === 'user');
        // const assistantMessages = messages.filter(message => message.role === 'assistant');


        const prompts: any[] = [];
        const systemPrompt = systemMessages.reduce((acc, message) => {
            return acc + message.content;
        }, "");
        if (systemPrompt) {
            prompts.push(`<s>[INST]${systemPrompt}[/INST]</s>`)
        }

        prompts.push(`<s>`)
        for (const message of qaMessages) {
            const contents = await this.convertContent(message.content);
            // Not support Image type
            const contentStr = contents.filter(s => s.type === "text").reduce((acc, message) => {
                return acc + message.text;
            }, "");
            if (message.role === "user") {
                prompts.push("[INST]" + contentStr + "[/INST]");
            }
            if (message.role === "assistant") {
                prompts.push(contentStr);
            }
        }

        return prompts.join(" ");
    }


    async toLlama3Payload(chatRequest: ChatRequest) {
        const messages = chatRequest.messages;
        const systemMessages = messages.filter(message => message.role === 'system');
        const qaMessages = messages.filter(message => message.role !== 'system');
        // const userMessages = messages.filter(message => message.role === 'user');
        // const assistantMessages = messages.filter(message => message.role === 'assistant');


        const prompts: any[] = [];
        const systemPrompt = systemMessages.reduce((acc, message) => {
            return acc + message.content;
        }, "");
        prompts.push(`<|begin_of_text|><|start_header_id|>system<|end_header_id|>${systemPrompt || "You are a helpful assistant."}<|eot_id|>`)

        for (const message of qaMessages) {
            const contents = await this.convertContent(message.content);
            // Not support Image type
            const contentStr = contents.filter(s => s.type === "text").reduce((acc, message) => {
                return acc + message.text;
            }, "");
            if (message.role === "user") {
                prompts.push(`<|start_header_id|>user<|end_header_id|>${contentStr}<|eot_id|>`)
            }
            if (message.role === "assistant") {
                prompts.push(`<|start_header_id|>assistant<|end_header_id|>${contentStr}<|eot_id|>`)
            }
        }
        return prompts.join("\n") + "<|start_header_id|>assistant<|end_header_id|>";
    }


}