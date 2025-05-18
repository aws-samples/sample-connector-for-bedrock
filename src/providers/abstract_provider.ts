import { ChatRequest, ResponseData, EmbeddingRequest, ImageRequest } from "../entity/chat_request";
import Cache from '../util/cache';
import crypto from 'crypto';

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
        const response = await fetch("http://localhost:8866/v1/completions", {
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
        const response = await fetch("http://localhost:8866/v1/completions", {
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

        const response = await fetch("http://localhost:8866/v1/chat/completions", {
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
        const response = await fetch("http://localhost:8866/v1/chat/completions", {
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
        await ctx.db.insert("eiai_thread", threadData);
        return await this.updateKeyFee(ctx, fee);
    }

    // save session to db
    async saveThread(ctx: any, session_id: string, chatRequest: ChatRequest, response: ResponseData) {
        // If the performanceMode is set, then chat history will not be saved.
        if (ctx.performanceMode || !ctx.db) {
            return null;
        }

        const input_tokens = response.input_tokens;
        const output_tokens = response.output_tokens;
        const fee_in = input_tokens * this.modelData.price_in;
        const fee_out = output_tokens * this.modelData.price_out;
        const fee: number = fee_in + fee_out;

        let dbSessionId = 0;
        if (session_id) {
            const session = await ctx.db.loadByKV("eiai_session", "key", session_id);
            const sessionData: any = {};
            if (!chatRequest.stream) { // in BRClient, no stream means summary session's title.
                sessionData.title = response.text && response.text.slice(0, 30);
            }

            sessionData.total_in_tokens = session ? session.total_in_tokens + input_tokens : input_tokens;
            sessionData.total_out_tokens = session ? session.total_out_tokens + output_tokens : output_tokens;
            sessionData.total_fee = session ? fee * 1.0 + session.total_fee * 1.0 : fee;

            if (session) {
                sessionData.id = session.id;
                sessionData.updated_at = new Date();
            } else {
                sessionData.key = session_id;
                sessionData.key_id = ctx.user.id;
            }
            const resSession = await ctx.db.save("eiai_session", sessionData);
            dbSessionId = resSession.id;
        }

        const messages = chatRequest.messages;

        const whole_prompt = JSON.stringify(messages);

        const lastMessage = messages.pop();
        const threadData: any = {
            prompt: JSON.stringify(lastMessage["content"]),
            completion: response.text,
            whole_prompt,
            key_id: ctx.user.id,
            session_key: session_id,
            tokens_in: input_tokens,
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
        let result: any = await this.updateKeyFee(ctx, fee);
        result.session_updated = session_id ? true : false;
        return result;

        // const month_fee = this.keyData.month_fee * 1.0;
        // const month_quota = this.keyData.month_quota * 1.0;
        // const balance = this.keyData.balance * 1.0;
        // // Update keyData fee
        // const keyDataUpdate: any = {
        //     id: this.keyData.id,
        //     total_fee: this.keyData.total_fee * 1.0 + fee,
        //     updated_at: new Date()
        // };

        // if (month_fee + fee >= month_quota) { // The balance will be consumed
        //     const balanceCost = month_fee + fee - month_quota;
        //     keyDataUpdate.balance = balance - balanceCost;
        //     // keyDataUpdate.month_fee = (month_fee > month_quota ? month_quota : month_fee); // Month quota may be modified in the middle of the process
        //     keyDataUpdate.month_fee = month_quota;
        // } else {
        //     keyDataUpdate.month_fee = month_fee + fee; // Balance spending does not count as month_fee  
        // }

        // const keyResult = await ctx.db.update("eiai_key", keyDataUpdate, ["*"]);
        // ctx.user = keyDataUpdate;
        // this.keyData = keyResult;
        // Cache.updateKeyFee(ctx.user.id, keyDataUpdate.month_fee);
        // return {
        //     session_updated: session_id ? true : false,
        //     thread_updated: true,
        //     key_updated: true
        // };
    }

    async updateKeyFee(ctx: any, fee: number) {
        const month_fee = this.keyData.month_fee * 1.0;
        const month_quota = this.keyData.month_quota * 1.0;
        const balance = this.keyData.balance * 1.0;
        // Update keyData fee
        const keyDataUpdate: any = {
            id: this.keyData.id,
            total_fee: this.keyData.total_fee * 1.0 + fee,
            updated_at: new Date()
        };

        if (month_fee + fee >= month_quota) { // The balance will be consumed
            const balanceCost = month_fee + fee - month_quota;
            keyDataUpdate.balance = balance - balanceCost;
            // keyDataUpdate.month_fee = (month_fee > month_quota ? month_quota : month_fee); // Month quota may be modified in the middle of the process
            keyDataUpdate.month_fee = month_quota;
        } else {
            keyDataUpdate.month_fee = month_fee + fee; // Balance spending does not count as month_fee  
        }


        const sql = "update eiai_key set total_fee=total_fee+$1, month_fee=$2, updated_at=$3 where id=$4 RETURNING *";
        const keyResult = await ctx.db.query(sql, [fee, keyDataUpdate.month_fee, new Date(), this.keyData.id])
        // const keyResult = await ctx.db.update("eiai_key", keyDataUpdate, ["*"]);
        ctx.user = keyDataUpdate;
        this.keyData = keyResult;
        Cache.updateKeyFee(ctx.user.id, keyDataUpdate.month_fee);
        return {
            // session_updated: session_id ? true : false,
            thread_updated: true,
            key_updated: true
        };

    }
}

