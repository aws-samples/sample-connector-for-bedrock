import { describe, it, expect, vi } from 'vitest';
import { ConverseStreamCommand } from '@aws-sdk/client-bedrock-runtime';
import BedrockKnowledgeBase from '../src/providers/bedrock_knowledge_base';

// Capture the input of the ConverseStream call the summary step makes.
async function summaryInput(modelId: string): Promise<any> {
    const provider: any = new BedrockKnowledgeBase();
    provider.saveThread = vi.fn();
    let sent: any;
    provider.client = {
        send: async (command: any) => {
            expect(command).toBeInstanceOf(ConverseStreamCommand);
            sent = command.input;
            return { stream: (async function* () {})() };
        },
    };
    const ctx = { res: { write: vi.fn(), end: vi.fn() } };
    await provider.chatStream(ctx, { model: 'm', messages: [{ role: 'user', content: 'hi' }] }, { config: { modelId } }, []);
    return sent;
}

describe('knowledge-base summary sampling parameters', () => {
    it('sends neither temperature nor topP to Claude 5.5, which rejects them', async () => {
        const input = await summaryInput('global.anthropic.claude-haiku-5-5');
        expect(input.modelId).toBe('global.anthropic.claude-haiku-5-5');
        expect(input.inferenceConfig).not.toHaveProperty('temperature');
        expect(input.inferenceConfig).not.toHaveProperty('topP');
        expect(input.inferenceConfig.maxTokens).toBe(1024);
    });

    it('keeps them for a model that accepts them', async () => {
        const input = await summaryInput('global.anthropic.claude-sonnet-4-6');
        expect(input.inferenceConfig.temperature).toBe(0.7);
        expect(input.inferenceConfig.topP).toBe(0.7);
    });
});
