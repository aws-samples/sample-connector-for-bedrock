import { ChatRequest, ModelData } from '../entity/chat_request';
import Cache from '../util/cache';
import { UsageCost } from './bedrock_openai/usage';

export interface ChatUsageRecord {
    session_id?: string;
    chatRequest: ChatRequest;
    modelData: ModelData;
    text: string;
    cost: UsageCost;
    first_byte_latency?: number;
    invocation_latency?: number;
}

// Saves the key fee, the session and the thread of one chat call. It writes what
// AbstractProvider.saveThread and updateKeyFee write, but takes the model and the cost as arguments
// and the key from ctx.user, because the provider instance is shared by concurrent requests.
// The key is charged first and on its own: the quota check reads month_fee, so a session or thread row that
// fails to save, for example on an overlong session key, must not keep the key from being charged.
export async function recordChatUsage(ctx: any, rec: ChatUsageRecord): Promise<void> {
    // If the performanceMode is set, then chat history will not be saved.
    if (ctx.performanceMode || !ctx.db || !ctx.user) {
        return;
    }
    const { chatRequest, modelData, cost } = rec;
    const key = ctx.user;

    try {
        await addKeyFee(ctx, key, cost.fee);
    } catch (error) {
        ctx.logger.error({ message: 'could not charge the key', error: error instanceof Error ? error.message : String(error), keyId: key.id, fee: cost.fee });
    }

    const dbSessionId = rec.session_id ? await saveSession(ctx, key, rec) : 0;

    // saveThread pops the last message to get the prompt; reading it leaves the caller's request intact.
    const messages = chatRequest.messages;
    const lastMessage = messages[messages.length - 1];
    // A native Messages call can arrive with no messages at all; its prompt is then empty, not an error.
    await ctx.db.insert('eiai_thread', {
        prompt: lastMessage ? JSON.stringify(lastMessage.content) : '',
        completion: rec.text,
        whole_prompt: JSON.stringify(messages),
        key_id: key.id,
        model_id: modelData.id,
        session_key: rec.session_id,
        tokens_in: cost.tokens_in,
        tokens_out: cost.tokens_out,
        price_in: modelData.price_in,
        price_out: modelData.price_out,
        fee: cost.fee,
        currency: chatRequest.currency,
        invocation_latency: rec.invocation_latency,
        first_byte_latency: rec.first_byte_latency,
        session_id: dbSessionId,
        thread_type: chatRequest.stream ? 0 : 1,
    });
}

// Adds the call to the session's running totals, creating the session on its first call.
// Returns the session's database id.
async function saveSession(ctx: any, key: any, rec: ChatUsageRecord): Promise<number> {
    const session = await ctx.db.loadByKV('eiai_session', 'key', rec.session_id);
    const sessionData: any = {};
    if (!rec.chatRequest.stream) { // in BRClient, no stream means summary session's title.
        sessionData.title = rec.text && rec.text.slice(0, 30);
    }

    sessionData.total_in_tokens = session ? session.total_in_tokens + rec.cost.tokens_in : rec.cost.tokens_in;
    sessionData.total_out_tokens = session ? session.total_out_tokens + rec.cost.tokens_out : rec.cost.tokens_out;
    // total_fee is a decimal column, which Postgres returns as a string, so it is converted before adding.
    sessionData.total_fee = session ? rec.cost.fee + Number(session.total_fee) : rec.cost.fee;

    if (session) {
        sessionData.id = session.id;
        sessionData.updated_at = new Date();
    } else {
        sessionData.key = rec.session_id;
        sessionData.key_id = key.id;
    }
    const saved = await ctx.db.save('eiai_session', sessionData);
    return saved.id;
}

async function addKeyFee(ctx: any, key: any, fee: number): Promise<void> {
    const monthFee = Number(key.month_fee);
    const monthQuota = Number(key.month_quota);
    // month_fee stops at the monthly quota; spending beyond it does not count as month_fee.
    const newMonthFee = monthFee + fee >= monthQuota ? monthQuota : monthFee + fee;

    const sql = 'update eiai_key set total_fee=total_fee+$1, month_fee=$2, updated_at=$3 where id=$4 RETURNING *';
    await ctx.db.query(sql, [fee, newMonthFee, new Date(), key.id]);
    Cache.updateKeyFee(key.id, newMonthFee);
}
