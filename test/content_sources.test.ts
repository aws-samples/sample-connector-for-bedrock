import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import BedrockConverse from '../src/providers/bedrock_converse';
import ChatMessageConverter from '../src/providers/chat_message';
import providers from '../src/providers/provider';
import { errorHandler } from '../src/middleware/handlers';
import { HERMETIC_ENV } from './helpers/hermetic_env';

const NOT_ACCEPTED = 's3Location sources are not accepted; send the content inline.';

const s3 = { s3Location: { uri: 's3://some-bucket/some/key', bucketOwner: '111122223333' } };
const s3Blocks: Record<string, any> = {
    image: { image: { format: 'png', source: s3 } },
    document: { document: { format: 'pdf', name: 'doc', source: s3 } },
    video: { video: { format: 'mp4', source: s3 } },
    'document in a toolResult': { toolResult: { toolUseId: 't1', content: [{ document: { format: 'pdf', name: 'doc', source: s3 } }] } },
};
const inlineBlocks: Record<string, any> = {
    image: { image: { format: 'png', source: { bytes: 'iVBORw0KGgo=' } } },
    document: { document: { format: 'pdf', name: 'doc', source: { bytes: 'JVBERi0xLjQ=' } } },
    video: { video: { format: 'mp4', source: { bytes: 'AAAAGGZ0eXA=' } } },
};

const model = () => ({
    config: { modelId: 'amazon.nova-pro-v1:0', regions: ['us-east-1'], credentials: [{ accessKeyId: 'fake-ak', secretAccessKey: 'fake-secret' }] },
});
const fakeCtx = (): any => ({ status: 0, headers: {}, set() {}, res: { write() {}, end() {} }, logger: { error() {}, warn() {}, info() {} } });
const openAiRequest = (block: any, role = 'user') => ({
    model: 'm',
    messages: role === 'user'
        ? [{ role: 'user', content: [{ type: 'text', text: 'look' }, block] }]
        : [{ role: 'user', content: 'hi' }, { role: 'assistant', content: [{ type: 'text', text: 'ok' }, block] }, { role: 'user', content: 'more' }],
});
const anthropicRequest = (block: any) => providers.convertAnthropicRequest({
    model: 'm',
    max_tokens: 10,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'look' }, block] }],
});

// Each converse path builds its payload before it calls Bedrock.
const paths: Record<string, (provider: any, block: any) => Promise<unknown>> = {
    'chat (user message)': (provider, block) => provider.chat(openAiRequest(block), 's', fakeCtx()),
    'chat (assistant message)': (provider, block) => provider.chat(openAiRequest(block, 'assistant'), 's', fakeCtx()),
    complete: (provider, block) => provider.complete(openAiRequest(block), 's', fakeCtx()),
    '/v1/messages': (provider, block) => provider.chatAnthropic(anthropicRequest(block), 's', fakeCtx()),
};

const rejection = async (run: () => Promise<unknown>): Promise<any> => {
    try {
        await run();
    } catch (ex) {
        return ex;
    }
    throw new Error('expected a rejection');
};

let bedrockSend: any;

beforeEach(() => {
    for (const [name, value] of Object.entries(HERMETIC_ENV)) vi.stubEnv(name, value);
    bedrockSend = vi.spyOn(BedrockRuntimeClient.prototype, 'send').mockRejectedValue(new Error('unexpected Bedrock call') as never);
});

afterEach(() => {
    bedrockSend.mockRestore();
});

describe('caller-supplied content blocks on bedrock-converse', () => {
    for (const [path, run] of Object.entries(paths)) {
        it.each(Object.keys(s3Blocks))(`${path} rejects an s3Location %s before Bedrock is called`, async (kind) => {
            const provider: any = new BedrockConverse();
            provider.setModelData(model());
            const ex = await rejection(() => run(provider, s3Blocks[kind]));
            expect(ex.message).toBe(NOT_ACCEPTED);
            expect(ex.statusCode).toBe(400);
            expect(bedrockSend).not.toHaveBeenCalled();
        });

        it.each(Object.keys(inlineBlocks))(`${path} still sends an inline %s`, async (kind) => {
            const inputs: any[] = [];
            bedrockSend.mockImplementation(async (command: any) => {
                inputs.push(command.input);
                throw Object.assign(new Error('stop after the call'), { name: 'ValidationException' });
            });
            const provider: any = new BedrockConverse();
            provider.setModelData(model());
            const ex = await rejection(() => run(provider, inlineBlocks[kind]));
            expect(ex.message).toBe('stop after the call');
            expect(inputs).toHaveLength(1);
            const sent = inputs[0].messages.flatMap((message: any) => message.content);
            expect(sent).toContainEqual(inlineBlocks[kind]);
        });
    }

    it('answers 400, invalid_request_error on /v1/messages and success:false elsewhere', async () => {
        const provider: any = new BedrockConverse();
        provider.setModelData(model());
        const ex = await rejection(() => provider.chatAnthropic(anthropicRequest(s3Blocks.image), 's', fakeCtx()));
        const run = async (path: string) => {
            const ctx: any = { path, res: { on() {} }, logger: { error() {} }, set(h: any) { this.h = h; } };
            await errorHandler(ctx, async () => { throw ex; });
            return ctx;
        };
        const messages = await run('/v1/messages');
        expect(messages.status).toBe(400);
        expect(messages.body).toEqual({ type: 'error', error: { type: 'invalid_request_error', message: NOT_ACCEPTED } });
        const legacy = await run('/v1/chat/completions');
        expect(legacy.status).toBe(400);
        expect(legacy.body).toMatchObject({ success: false });
    });
});

describe('caller-supplied content blocks in the shared message converter', () => {
    it.each(Object.keys(s3Blocks))('rejects an s3Location %s', async (kind) => {
        const ex = await rejection(() => new ChatMessageConverter().toClaude3Payload(openAiRequest(s3Blocks[kind]) as any));
        expect(ex.message).toBe(NOT_ACCEPTED);
        expect(ex.statusCode).toBe(400);
        expect(ex.anthropicType).toBe('invalid_request_error');
    });

    it.each(Object.keys(inlineBlocks))('keeps an inline %s', async (kind) => {
        const payload = await new ChatMessageConverter().toClaude3Payload(openAiRequest(inlineBlocks[kind]) as any);
        expect(payload.messages.flatMap((message: any) => message.content)).toContainEqual(inlineBlocks[kind]);
    });
});
