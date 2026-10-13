import { ChatRequest, ModelData } from "../entity/chat_request";
import helper from "../util/helper";
import AbstractProvider from "./abstract_provider";
import { buildRequestBody } from "./bedrock_openai/request_body";
import { relayChatStream } from "./bedrock_openai/sse";
import {
    BedrockAuth, BedrockHttpError, RequestHandler, UpstreamResponse, errorFromResponse, postChatCompletions, readBody, selectAuth,
} from "./bedrock_openai/transport";
import { OpenAIUsage } from "./bedrock_openai/types";
import { computeUsageCost, pricesOf } from "./bedrock_openai/usage";
import { ChatUsageRecord, recordChatUsage } from "./usage_recorder";

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
// Failures to reach Bedrock at all. Anything else, such as a credential error, is final.
const NETWORK_ERROR_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'ENOTFOUND', 'EAI_AGAIN']);
const DEFAULT_MAX_RETRIES = 3;
// The length of eiai_session.key and eiai_thread.session_key.
const MAX_SESSION_ID_LENGTH = 128;

// Retries back off with full jitter: a random wait below a ceiling that doubles with each attempt, so clients
// throttled together do not all come back together.
const BACKOFF_BASE_MS = 200;
const BACKOFF_CAP_MS = 2000;
// A retry-after longer than this is cut short, so a client is not kept waiting on one retry for minutes.
const RETRY_AFTER_CAP_MS = 5000;

export type Sleep = (ms: number) => Promise<void>;
const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function backoffMs(attempt: number): number {
    return Math.floor(Math.random() * Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** attempt));
}

// The wait a retry-after header asks for, when it is a number of seconds. The HTTP-date form is ignored.
function retryAfterMs(headers: Record<string, string> | undefined): number | undefined {
    const value = headers?.['retry-after'];
    if (typeof value !== 'string' || !/^\d+(\.\d+)?$/.test(value.trim())) {
        return undefined;
    }
    return Math.min(RETRY_AFTER_CAP_MS, Number(value) * 1000);
}

function isNetworkError(error: any): boolean {
    return NETWORK_ERROR_CODES.has(error?.code) || error?.name === 'TimeoutError';
}

// The access key the next attempt should avoid. A bearer token has none, so a retry reuses it.
function keyToAvoid(auth: BedrockAuth): string | undefined {
    return auth.kind === 'sigv4' ? auth.accessKeyId : undefined;
}

// maxRetries comes from the free-form model config. Anything but a whole number of zero or more means the default,
// so a typo cannot make the retries endless.
function maxRetriesOf(config: any): number {
    const value = config.maxRetries;
    return Number.isInteger(value) && value >= 0 ? value : DEFAULT_MAX_RETRIES;
}

// An error body that breaks off counts as empty, so the client still gets the upstream status.
async function readErrorBody(body: AsyncIterable<Uint8Array>): Promise<string> {
    try {
        return await readBody(body);
    } catch {
        return '';
    }
}

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

// A billing failure is logged, not thrown: Bedrock has answered, and a streamed answer has already reached the client.
async function recordUsage(ctx: any, rec: Omit<ChatUsageRecord, 'cost'> & { usage: OpenAIUsage | null }): Promise<void> {
    const { usage, ...call } = rec;
    try {
        await recordChatUsage(ctx, { ...call, cost: computeUsageCost(usage, pricesOf(rec.modelData)) });
    } catch (error) {
        ctx.logger.error({ message: 'bedrock-runtime-openai could not record usage', error: messageOf(error), modelId: rec.modelData.config?.modelId });
    }
}

/**
 * Passes OpenAI Chat Completions requests through to Bedrock's runtime endpoint, /openai/v1/chat/completions.
 * One instance serves concurrent requests, so a request's model comes from ctx.state and its retry state lives in
 * local variables.
 */
export default class BedrockRuntimeOpenAI extends AbstractProvider {
    private readonly handler?: RequestHandler;
    private readonly sleep: Sleep;

    // Without a handler, the transport's shared one is used. Tests pass a sleep that does not wait.
    constructor(handler?: RequestHandler, sleep: Sleep = realSleep) {
        super();
        this.handler = handler;
        this.sleep = sleep;
    }

    async chat(chatRequest: ChatRequest, session_id: string, ctx: any): Promise<void> {
        const modelData: ModelData = ctx.state?.modelData;
        if (!modelData) {
            throw new Error('Model data is missing for this request.');
        }
        if (chatRequest.model_id) {
            throw new BedrockHttpError(400, `The [${modelData.name}] model does not accept a model id override ("${modelData.name}/<model id>"). Send the model name only.`);
        }
        // A longer one could not be saved with the call's usage. Postgres counts characters, not UTF-16 units.
        if (typeof session_id === 'string' && Array.from(session_id).length > MAX_SESSION_ID_LENGTH) {
            throw new BedrockHttpError(400, `Session-Id must be at most ${MAX_SESSION_ID_LENGTH} characters.`);
        }
        const config = modelData.config || {};
        const modelId: string = config.modelId;
        if (!modelId) {
            throw new Error("You must specify the parameters 'modelId' in the backend model configuration.");
        }
        const built = buildRequestBody(chatRequest, modelId);

        // A client that leaves early is sent nothing more, but Bedrock's response is still read to the end and billed in
        // full, as bedrock-converse bills it. This checks writableFinished, not writableEnded: the error middleware's
        // close listener runs first and ends the response, so a response whose client left counts as ended here too.
        // Only a completed response is finished.
        let clientLeft = false;
        ctx.res.on('close', () => {
            if (!ctx.res.writableFinished) {
                clientLeft = true;
            }
        });

        const started = Date.now();
        const upstream = await this.send(ctx, config, modelId, JSON.stringify(built.body), () => clientLeft);
        const first_byte_latency = Date.now() - started;

        if (built.body.stream) {
            ctx.status = 200;
            ctx.set({
                'Connection': 'keep-alive',
                'Cache-Control': 'no-cache',
                'Content-Type': 'text/event-stream',
            });
            const result = await relayChatStream(upstream.body, (event) => {
                if (!clientLeft && !ctx.res.writableEnded) {
                    ctx.res.write(event);
                }
            }, { forwardUsageChunk: built.clientWantsUsage });
            const invocation_latency = Date.now() - started;

            if (result.error) {
                ctx.logger.error({ message: 'bedrock-runtime-openai stream failed', error: messageOf(result.error), modelId });
            }
            if (!result.usage) {
                ctx.logger.warn({ message: 'bedrock-runtime-openai stream had no usage, so it is billed as zero tokens', modelId });
            }
            await recordUsage(ctx, { session_id, chatRequest, modelData, text: result.text, usage: result.usage, first_byte_latency, invocation_latency });
            if (!ctx.res.writableEnded) {
                ctx.res.end();
            }
            return;
        }

        const text = await readBody(upstream.body);
        const invocation_latency = Date.now() - started;
        let json: any;
        try {
            json = JSON.parse(text);
        } catch {
            throw new BedrockHttpError(502, `Bedrock returned a response that is not JSON: ${text.slice(0, 200)}`);
        }
        const content = json?.choices?.[0]?.message?.content;
        await recordUsage(ctx, {
            session_id, chatRequest, modelData, text: typeof content === 'string' ? content : '', usage: json?.usage ?? null,
            first_byte_latency, invocation_latency,
        });
        ctx.status = 200;
        ctx.set({ 'Content-Type': 'application/json' });
        ctx.body = json;
    }

    async chatAnthropic(chatRequest: ChatRequest, session_id: string, ctx: any): Promise<void> {
        const name = ctx.state?.modelData?.name ?? chatRequest.model;
        throw new BedrockHttpError(400, `The [${name}] model does not support the Anthropic Messages API (/v1/messages). Use /v1/chat/completions.`);
    }

    async complete(chatRequest: ChatRequest, session_id: string, ctx: any): Promise<void> {
        const name = ctx.state?.modelData?.name ?? chatRequest.model;
        throw new BedrockHttpError(400, `The [${name}] model does not support /v1/completions. Use /v1/chat/completions.`);
    }

    // Sends the request. Throttling, server errors and network errors raised before any response are retried after a
    // wait, each time in a freshly picked region and, if another key is configured, with a key other than the one that
    // failed. Nothing is retried once the client has left, including while it waits.
    private async send(ctx: any, config: any, modelId: string, body: string, clientLeft: () => boolean): Promise<UpstreamResponse> {
        const maxRetries = maxRetriesOf(config);
        let excludeKey: string | undefined;
        for (let attempt = 0; ; attempt++) {
            const region = helper.selectRandomRegion(config.regions);
            const auth = selectAuth(config, excludeKey);
            let upstream: UpstreamResponse;
            try {
                upstream = await postChatCompletions({ region, auth, body }, this.handler);
            } catch (error: any) {
                if (attempt >= maxRetries || clientLeft() || !isNetworkError(error)) {
                    throw error;
                }
                ctx.logger.warn({ message: 'bedrock-runtime-openai retry', error: error.code ?? error.name, attempt, auth: auth.label, modelId });
                excludeKey = keyToAvoid(auth);
                await this.sleep(backoffMs(attempt));
                if (clientLeft()) {
                    throw error;
                }
                continue;
            }

            const status = upstream.statusCode;
            if (status < 400) {
                return upstream;
            }
            // The body is read even when the response is discarded, so its connection is released.
            const error = errorFromResponse(status, await readErrorBody(upstream.body));
            if (attempt >= maxRetries || clientLeft() || !RETRYABLE_STATUSES.has(status)) {
                throw error;
            }
            ctx.logger.warn({ message: 'bedrock-runtime-openai retry', status, attempt, auth: auth.label, modelId });
            excludeKey = keyToAvoid(auth);
            await this.sleep(retryAfterMs(upstream.headers) ?? backoffMs(attempt));
            if (clientLeft()) {
                throw error;
            }
        }
    }
}
