import { describe, expect, it } from 'vitest';
import { pickRuntimeAnthropicModels } from '../claude-code-web/web_client/src/utils/brcModels.js';

const model = (id: string, owned_by: string) => ({ id, object: 'model', owned_by });

describe('pickRuntimeAnthropicModels', () => {
    it('keeps only bedrock-runtime-anthropic models, sorted by id', () => {
        const picked = pickRuntimeAnthropicModels({
            object: 'list',
            data: [
                model('claude-sonnet-5-5', 'bedrock-runtime-anthropic'),
                model('gpt-5', 'openai'),
                model('claude-haiku-5-5', 'bedrock-runtime-anthropic'),
                model('claude-3-sonnet', 'bedrock-converse'),
                model('claude-opus-5-5', 'bedrock-runtime-anthropic'),
                model('nova-pro', 'bedrock-runtime-openai'),
            ],
        });
        expect(picked.models).toEqual(['claude-haiku-5-5', 'claude-opus-5-5', 'claude-sonnet-5-5']);
    });

    it('defaults to claude-sonnet-5-5 when the key has it', () => {
        const picked = pickRuntimeAnthropicModels({
            data: [
                model('claude-haiku-5-5', 'bedrock-runtime-anthropic'),
                model('claude-sonnet-5-5', 'bedrock-runtime-anthropic'),
            ],
        });
        expect(picked.defaultModel).toBe('claude-sonnet-5-5');
    });

    it('defaults to the first model after sorting when claude-sonnet-5-5 is missing', () => {
        const picked = pickRuntimeAnthropicModels({
            data: [
                model('claude-sonnet-5-5', 'bedrock-converse'),
                model('claude-opus-5-5', 'bedrock-runtime-anthropic'),
                model('claude-haiku-5-5', 'bedrock-runtime-anthropic'),
            ],
        });
        expect(picked.models).toEqual(['claude-haiku-5-5', 'claude-opus-5-5']);
        expect(picked.defaultModel).toBe('claude-haiku-5-5');
    });

    it('has no default model when no model is left', () => {
        expect(pickRuntimeAnthropicModels({ data: [] })).toEqual({ models: [], defaultModel: null });
        expect(pickRuntimeAnthropicModels({ data: [model('gpt-5', 'openai')] })).toEqual({ models: [], defaultModel: null });
    });

    it('returns an empty list instead of throwing when data is missing', () => {
        expect(pickRuntimeAnthropicModels({ object: 'list' })).toEqual({ models: [], defaultModel: null });
        expect(pickRuntimeAnthropicModels(null)).toEqual({ models: [], defaultModel: null });
        expect(pickRuntimeAnthropicModels(undefined)).toEqual({ models: [], defaultModel: null });
    });
});
