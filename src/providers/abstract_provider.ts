import { ChatRequest, ResponseData, EmbeddingRequest, ImageRequest } from "../entity/chat_request";
import { addKeyFee } from './key_fee';
import { legacyFee } from './legacy_fee';
import crypto from 'crypto';
import { selfBaseUrl } from "../util/self";

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export default abstract class AbstractProvider {
    keyData: any;
    modelData: any;

    constructor() {
    }

    newRequestID() {
        return crypto.randomUUID();
    }

    setKeyData(value: any) {
        this.keyData = value;
    }

    setModelData(value: any) {
        this.modelData = value;
    }

    abstract chat(chatRequest: ChatRequest, session_id: string, ctx: any): void;

    async complete(chatRequest: ChatRequest, session_id: string, ctx: any) {
        console.log("This method is not implemented.");
        ctx.body = "Sorry, this model is not for complete.";
    };

    async embed(embedingRequest: EmbeddingRequest, session_id: string, ctx: any) {
        console.log("This method is not implemented.");
        ctx.body = "Sorry, this model is not for text embedding.";
    }

    async images(imageRequest: ImageRequest, session_id: string, ctx: any) {
        console.log("This method is not implemented.");
        ctx.body = "Sorry, this model is not for images generation.";
    }

    async localCompleteStream(ctx: any, openAIRequest: any, session_id: string) {
        ctx.set({
            'Connection': 'keep-alive',
            'Cache-Control': 'no-cache',
            'Content-Type': 'text/event-stream',
        });
        // console.log("openAIRequest", openAIRequest)
        const response = await fetch(`${selfBaseUrl}/v1/completions`, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + ctx.user.api_key,
                'Session-Id': session_id
            },
            body: JSON.stringify(openAIRequest)
        });

        if (!response.ok)
            throw new Error(await response.text());
        const reader = response.body.getReader();
        let done: any, value: any;
        while (!done) {
            ({ value, done } = await reader.read());
            // value && console.log(done, new TextDecoder().decode(value));
            !done && ctx.res.write(value);
        }
        ctx.res.end();

    }

    async localCompleteSync(ctx: any, openAIRequest: any, session_id: string) {
        const response = await fetch(`${selfBaseUrl}/v1/completions`, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + ctx.user.api_key,
                'Session-Id': session_id
            },
            body: JSON.stringify(openAIRequest)
        });
        return await response.json();
    }


    async localChatStream(ctx: any, openAIRequest: any, session_id: string) {
        ctx.set({
            'Connection': 'keep-alive',
            'Cache-Control': 'no-cache',
            'Content-Type': 'text/event-stream',
        });

        const response = await fetch(`${selfBaseUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + ctx.user.api_key,
                'Session-Id': session_id
            },
            body: JSON.stringify(openAIRequest)
        });

        if (!response.ok)
            throw new Error(await response.text());
        const reader = response.body.getReader();
        let done: any, value: any;
        while (!done) {
            ({ value, done } = await reader.read());
            // console.log(done);
            !done && ctx.res.write(value);
        }
        ctx.res.end();

    }

    async localChatSync(ctx: any, openAIRequest: any, session_id: string) {
        const response = await fetch(`${selfBaseUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + ctx.user.api_key,
                'Session-Id': session_id
            },
            body: JSON.stringify(openAIRequest)
        });
        return await response.json();
    }

    async saveThreadForEmebeddings(ctx: any, session_id: string, embeddingRequese: EmbeddingRequest, response: ResponseData) {
        if (ctx.performanceMode || !ctx.db) {
            return null;
        }

        const input_tokens = response.input_tokens;
        const fee_in = input_tokens * this.modelData.price_in;
        // const fee_out = 0;
        const fee: number = fee_in;

        const prompt = Array.isArray(embeddingRequese.input) ?
            JSON.stringify(embeddingRequese.input) : embeddingRequese.input;

        const threadData: any = {
            prompt,
            completion: "",
            whole_prompt: "",
            key_id: ctx.user.id,
            session_key: session_id,
            tokens_in: input_tokens,
            tokens_out: 0,
            price_in: this.modelData.price_in,
            price_out: this.modelData.price_out,
            fee,
            session_id: 0
        }
        threadData.thread_type = 0;
        // Charged first, as in saveThread.
        const result: any = { key_updated: await this.chargeKey(ctx, fee, threadData.key_id), thread_updated: false };
        try {
            await ctx.db.insert("eiai_thread", threadData);
            result.thread_updated = true;
        } catch (error) {
            ctx.logger.error({ message: 'could not save the thread', error: errorMessage(error), keyId: threadData.key_id });
        }
        return result;
    }

    // save session to db
    async saveThread(ctx: any, session_id: string, chatRequest: ChatRequest, response: ResponseData) {
        // If the performanceMode is set, then chat history will not be saved.
        if (ctx.performanceMode || !ctx.db) {
            return null;
        }

        // tokens_in includes the cache-read and cache-write tokens.
        const { fee, tokens_in } = legacyFee(this.modelData, response);
        const output_tokens = response.output_tokens;
        const key_id = ctx.user.id;

        // The key is charged first and on its own, as recordChatUsage charges it: the call has been answered, so a
        // session or thread row that fails to save must not keep the key from being charged.
        const result: any = { key_updated: await this.chargeKey(ctx, fee, key_id), session_updated: false, thread_updated: false };

        try {
            let dbSessionId = 0;
            if (session_id) {
                const session = await ctx.db.loadByKV("eiai_session", "key", session_id);
                const sessionData: any = {};
                if (!chatRequest.stream && response.text) { // in BRClient, no stream means summary session's title.
                    sessionData.title = response.text.slice(0, 30);
                }

                sessionData.total_in_tokens = session ? session.total_in_tokens + tokens_in : tokens_in;
                sessionData.total_out_tokens = session ? session.total_out_tokens + output_tokens : output_tokens;
                sessionData.total_fee = session ? fee * 1.0 + session.total_fee * 1.0 : fee;

                if (session) {
                    sessionData.id = session.id;
                    sessionData.updated_at = new Date();
                } else {
                    sessionData.key = session_id;
                    sessionData.key_id = key_id;
                }
                const resSession = await ctx.db.save("eiai_session", sessionData);
                dbSessionId = resSession.id;
                result.session_updated = true;
            }

            const messages = chatRequest.messages;

            const whole_prompt = JSON.stringify(messages);

            const lastMessage = messages.pop();
            const threadData: any = {
                prompt: JSON.stringify(lastMessage["content"]),
                completion: response.text,
                whole_prompt,
                key_id,
                session_key: session_id,
                tokens_in,
                tokens_out: output_tokens,
                price_in: this.modelData.price_in,
                price_out: this.modelData.price_out,
                fee,
                currency: chatRequest.currency,
                invocation_latency: response.invocation_latency,
                first_byte_latency: response.first_byte_latency,
                session_id: dbSessionId
            }
            threadData.thread_type = chatRequest.stream ? 0 : 1;

            await ctx.db.insert("eiai_thread", threadData);
            result.thread_updated = true;
        } catch (error) {
            ctx.logger.error({ message: 'could not save the session or thread', error: errorMessage(error), keyId: key_id });
        }
        return result;
    }

    // Charges the key for a call that has been answered. A failure is logged, not thrown, because the answer has
    // already been sent or is about to be.
    private async chargeKey(ctx: any, fee: number, keyId: number): Promise<boolean> {
        try {
            await this.updateKeyFee(ctx, fee);
            return true;
        } catch (error) {
            ctx.logger.error({ message: 'could not charge the key', error: errorMessage(error), keyId, fee });
            return false;
        }
    }

    async updateKeyFee(ctx: any, fee: number) {
        await addKeyFee(ctx.db, this.keyData.id, fee);
        return {
            thread_updated: true,
            key_updated: true
        };
    }
}

