import { describe, it, expect } from 'vitest';
import BedrockConverse from '../src/providers/bedrock_converse';

const answer = (content: any[]): any => ({
    output: { message: { role: 'assistant', content } },
    usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
    $metadata: { requestId: 'req-1' },
});

describe('bedrock-converse non-stream answer', () => {
    it('keeps every tool call, in order, next to the text', () => {
        const converter = new BedrockConverse();
        const body = converter.chatSyncBody(answer([
            { text: 'Drawing both.' },
            { toolUse: { toolUseId: 'tool-a', name: 'txt2img', input: { prompt: 'red lighthouse' } } },
            { toolUse: { toolUseId: 'tool-b', name: 'txt2img', input: { prompt: 'blue lighthouse' } } },
        ]), { model: 'm' } as any);

        expect(body.choices).toHaveLength(1);
        expect(body.choices[0].message).toEqual({
            role: 'assistant',
            content: 'Drawing both.',
            tool_calls: [
                { id: 'tool-a', type: 'function', function: { name: 'txt2img', arguments: '{"prompt":"red lighthouse"}' } },
                { id: 'tool-b', type: 'function', function: { name: 'txt2img', arguments: '{"prompt":"blue lighthouse"}' } },
            ],
        });
    });

    it('still returns a single tool call as a one-element list', () => {
        const body = new BedrockConverse().chatSyncBody(answer([
            { toolUse: { toolUseId: 'tool-a', name: 'txt2img', input: { prompt: 'a cat' } } },
        ]), { model: 'm' } as any);
        expect(body.choices[0].message.tool_calls).toEqual([
            { id: 'tool-a', type: 'function', function: { name: 'txt2img', arguments: '{"prompt":"a cat"}' } },
        ]);
    });
});
