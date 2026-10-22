import { ChatRequest, ModelData } from "../entity/chat_request";
import { withAnthropicType } from "../util/anthropic_error";
import AbstractProvider from "./abstract_provider";
import { AnthropicUsage, anthropicPricesOf, computeAnthropicCost } from "./bedrock_anthropic/usage";
import { BetaDenylist, betaDenylist, betasOf, buildNativeRequest, parseRejectedBetas } from "./bedrock_anthropic/request";
import { relayAnthropicStream } from "./bedrock_anthropic/sse";
import { regionsOf, stickyIndex } from "./bedrock_anthropic/sticky";
import {
    BedrockHttpError, RequestHandler, UpstreamResponse, errorFromResponse, postBedrock, readBody, requestIdOf, selectAuthAt,
} from "./bedrock_openai/transport";
import {
    MAX_SESSION_ID_LENGTH, RETRYABLE_STATUSES, Sleep, backoffMs, gatewayError, isNetworkError, maxRetriesOf, messageOf, readErrorBody, realSleep, retryAfterMs,
    sessionIdTooLong,
} from "./bedrock_openai/retry";
import { ChatUsageRecord, recordChatUsage } from "./usage_recorder";

// A request the client got wrong is answered in Anthropic's error shape, as invalid_request_error.
function badRequest(message: string): BedrockHttpError {
    return withAnthropicType(named(new BedrockHttpError(400, message)), 'invalid_request_error');
}

// BedrockHttpError carries phase 1's name, which is shared and must not change. Errors raised here say which provider they came from.
function named<E extends Error>(error: E): E {
    error.name = 'BedrockRuntimeAnthropicError';
    return error;
}

// A billing failure is logged, not thrown: Bedrock has answered, and a streamed answer has already reached the client.
async function recordUsage(ctx: any, requestId: string | undefined, rec: Omit<ChatUsageRecord, 'cost'> & { usage: AnthropicUsage | null }): Promise<void> {
    const { usage, ...call } = rec;
    try {
        await recordChatUsage(ctx, { ...call, cost: computeAnthropicCost(usage, anthropicPricesOf(rec.modelData)) });
    } catch (error) {
        ctx.logger.error({ message: 'bedrock-runtime-anthropic could not record usage', error: messageOf(error), requestId, modelId: rec.modelData.config?.modelId });
    }
}

// What is stored as the completion. With no text, a tool call is the answer, so it is stored in its place.
function completionOf(text: string, toolUses: unknown[]): string {
    return text || (toolUses.length > 0 ? JSON.stringify(toolUses) : '');
}

/**
 * Passes Anthropic Messages requests through to Bedrock's native endpoint, /anthropic/v1/messages, and relays the
 * Anthropic SSE back as it is. A fresh instance serves each request, so only the injected seams live on it.
 */
export default class BedrockRuntimeAnthropic extends AbstractProvider {
    private readonly handler?: RequestHandler;
    private readonly sleep: Sleep;
    private readonly pingIntervalMs?: number;
    private readonly denylist: BetaDenylist;

    // Without a handler, the transport's shared one is used. Tests pass a sleep that does not wait and their own denylist.
    constructor(handler?: RequestHandler, sleep: Sleep = realSleep, opts: { pingIntervalMs?: number; denylist?: BetaDenylist } = {}) {
        super();
        this.handler = handler;
        this.sleep = sleep;
        this.pingIntervalMs = opts.pingIntervalMs;
        this.denylist = opts.denylist ?? betaDenylist;
    }

    async messages(body: any, session_id: string | undefined, ctx: any): Promise<void> {
        const modelData: ModelData = ctx.state?.modelData;
        if (!modelData) {
            throw new Error('Model data is missing for this request.');
        }
        // Backstop: Provider already refuses a "name/<id>" model string before it gets here.
        if (typeof body?.model === 'string' && body.model.includes('/')) {
            throw badRequest(`The [${modelData.name}] model does not accept a model id override ("${modelData.name}/<model id>"). Send the model name only.`);
        }
        if (sessionIdTooLong(session_id)) {
            throw badRequest(`Session-Id must be at most ${MAX_SESSION_ID_LENGTH} characters.`);
        }
        const config = modelData.config || {};
        const modelId: string = config.modelId;
        if (!modelId) {
            throw badRequest("You must specify the parameters 'modelId' in the backend model configuration.");
        }
        const betas = this.denylist.strip(modelId, betasOf(ctx.headers?.['anthropic-beta']));
        const native = buildNativeRequest(body, modelId, betas, ctx.headers?.['anthropic-version']);

        // A client that leaves early is sent nothing more, but Bedrock's response is still read to the end and billed in
        // full. This checks writableFinished, not writableEnded: the error middleware's close listener runs first and
        // ends the response, so a response whose client left counts as ended here too. Only a completed response is finished.
        let clientLeft = false;
        ctx.res.on('close', () => {
            if (!ctx.res.writableFinished) {
                clientLeft = true;
            }
        });

        // Billing reads the request as the client sent it. The messages may be absent, and then there is no prompt.
        const chatRequest = {
            model: modelData.name,
            messages: Array.isArray(body?.messages) ? body.messages : [],
            stream: !!body?.stream,
            currency: config.currency || 'USD',
            price_in: modelData.price_in,
            price_out: modelData.price_out,
        } as unknown as ChatRequest;

        const started = Date.now();
        const upstream = await this.send(ctx, config, modelId, session_id, betas, body, ctx.headers?.['anthropic-version'], () => clientLeft);
        const first_byte_latency = Date.now() - started;
        const requestId = requestIdOf(upstream.headers);

        if (native.stream) {
            ctx.status = 200;
            ctx.set({
                'Connection': 'keep-alive',
                'Cache-Control': 'no-cache',
                'Content-Type': 'text/event-stream',
            });
            // The relay stops reading if this throws, and the rest of the stream would go unbilled. So once the client has
            // left, this does nothing, and pings go the same way.
            const result = await relayAnthropicStream(upstream.body, (event) => {
                if (!clientLeft && !ctx.res.writableEnded) {
                    ctx.res.write(event);
                }
            }, { pingIntervalMs: this.pingIntervalMs });
            const invocation_latency = Date.now() - started;

            if (!result.sawMessageStop) {
                ctx.logger.error({
                    message: 'bedrock-runtime-anthropic stream ended before message_stop',
                    error: result.error === undefined ? undefined : messageOf(result.error), requestId, modelId,
                });
            }
            await recordUsage(ctx, requestId, {
                session_id, chatRequest, modelData, text: completionOf(result.text, result.toolUses), usage: result.usage, first_byte_latency, invocation_latency,
            });
            // A client that has left hears nothing either way, so its call still resolves.
            if (result.error && !result.wroteAny && !clientLeft) {
                throw named(new BedrockHttpError(502, `Bedrock's stream broke off before its first event: ${messageOf(result.error)}`, undefined, requestId));
            }
            if (!ctx.res.writableEnded) {
                ctx.res.end();
            }
            return;
        }

        let text: string;
        try {
            text = await readBody(upstream.body);
        } catch (error) {
            throw named(new BedrockHttpError(502, `Bedrock's response broke off: ${messageOf(error)}`, undefined, requestId));
        }
        const invocation_latency = Date.now() - started;
        let json: any;
        try {
            json = JSON.parse(text);
        } catch {
            throw named(new BedrockHttpError(502, `Bedrock returned a response that is not JSON: ${text.slice(0, 200)}`, undefined, requestId));
        }
        const blocks: any[] = Array.isArray(json?.content) ? json.content : [];
        const answer = blocks.filter((block) => block?.type === 'text' && typeof block.text === 'string').map((block) => block.text).join('');
        // The same shape the stream relay collects: no tool_use id.
        const toolUses = blocks.filter((block) => block?.type === 'tool_use').map((block) => ({ type: 'tool_use', name: block.name, input: block.input }));
        await recordUsage(ctx, requestId, {
            session_id, chatRequest, modelData, text: completionOf(answer, toolUses), usage: json?.usage ?? null, first_byte_latency, invocation_latency,
        });
        ctx.status = 200;
        ctx.set({ 'Content-Type': 'application/json' });
        ctx.body = json;
    }

    async chat(chatRequest: ChatRequest, session_id: string, ctx: any): Promise<void> {
        const name = ctx.state?.modelData?.name ?? chatRequest.model;
        throw badRequest(`The [${name}] model does not support /v1/chat/completions. Use /v1/messages.`);
    }

    async complete(chatRequest: ChatRequest, session_id: string, ctx: any): Promise<void> {
        const name = ctx.state?.modelData?.name ?? chatRequest.model;
        throw badRequest(`The [${name}] model does not support /v1/completions. Use /v1/messages.`);
    }

    async chatAnthropic(chatRequest: ChatRequest, session_id: string, ctx: any): Promise<void> {
        throw new Error('bedrock-runtime-anthropic requests are dispatched to messages()');
    }

    // Sends the request. Throttling, server errors and network errors raised before any response are retried after a
    // wait. A session starts in the same region and with the same key every time, and each retry moves on to the next
    // of each. Nothing is retried once the client has left, including while it waits.
    private async send(
        ctx: any, config: any, modelId: string, session_id: string | undefined, firstBetas: string[], body: any, anthropicVersion: string | undefined,
        clientLeft: () => boolean,
    ): Promise<UpstreamResponse> {
        const maxRetries = maxRetriesOf(config);
        const regions = regionsOf(config.regions);
        const credentialCount = Array.isArray(config.credentials) && config.credentials.length > 0 ? config.credentials.length : 1;
        let betas = firstBetas;
        let native = buildNativeRequest(body, modelId, betas, anthropicVersion);
        // A beta Bedrock rejects is dropped and the call resent once, however many retries follow.
        let stripped = false;
        // Rejected values are learned only once the resend without them succeeds. A key holder can make Bedrock echo
        // a valid beta as "rejected" through a junk header value, and learning it at once would drop it for everyone.
        let pendingLearn: string[] | undefined;
        let attempt = 0;
        for (;;) {
            const region = regions[stickyIndex(session_id, attempt, regions.length)];
            const auth = selectAuthAt(config, stickyIndex(session_id, attempt, credentialCount));
            let upstream: UpstreamResponse;
            try {
                upstream = await postBedrock({ region, auth, path: '/anthropic/v1/messages', body: native.json, headers: native.headers }, this.handler);
            } catch (error: any) {
                pendingLearn = undefined;
                if (!isNetworkError(error)) {
                    throw error;
                }
                if (attempt >= maxRetries || clientLeft()) {
                    throw named(gatewayError(error));
                }
                ctx.logger.warn({ message: 'bedrock-runtime-anthropic retry', error: error.code ?? error.name, attempt, auth: auth.label, modelId });
                await this.sleep(backoffMs(attempt));
                if (clientLeft()) {
                    throw named(gatewayError(error));
                }
                attempt++;
                continue;
            }

            const status = upstream.statusCode;
            if (status < 400) {
                if (pendingLearn) {
                    this.denylist.add(modelId, pendingLearn);
                    ctx.logger.info({ message: 'bedrock-runtime-anthropic dropped betas Bedrock rejected', modelId, betas: pendingLearn, requestId: requestIdOf(upstream.headers) });
                }
                return upstream;
            }
            pendingLearn = undefined;
            // The body is read even when the response is discarded, so its connection is released.
            const requestId = requestIdOf(upstream.headers);
            const errorBody = await readErrorBody(upstream.body);
            if (status === 400 && !stripped && !clientLeft()) {
                const rejected = parseRejectedBetas(errorBody).filter((beta) => betas.includes(beta));
                if (rejected.length > 0) {
                    pendingLearn = rejected;
                    betas = betas.filter((beta) => !rejected.includes(beta));
                    native = buildNativeRequest(body, modelId, betas, anthropicVersion);
                    stripped = true;
                    // Not a failure of the region or the key, so it is resent at once and the attempt is not counted.
                    continue;
                }
            }
            const error = errorFromResponse(status, errorBody, requestId, upstream.headers);
            if (attempt >= maxRetries || clientLeft() || !RETRYABLE_STATUSES.has(status)) {
                throw error;
            }
            ctx.logger.warn({ message: 'bedrock-runtime-anthropic retry', status, requestId, attempt, auth: auth.label, modelId });
            await this.sleep(retryAfterMs(upstream.headers) ?? backoffMs(attempt));
            if (clientLeft()) {
                throw error;
            }
            attempt++;
        }
    }
}
