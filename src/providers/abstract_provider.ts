import { ChatRequest, ResponseData } from "../entity/chat_request";

export default abstract class AbstractProvider {
    keyData: any;
    constructor() {
    }

    setkeyData(value: any) {
        this.keyData = value;
    }

    abstract chat(chatRequest: ChatRequest, session_id: string, ctx: any): void;

    // save session to db
    async saveThread(ctx: any, session_id: string, chatRequest: ChatRequest, response: ResponseData) {

        // If db not set or use default admin user, will not save info.
        if (!this.keyData || ctx.user.id == -1) {
            return null;
        }
        const input_tokens = response.input_tokens;
        const output_tokens = response.output_tokens;
        const fee_in = input_tokens * chatRequest.price_in;
        const fee_out = output_tokens * chatRequest.price_out;
        const fee: number = fee_in + fee_out;

        let dbSessionId = 0;
        if (session_id) {
            const session = await ctx.db.loadByKV("eiai_session", "key", session_id);
            const sessionData: any = {};
            if (!chatRequest.stream) { // in BRClient, no stream means summary session's title.
                sessionData.title = response.text;
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
            prompt: lastMessage["content"],
            completion: response.text,
            whole_prompt,
            key_id: ctx.user.id,
            session_key: session_id,
            tokens_in: input_tokens,
            tokens_out: output_tokens,
            price_in: chatRequest.price_in,
            price_out: chatRequest.price_out,
            fee,
            currency: chatRequest.currency,
            invocation_latency: response.invocation_latency,
            first_byte_latency: response.first_byte_latency,
            session_id: dbSessionId
        }
        threadData.thread_type = chatRequest.stream ? 0 : 1;

        await ctx.db.insert("eiai_thread", threadData);

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
        await ctx.db.update("eiai_key", keyDataUpdate);

        return {
            session_updated: session_id ? true : false,
            thread_updated: true,
            key_updated: true
        };
    }

}

