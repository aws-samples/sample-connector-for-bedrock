import { ChatRequest, EmbeddingRequest, ImageRequest } from "../entity/chat_request"
import helper from '../util/helper';
import api_key from "../service/key";
import AbstractProvider from "./abstract_provider";
// Providers
// import BedrockClaude from "./bedrock_claude";
// import BedrockMixtral from "./bedrock_mixtral";
// import BedrockLlama3 from "./bedrock_llama3";
import BedrockKnowledgeBase from "./bedrock_knowledge_base";
import OllamaAProvider from "./ollama_provider";
import BedrockConverse from "./bedrock_converse";
import SagemakerLMI from "./sagemaker_lmi"
import Painter from "./painter";
import WebMiner from "./web_miner";
import AWSExecutor from "./aws_executor"
import UrlsReader from "./urls_reader";
import ContinueCoder from "./continue_coder";
import SmartRouter from "./smart_router";
// import SimpleAction from "./simple_action";
import TitanEmbeddings from "./titan_embedings";
import NovaCanvas from "./nova_canvas";
import OpenAICompatible from "./openai_compatible";
import BedrockDeepSeek from "./bedrock_deepseek";
import SagemakerDeepSeek from "./sagemaker-deepseek";
import AzureOpenAI from "./azure_openai"
import AzureOpenAIImage from "./azure_openai_image"
import BedrockAgent from "./bedrock_agent";
import GeminiConverse from "./gemini_converse";

class Provider {
    constructor() {
        this["bedrock-converse"] = new BedrockConverse();
        this["smart-router"] = new SmartRouter();
        // this["simple-action"] = new SimpleAction();
        this["sagemaker-lmi"] = new SagemakerLMI();
        this["bedrock-knowledge-base"] = new BedrockKnowledgeBase();
        this["bedrock-agent"] = new BedrockAgent();
        this["painter"] = new Painter();
        this["nova-canvas"] = new NovaCanvas();
        this["ollama"] = new OllamaAProvider();
        this["web-miner"] = new WebMiner();
        this["continue-coder"] = new ContinueCoder();
        this["urls-reader"] = new UrlsReader();
        this["aws-executor"] = new AWSExecutor();
        // this["bedrock-claude3"] = new BedrockClaude();
        // this["bedrock-mistral"] = new BedrockMixtral();
        // this["bedrock-llama3"] = new BedrockLlama3();
        this["titan-embeddings"] = new TitanEmbeddings();
        this["openai-compatible"] = new OpenAICompatible();
        this["bedrock-deepseek"] = new BedrockDeepSeek();
        this["sagemaker-deepseek"] = new SagemakerDeepSeek();
        this["azure-openai"] = new AzureOpenAI();
        this["azure-openai-image"] = new AzureOpenAIImage();
        this["gemini-converse"] = new GeminiConverse();
    }

    async initForEmbeddings(ctx: any) {
        if (ctx.user && ctx.user.id > 0) {
            await this.checkFee(ctx, ctx.user);
        }

        // console.log("-ori--------------", JSON.stringify(ctx.request.body, null, 2));

        const embeddingRequest: EmbeddingRequest = ctx.request.body;
        const modelRes = helper.parseModelString(embeddingRequest.model);
        if (modelRes) {
            embeddingRequest.model = modelRes.model;
            embeddingRequest.model_id = modelRes.model_id;
        }


        const session_id = ctx.headers["session-id"];
        const modelData = await helper.refineModelParameters({ model: embeddingRequest.model }, ctx);


        if (ctx.db) {
            // If the db parameter is not set, then access permissions will not be verified.
            const canAccessModel = await this.checkModelAccess(ctx, ctx.user, modelData.id);
            if (!canAccessModel) {
                throw new Error(`You do not have permission to access the [${modelData.name}] model, please contact the administrator.`);
            }
        }

        embeddingRequest.currency = modelData.config.currency || "USD";
        embeddingRequest.price_in = modelData.price_in || 0;
        embeddingRequest.price_out = modelData.price_out || 0;
        embeddingRequest.model = modelData.name;
        const provider: AbstractProvider = this[modelData.provider];
        if (!provider) {
            throw new Error("You need to configure the provider correctly.");
        }
        provider.setModelData(modelData);
        provider.setKeyData(ctx.user);

        return {
            provider, embeddingRequest, session_id
        }

    }

    async initForImage(ctx: any) {
        if (ctx.user && ctx.user.id > 0) {
            await this.checkFee(ctx, ctx.user);
        }

        // console.log("-ori--------------", JSON.stringify(ctx.request.body, null, 2));

        const request: ImageRequest = ctx.request.body;
        const modelRes = helper.parseModelString(request.model);
        if (modelRes) {
            request.model = modelRes.model;
            request.model_id = modelRes.model_id;
        }


        const session_id = ctx.headers["session-id"];
        const modelData = await helper.refineModelParameters({ model: request.model }, ctx);

        if (ctx.db) {
            // If the db parameter is not set, then access permissions will not be verified.
            const canAccessModel = await this.checkModelAccess(ctx, ctx.user, modelData.id);
            if (!canAccessModel) {
                throw new Error(`You do not have permission to access the [${modelData.name}] model, please contact the administrator.`);
            }
        }

        request.currency = modelData.config.currency || "USD";
        request.price_in = modelData.price_in || 0;
        request.price_out = modelData.price_out || 0;
        request.model = modelData.name;
        const provider: AbstractProvider = this[modelData.provider];
        if (!provider) {
            throw new Error("You need to configure the provider correctly.");
        }
        provider.setModelData(modelData);
        provider.setKeyData(ctx.user);

        return {
            provider, request, session_id
        }

    }

    async init(ctx: any) {
        if (ctx.user && ctx.user.id > 0) {
            await this.checkFee(ctx, ctx.user);
        }

        // console.log("-ori--------------", JSON.stringify(ctx.request.body, null, 2));

        const chatRequest: ChatRequest = ctx.request.body;

        const modelRes = helper.parseModelString(chatRequest.model);
        if (modelRes) {
            chatRequest.model = modelRes.model;
            chatRequest.model_id = modelRes.model_id;
        }


        const session_id = ctx.headers["session-id"];
        const modelData = await helper.refineModelParameters(chatRequest, ctx);


        if (ctx.db) {
            // If the db parameter is not set, then access permissions will not be verified.
            const canAccessModel = await this.checkModelAccess(ctx, ctx.user, modelData.id);
            if (!canAccessModel) {
                throw new Error(`You do not have permission to access the [${modelData.name}] model, please contact the administrator.`);
            }
        }

        chatRequest.currency = modelData.config.currency || "USD";
        chatRequest.price_in = modelData.price_in || 0;
        chatRequest.price_out = modelData.price_out || 0;
        chatRequest.model = modelData.name;
        const provider: AbstractProvider = this[modelData.provider];
        if (!provider) {
            throw new Error("You need to configure the provider correctly.");
        }
        provider.setModelData(modelData);
        provider.setKeyData(ctx.user);

        return {
            provider, chatRequest, session_id
        }

    }

    async chat(ctx: any) {
        // let keyData = null;
        const res = await this.init(ctx);
        return res.provider.chat(res.chatRequest, res.session_id, ctx);
    }

    async anthropicMessages(ctx: any) {
        const res = await this.initForAnthropic(ctx);
        return (res.provider as any).chatAnthropic(res.chatRequest, res.session_id, ctx);
    }

    async initForAnthropic(ctx: any) {
        if (ctx.user && ctx.user.id > 0) {
            await this.checkFee(ctx, ctx.user);
        }

        // Convert Anthropic Messages API request → internal ChatRequest
        const body = ctx.request.body;
        const chatRequest: ChatRequest = this.convertAnthropicRequest(body);

        const modelRes = helper.parseModelString(chatRequest.model);
        if (modelRes) {
            chatRequest.model = modelRes.model;
            chatRequest.model_id = modelRes.model_id;
        }

        const session_id = ctx.headers["session-id"];
        const modelData = await helper.refineModelParameters(chatRequest, ctx);

        if (ctx.db) {
            const canAccessModel = await this.checkModelAccess(ctx, ctx.user, modelData.id);
            if (!canAccessModel) {
                throw new Error(`You do not have permission to access the [${modelData.name}] model, please contact the administrator.`);
            }
        }

        chatRequest.currency = modelData.config.currency || "USD";
        chatRequest.price_in = modelData.price_in || 0;
        chatRequest.price_out = modelData.price_out || 0;
        chatRequest.model = modelData.name;

        const provider: AbstractProvider = this[modelData.provider];
        if (!provider) {
            throw new Error("You need to configure the provider correctly.");
        }
        provider.setModelData(modelData);
        provider.setKeyData(ctx.user);

        return { provider, chatRequest, session_id };
    }

    /**
     * Convert Anthropic Messages API request body → internal ChatRequest format
     * Anthropic spec: https://docs.anthropic.com/en/api/messages
     */
    convertAnthropicRequest(body: any): ChatRequest {
        const messages: any[] = [];

        // system prompt → system message
        if (body.system) {
            const systemContent = typeof body.system === 'string'
                ? body.system
                : body.system.map((b: any) => b.text || '').join('');
            messages.push({ role: 'system', content: systemContent });
        }

        // Convert Anthropic messages → OpenAI-style messages
        for (const msg of (body.messages || [])) {
            if (msg.role === 'user' || msg.role === 'assistant') {
                const converted: any = { role: msg.role };

                if (typeof msg.content === 'string') {
                    converted.content = msg.content;
                } else if (Array.isArray(msg.content)) {
                    // Check for tool_use / tool_result blocks
                    const toolUseBlocks = msg.content.filter((b: any) => b.type === 'tool_use');
                    const toolResultBlocks = msg.content.filter((b: any) => b.type === 'tool_result');
                    const textBlocks = msg.content.filter((b: any) => b.type === 'text' || b.type === 'image');

                    if (toolResultBlocks.length > 0) {
                        // tool result messages: emit one tool message per result
                        for (const tr of toolResultBlocks) {
                            const resultContent = Array.isArray(tr.content)
                                ? tr.content.map((c: any) => c.text || '').join('')
                                : (tr.content || '');
                            messages.push({
                                role: 'tool',
                                tool_call_id: tr.tool_use_id,
                                content: resultContent
                            });
                        }
                        continue;
                    }

                    if (toolUseBlocks.length > 0) {
                        // assistant tool_use → tool_calls
                        converted.content = textBlocks
                            .filter((b: any) => b.type === 'text')
                            .map((b: any) => b.text)
                            .join('') || null;
                        converted.tool_calls = toolUseBlocks.map((b: any) => ({
                            id: b.id,
                            type: 'function',
                            function: {
                                name: b.name,
                                arguments: typeof b.input === 'string' ? b.input : JSON.stringify(b.input)
                            }
                        }));
                    } else {
                        // regular content array → OpenAI content array
                        converted.content = msg.content.map((b: any) => {
                            if (b.type === 'text') return { type: 'text', text: b.text };
                            if (b.type === 'image') {
                                if (b.source?.type === 'base64') {
                                    return {
                                        type: 'image_url',
                                        image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` }
                                    };
                                } else if (b.source?.type === 'url') {
                                    return { type: 'image_url', image_url: { url: b.source.url } };
                                }
                            }
                            return b;
                        });
                    }
                }
                messages.push(converted);
            }
        }

        // Convert Anthropic tools → OpenAI tools
        const tools = body.tools?.map((t: any) => ({
            type: 'function',
            function: {
                name: t.name,
                description: t.description || '',
                parameters: t.input_schema
            }
        }));

        // Convert tool_choice
        let tool_choice: any;
        if (body.tool_choice) {
            if (body.tool_choice.type === 'auto') tool_choice = 'auto';
            else if (body.tool_choice.type === 'any') tool_choice = 'required';
            else if (body.tool_choice.type === 'tool') {
                tool_choice = { type: 'function', function: { name: body.tool_choice.name } };
            }
        }

        const req: ChatRequest = {
            model: body.model,
            messages,
            stream: body.stream || false,
            max_tokens: body.max_tokens,
            temperature: body.temperature,
            top_p: body.top_p,
        };
        if (tools?.length) req.tools = tools;
        if (tool_choice !== undefined) req.tool_choice = tool_choice;
        if (body.stop_sequences?.length) req.stop = body.stop_sequences;

        return req;
    }

    async complete(ctx: any) {
        // let keyData = null;
        const res = await this.init(ctx);
        return res.provider.complete(res.chatRequest, res.session_id, ctx);
    }

    async embed(ctx: any) {
        // let keyData = null;
        const res = await this.initForEmbeddings(ctx);
        return res.provider.embed(res.embeddingRequest, res.session_id, ctx);
    }

    async images(ctx: any) {
        // let keyData = null;
        const res = await this.initForImage(ctx);
        return res.provider.images(res.request, res.session_id, ctx);
    }


    async checkFee(ctx: any, key: any) {
        let month_fee = parseFloat(key.month_fee);
        const month_quota = parseFloat(key.month_quota);
        const balance = parseFloat(key.balance);

        if (month_fee > 0) {
            // New month set it to 0
            const lastUpdate = new Date(key.updated_at);
            const now = new Date();

            if (now.getMonth() != lastUpdate.getMonth() || now.getFullYear() > lastUpdate.getFullYear()) {
                await api_key.rebillMonthly(ctx.db, ctx.user.id);
                key.month_fee = 0;
            }
        }
        if (month_fee >= month_quota && balance <= 0) {
            throw new Error("Please recharge.")
        }
    }

    async checkModelAccess(ctx: any, key: any, model_id: number): Promise<boolean> {
        const group_id = key.group_id;
        const key_id = key.id;

        //Check goup access
        const existsGroup = await ctx.db.exists("eiai_group_model", {
            where: "group_id=$1 and model_id=$2",
            params: [group_id, model_id]
        });

        if (existsGroup) {
            return true;
        }

        //Check personal access
        const existsPersonal = await ctx.db.exists("eiai_key_model", {
            where: "key_id=$1 and model_id=$2",
            params: [key_id, model_id]
        });

        return existsPersonal;
    }
}

export default new Provider();

