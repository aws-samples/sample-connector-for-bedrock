import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    BedrockAgentRuntimeClient, InvokeAgentCommand, RetrieveAndGenerateStreamCommand,
} from '@aws-sdk/client-bedrock-agent-runtime';
import { BedrockRuntimeClient, ConverseStreamCommand, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { S3Client } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import BedrockAgent, { agentTraceUsage } from '../src/providers/bedrock_agent';
import BedrockKnowledgeBase from '../src/providers/bedrock_knowledge_base';
import Painter from '../src/providers/painter';
import AzureOpenAIImage from '../src/providers/azure_openai_image';
import { legacyFee } from '../src/providers/legacy_fee';
import { ADD_KEY_FEE_SQL } from '../src/providers/key_fee';
import logger from '../src/util/logger';
import { fakeDb } from './helpers/fakes';
import { HERMETIC_ENV } from './helpers/hermetic_env';

// Prices are per token, and price_per_image is per image, both in the model's currency.
const model = (provider: string, config: any, prices: any = { price_in: 0.000001, price_out: 0.000002 }) => ({
    id: 9, name: `${provider}-model`, provider, multiple: 1, model_type: 1, ...prices, config,
});

function fakeCtx() {
    const chunks: string[] = [];
    return {
        db: fakeDb(), user: { id: 5, api_key: 'br-test' }, headers: {}, chunks, status: 404, body: undefined as any,
        res: { write: (s: string) => { chunks.push(String(s)); return true; }, end: () => {} },
        set() {},
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    } as any;
}
const charges = (ctx: any) => ctx.db.calls.filter((c: any[]) => c[0] === 'query' && c[1] === ADD_KEY_FEE_SQL).map((c: any[]) => c[2][0]);
const charged = (ctx: any) => {
    const all = charges(ctx);
    expect(all).toHaveLength(1);
    return all[0];
};
const threads = (ctx: any) => ctx.db.calls.filter((c: any[]) => c[0] === 'insert' && c[1] === 'eiai_thread').map((c: any[]) => c[2]);
const thread = (ctx: any) => {
    const all = threads(ctx);
    expect(all).toHaveLength(1);
    return all[0];
};

function provider<T>(Kind: new () => T, modelData: any): any {
    const p: any = new Kind();
    p.setModelData(modelData);
    p.setKeyData({ id: 5 });
    return p;
}

const aPicture = async () => (await sharp({ create: { width: 80, height: 80, channels: 3, background: '#c81e1e' } }).png().toBuffer()).toString('base64');
const encode = (value: any) => new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value));

beforeEach(() => {
    for (const [name, value] of Object.entries(HERMETIC_ENV)) vi.stubEnv(name, value);
});
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

describe('bedrock-agent', () => {
    const agentModel = () => model('bedrock-agent', { agentId: 'AGENT', agentAliasId: 'ALIAS', region: 'us-east-1' });
    const request = (stream: boolean) => ({ model: 'bedrock-agent-model', stream, currency: 'USD', messages: [{ role: 'user', content: 'who am I?' }] });
    const usageTrace = (step: string, inputTokens: number, outputTokens: number) => ({
        trace: { sessionId: 's-1', trace: { [step]: { modelInvocationOutput: { traceId: 't', rawResponse: { content: 'TRACE-RAW-RESPONSE' }, metadata: { usage: { inputTokens, outputTokens } } } } } },
    });
    const otherTraces = [
        { trace: { trace: { orchestrationTrace: { rationale: { text: 'TRACE-RATIONALE' } } } } },
        { trace: { trace: { orchestrationTrace: { modelInvocationInput: { text: 'TRACE-MODEL-INPUT' } } } } },
        { trace: { trace: { guardrailTrace: { action: 'NONE' } } } },
    ];

    function stubAgent(events: any[]) {
        const sent: any[] = [];
        vi.spyOn(BedrockAgentRuntimeClient.prototype, 'send').mockImplementation((async (command: any) => {
            expect(command).toBeInstanceOf(InvokeAgentCommand);
            sent.push(command.input);
            return { completion: (async function* () { yield* events; })() };
        }) as any);
        return sent;
    }
    const events = () => [
        usageTrace('preProcessingTrace', 100, 20),
        ...otherTraces,
        { chunk: { bytes: encode('You are ') } },
        usageTrace('orchestrationTrace', 50, 10),
        { chunk: { bytes: encode('panlm.') } },
    ];

    it('sums the usage of every trace step', () => {
        for (const step of ['preProcessingTrace', 'orchestrationTrace', 'postProcessingTrace', 'routingClassifierTrace']) {
            expect(agentTraceUsage(usageTrace(step, 7, 3).trace)).toEqual({ input_tokens: 7, output_tokens: 3 });
        }
        for (const other of otherTraces) {
            expect(agentTraceUsage(other.trace)).toEqual({ input_tokens: 0, output_tokens: 0 });
        }
        expect(agentTraceUsage(undefined)).toEqual({ input_tokens: 0, output_tokens: 0 });
    });

    it.each([true, false])('bills bedrock-agent from its trace usage (stream %s)', async (stream) => {
        const sent = stubAgent(events());
        const ctx = fakeCtx();
        await provider(BedrockAgent, agentModel()).chat(request(stream), 's-1', ctx);
        expect(sent[0]).toMatchObject({ agentId: 'AGENT', agentAliasId: 'ALIAS', sessionId: 's-1', inputText: 'who am I?', enableTrace: true });
        // 150 x 1e-6 + 30 x 2e-6
        expect(charged(ctx)).toBeCloseTo(0.00021, 10);
        expect(thread(ctx)).toMatchObject({ tokens_in: 150, tokens_out: 30, completion: 'You are panlm.', session_key: 's-1' });
        expect(thread(ctx).fee).toBeCloseTo(0.00021, 10);
        expect(ctx.logger.error).not.toHaveBeenCalled();
    });

    it.each([true, false])('does not forward or log trace events (stream %s)', async (stream) => {
        stubAgent(events());
        const logged: any[] = [];
        for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
            vi.spyOn(console, method).mockImplementation((...args: any[]) => { logged.push(args); });
        }
        for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
            vi.spyOn(logger, method).mockImplementation(((...args: any[]) => { logged.push(args); return logger; }) as any);
        }
        const ctx = fakeCtx();
        await provider(BedrockAgent, agentModel()).chat(request(stream), 's-1', ctx);

        const output = stream ? ctx.chunks.join('') : JSON.stringify(ctx.body);
        expect(output).toContain('You are ');
        expect(output).toContain('panlm.');
        const seen = JSON.stringify([output, logged, ctx.logger.info.mock.calls, ctx.logger.warn.mock.calls, ctx.logger.error.mock.calls, ctx.logger.debug.mock.calls, threads(ctx)]);
        for (const marker of ['TRACE-RAW-RESPONSE', 'TRACE-RATIONALE', 'TRACE-MODEL-INPUT', 'guardrailTrace', 'inputTokens']) {
            expect(seen).not.toContain(marker);
        }
        if (stream) {
            expect(ctx.chunks.at(-1)).toBe('data: [DONE]\n\n');
        } else {
            expect(ctx.body.choices[0].message).toEqual({ role: 'assistant', content: 'You are panlm.' });
        }
        expect(thread(ctx).completion).toBe('You are panlm.');
    });
});

describe('bedrock-knowledge-base', () => {
    it('estimates knowledge-base generation', async () => {
        const question = 'How do I protect S3?';
        expect(question).toHaveLength(20);
        vi.spyOn(BedrockAgentRuntimeClient.prototype, 'send').mockImplementation((async (command: any) => {
            expect(command).toBeInstanceOf(RetrieveAndGenerateStreamCommand);
            return {
                stream: (async function* () {
                    yield { output: { text: 'a'.repeat(25) } };
                    yield { citation: { retrievedReferences: [{ content: { text: 'r'.repeat(150) }, location: { s3Location: { uri: 's3://kb/1.md' } } }] } };
                    yield { output: { text: 'b'.repeat(15) } };
                    yield { citation: { retrievedReferences: [{ content: { text: 'r'.repeat(250) }, location: { s3Location: { uri: 's3://kb/2.md' } } }] } };
                })(),
            };
        }) as any);
        const kb = model('bedrock-knowledge-base', { region: 'us-east-1', knowledgeBaseId: 'KB', bedrockModelArn: 'arn:aws:bedrock:us-east-1::foundation-model/m' });
        const ctx = fakeCtx();
        await provider(BedrockKnowledgeBase, kb).chat({ model: 'kb', stream: true, currency: 'USD', messages: [{ role: 'user', content: question }] }, 's-1', ctx);

        // ceil((20 + 400) / 4) = 105 in, ceil(40 / 4) = 10 out; 105 x 1e-6 + 10 x 2e-6
        expect(charged(ctx)).toBeCloseTo(0.000125, 10);
        expect(thread(ctx)).toMatchObject({ tokens_in: 105, tokens_out: 10, completion: 'a'.repeat(25) + 'b'.repeat(15), session_key: 's-1' });
        expect(thread(ctx).prompt).toBe(JSON.stringify(question));
        expect(ctx.chunks.at(-1)).toBe('data: [DONE]\n\n');
    });

    it('bills the summary model call with its cache tokens', async () => {
        const kb = model('bedrock-knowledge-base', { region: 'us-east-1', knowledgeBaseId: 'KB', summaryModel: 's', price_cache_read: 0.0000003, price_cache_write: 0.00000375 },
            { price_in: 0.000003, price_out: 0.000015 });
        const p = provider(BedrockKnowledgeBase, kb);
        p.client = {
            send: async (command: any) => {
                expect(command).toBeInstanceOf(ConverseStreamCommand);
                return {
                    stream: (async function* () {
                        yield { contentBlockDelta: { delta: { text: 'ok' } } };
                        yield { metadata: { usage: { inputTokens: 100, outputTokens: 20, cacheReadInputTokens: 1000, cacheWriteInputTokens: 200 }, metrics: { latencyMs: 5 } } };
                    })(),
                };
            },
        };
        const ctx = fakeCtx();
        await p.chatStream(ctx, { model: 's', messages: [{ role: 'user', content: 'hi' }] }, { config: { modelId: 'global.anthropic.claude-sonnet-5-5' } }, []);
        // 100 x 3e-6 + 1000 x 0.3e-6 + 200 x 3.75e-6 + 20 x 15e-6, as bedrock-converse bills them
        expect(charged(ctx)).toBeCloseTo(0.00165, 10);
        expect(thread(ctx)).toMatchObject({ tokens_in: 1300, tokens_out: 20 });
    });
});

// The chat calls go to this server's own chat API, which bills them. The first answer picks a tool, the next ones
// only talk, so the request ends after one step.
function stubPromptCall(toolName: string, args: any, content = 'Drawing it now.') {
    let calls = 0;
    const fetchMock = vi.fn(async () => {
        calls += 1;
        const choices: any[] = [{ message: { role: 'assistant', content: calls === 1 ? content : 'Done.' } }];
        if (calls === 1) choices.push({ message: { tool_calls: [{ id: 't1', type: 'function', function: { name: toolName, arguments: JSON.stringify(args) } }] } });
        return new Response(JSON.stringify({ choices, usage: { prompt_tokens: 10, completion_tokens: 5 } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}
function stubImageModel(images: string[]) {
    const sent: any[] = [];
    vi.spyOn(BedrockRuntimeClient.prototype, 'send').mockImplementation((async (command: any) => {
        expect(command).toBeInstanceOf(InvokeModelCommand);
        sent.push(JSON.parse(command.input.body));
        return { body: encode({ images }) };
    }) as any);
    const uploads = vi.spyOn(S3Client.prototype, 'send').mockImplementation((async () => ({})) as any);
    return { sent, uploads };
}
const paintConfig = (paintModelId: string, extra: any = {}) => ({
    paintModelId, localLlmModel: 'claude-haiku-5-5-chat', s3Bucket: 'images-bucket', s3Region: 'us-east-1', s3Prefix: 'out', regions: ['us-east-1'], ...extra,
});
const userRequest = (stream: boolean) => ({ model: 'paint', stream, currency: 'USD', messages: [{ role: 'user', content: 'two cats' }] });

describe('azure-openai-image', () => {
    const azureConfig = (extra: any = {}) => ({ baseURL: 'https://example.openai.azure.com/openai/deployments/img', apiKey: 'k', apiVersion: '2025-01-01-preview', model: 'gpt-image-1', ...extra });
    function azure(config: any, data: any[]) {
        const p = provider(AzureOpenAIImage, model('azure-openai-image', config, { price_in: 0, price_out: 0 }));
        const generate = vi.fn(async () => ({ created: 1, data }));
        p.client = { baseURL: config.baseURL, images: { generate } };
        return { p, generate };
    }

    it('bills azure-openai-image per returned image', async () => {
        const { p, generate } = azure(azureConfig({ price_per_image: '0.04' }), [{ b64_json: 'a' }, { b64_json: 'b' }]);
        const ctx = fakeCtx();
        await p.images({ model: 'azure-image', prompt: 'a cute cat', n: 3, currency: 'USD' }, 's-1', ctx);
        expect(generate).toHaveBeenCalledTimes(1);
        expect(ctx.body.data).toHaveLength(2);
        expect(charged(ctx)).toBeCloseTo(0.08, 10);
        expect(thread(ctx)).toMatchObject({ tokens_in: 0, tokens_out: 0, prompt: JSON.stringify('a cute cat'), session_key: 's-1' });
    });

    it('records an image call at 0 when no price is set, and for "", "abc" or a negative price', async () => {
        for (const extra of [{}, { price_per_image: '' }, { price_per_image: 'abc' }, { price_per_image: -0.04 }, { price_per_image: '-0.04' }]) {
            const { p } = azure(azureConfig(extra), [{ b64_json: 'a' }]);
            const ctx = fakeCtx();
            await p.images({ model: 'azure-image', prompt: 'a cute cat', currency: 'USD' }, undefined, ctx);
            expect(charged(ctx)).toBe(0);
            expect(thread(ctx)).toMatchObject({ fee: 0, tokens_in: 0, tokens_out: 0 });
            expect(ctx.logger.error).not.toHaveBeenCalled();
        }
    });
});

describe('session title', () => {
    const existing = () => fakeDb({ id: 3, title: 'my chat', total_in_tokens: 0, total_out_tokens: 0, total_fee: '0' });
    const savedSession = (ctx: any) => ctx.db.calls.find((c: any[]) => c[0] === 'save' && c[1] === 'eiai_session')?.[2];
    const imageModel = () => {
        const config = { baseURL: 'https://example.openai.azure.com/openai/deployments/img', apiKey: 'k', apiVersion: '2025-01-01-preview', model: 'gpt-image-1' };
        const p = provider(AzureOpenAIImage, model('azure-openai-image', config, { price_in: 0, price_out: 0 }));
        p.client = { baseURL: config.baseURL, images: { generate: vi.fn(async () => ({ created: 1, data: [{ b64_json: 'a' }] })) } };
        return p;
    };

    it('keeps the session title when an image call has no text', async () => {
        const ctx = fakeCtx();
        ctx.db = existing();
        await imageModel().images({ model: 'azure-image', prompt: 'a cute cat', currency: 'USD' }, 's-1', ctx);
        expect(savedSession(ctx)).toMatchObject({ id: 3 });
        expect(savedSession(ctx)).not.toHaveProperty('title');
    });

    it('titles the session with the first 30 characters of a non-stream reply', async () => {
        const ctx = fakeCtx();
        ctx.db = existing();
        const request = { model: 'm', stream: false, currency: 'USD', messages: [{ role: 'user', content: 'hi' }] } as any;
        await imageModel().saveThread(ctx, 's-1', request, { text: 'x'.repeat(40), input_tokens: 0, output_tokens: 0 });
        expect(savedSession(ctx).title).toBe('x'.repeat(30));
    });
});

describe('painter', () => {
    const painter = (config: any) => provider(Painter, model('painter', config, { price_in: 0, price_out: 0 }));

    it('bills painter per image on top of its chat calls', async () => {
        const fetchMock = stubPromptCall('txt2img', { prompt: 'a cat', negative_prompt: 'nsfw' });
        const { sent, uploads } = stubImageModel([await aPicture()]);
        const ctx = fakeCtx();
        await painter(paintConfig('stability.stable-image-core-v1:1', { price_per_image: 0.03 })).chat(userRequest(true), 's-1', ctx);

        // The chat calls went to the chat API, which bills them; the image is billed here.
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(String((fetchMock.mock.calls[0] as any[])[0])).toMatch(/\/v1\/chat\/completions$/);
        expect(sent).toHaveLength(1);
        expect(uploads).toHaveBeenCalledTimes(1);
        expect(charged(ctx)).toBeCloseTo(0.03, 10);
        expect(thread(ctx)).toMatchObject({ tokens_in: 0, tokens_out: 0, session_key: 's-1', prompt: JSON.stringify('two cats') });
        expect(ctx.chunks.join('')).toContain('![image_1](');
    });

    it('prices a picture from image_prices, then price_per_image, then the built-in table', async () => {
        for (const [extra, expected] of [
            [{ image_prices: { 'stability.stable-image-core-v1:1': '0.09' }, price_per_image: 0.03 }, 0.09],
            [{ price_per_image: 0.03 }, 0.03],
            [{}, 0.04],
        ] as const) {
            stubPromptCall('txt2img', { prompt: 'a cat' });
            stubImageModel([await aPicture()]);
            const ctx = fakeCtx();
            await painter(paintConfig('stability.stable-image-core-v1:1', extra)).chat(userRequest(true), 's-1', ctx);
            expect(charged(ctx)).toBeCloseTo(expected, 10);
            vi.restoreAllMocks();
        }
    });

    it('records no image when the drawing fails', async () => {
        stubPromptCall('txt2img', { prompt: 'a cat' });
        vi.spyOn(BedrockRuntimeClient.prototype, 'send').mockRejectedValue(new Error('model refused'));
        vi.spyOn(logger, 'error').mockImplementation((() => logger) as any);
        const ctx = fakeCtx();
        await painter(paintConfig('stability.stable-image-core-v1:1', { price_per_image: 0.04 })).chat(userRequest(true), 's-1', ctx);
        expect(ctx.chunks.join('')).toContain('> Error: model refused');
        expect(charges(ctx)).toEqual([]);
    });

    it('does not draw or bill a request without stream', async () => {
        const fetchMock = stubPromptCall('txt2img', { prompt: 'a cat' });
        const { sent } = stubImageModel([await aPicture()]);
        const ctx = fakeCtx();
        await painter(paintConfig('stability.stable-image-core-v1:1')).chat(userRequest(false), 's-1', ctx);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(sent).toEqual([]);
        expect(charges(ctx)).toEqual([]);
    });
});

describe('legacyFee images', () => {
    const data = (price_per_image: any) => ({ name: 'm', provider: 'p', multiple: 1, model_type: 1, price_in: 0.000001, price_out: 0.000002, config: { price_per_image } }) as any;

    it('adds images x price_per_image to the token fee', () => {
        expect(legacyFee(data(0.04), { input_tokens: 100, output_tokens: 10, images: 3 }).fee).toBeCloseTo(0.12012, 10);
        expect(legacyFee(data(' 0.04 '), { input_tokens: 0, output_tokens: 0, images: 2 }).fee).toBeCloseTo(0.08, 10);
    });

    it.each([undefined, null, '', '  ', 'abc', Infinity, NaN, -0.04, '-0.04', -Infinity])('counts price_per_image %s as 0', (price) => {
        expect(legacyFee(data(price), { input_tokens: 0, output_tokens: 0, images: 2 }).fee).toBe(0);
    });

    it('bills image_prices instead of images x price_per_image', () => {
        expect(legacyFee(data(0.04), { input_tokens: 100, output_tokens: 10, images: 3, image_prices: [0.14, 0.07] }).fee).toBeCloseTo(0.21012, 10);
        expect(legacyFee(data(0.04), { input_tokens: 0, output_tokens: 0, image_prices: [] }).fee).toBe(0);
    });

    it('counts a bad entry of image_prices as 0', () => {
        expect(legacyFee(data(0.04), { input_tokens: 0, output_tokens: 0, image_prices: [0.07, -1, NaN, Infinity, 'x' as any] }).fee).toBeCloseTo(0.07, 10);
    });

    it('counts a missing or bad image count as 0', () => {
        for (const images of [undefined, -1, NaN, 'x']) {
            expect(legacyFee(data(0.04), { input_tokens: 0, output_tokens: 0, images: images as any }).fee).toBe(0);
        }
    });
});
