import { ChatRequest } from "../entity/chat_request"
import helper from '../util/helper';
import api_key from "../service/key";
import AbstractProvider from "./abstract_provider";
// Providers
import BedrockClaude from "./bedrock_claude";
import BedrockMixtral from "./bedrock_mixtral";
import BedrockLlama3 from "./bedrock_llama3";
import BedrockKnowledgeBase from "./bedrock_knowledge_base";
import OllamaAProvider from "./ollama_provider";

class Provider {
    constructor() {
        this["bedrock-claude3"] = new BedrockClaude();
        this["bedrock-mistral"] = new BedrockMixtral();
        this["bedrock-llama3"] = new BedrockLlama3();
        this["bedrock-knowledge-base"] = new BedrockKnowledgeBase();
        this["ollama"] = new OllamaAProvider();
    }
    async chat(ctx: any) {
        let keyData = null;
        if (ctx.db) {
            keyData = await api_key.loadById(ctx.db, ctx.user.id);
            if (keyData) {
                await this.checkFee(ctx, keyData);
            }
        }
        const chatRequest: ChatRequest = ctx.request.body;
        const session_id = ctx.headers["session-id"];
        const modelData = await helper.refineModelParameters(chatRequest, ctx);
        chatRequest.currency = modelData.config.currency || "USD";
        chatRequest.price_in = modelData.price_in || 0;
        chatRequest.price_out = modelData.price_out || 0;
        const provider: AbstractProvider = this[modelData.provider];
        if (!provider) {
            throw new Error("You need to configure the provider correctly.");
        }
        provider.setModelData(modelData);
        provider.setKeyData(keyData);

        return provider.chat(chatRequest, session_id, ctx);
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
}

export default new Provider();

