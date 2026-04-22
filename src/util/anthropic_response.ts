import crypto from 'crypto';

/**
 * Anthropic Messages API response helpers
 * Spec: https://docs.anthropic.com/en/api/messages
 */

export default {
    messageId() {
        return 'msg_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    },

    // Non-streaming response
    wrapSync(model: string, content: any[], stopReason: string, usage: { input_tokens: number, output_tokens: number }, requestId?: string) {
        return {
            id: this.messageId(),
            type: 'message',
            role: 'assistant',
            model,
            content,
            stop_reason: stopReason,
            stop_sequence: null,
            usage: {
                input_tokens: usage.input_tokens,
                output_tokens: usage.output_tokens,
            }
        };
    },

    // SSE event helpers
    sseEvent(event: string, data: any) {
        return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    },

    messageStart(msgId: string, model: string, inputTokens: number) {
        return this.sseEvent('message_start', {
            type: 'message_start',
            message: {
                id: msgId,
                type: 'message',
                role: 'assistant',
                model,
                content: [],
                stop_reason: null,
                stop_sequence: null,
                usage: { input_tokens: inputTokens, output_tokens: 0 }
            }
        });
    },

    contentBlockStart(index: number, block: any) {
        return this.sseEvent('content_block_start', {
            type: 'content_block_start',
            index,
            content_block: block
        });
    },

    contentBlockDelta(index: number, delta: any) {
        return this.sseEvent('content_block_delta', {
            type: 'content_block_delta',
            index,
            delta
        });
    },

    contentBlockStop(index: number) {
        return this.sseEvent('content_block_stop', {
            type: 'content_block_stop',
            index
        });
    },

    messageDelta(stopReason: string, outputTokens: number) {
        return this.sseEvent('message_delta', {
            type: 'message_delta',
            delta: { stop_reason: stopReason, stop_sequence: null },
            usage: { output_tokens: outputTokens }
        });
    },

    messageStop() {
        return this.sseEvent('message_stop', { type: 'message_stop' });
    },

    ping() {
        return this.sseEvent('ping', { type: 'ping' });
    },

    // Map Bedrock stop reason → Anthropic stop reason
    mapStopReason(bedrockReason: string): string {
        switch (bedrockReason) {
            case 'end_turn': return 'end_turn';
            case 'tool_use': return 'tool_use';
            case 'max_tokens': return 'max_tokens';
            case 'stop_sequence': return 'stop_sequence';
            default: return 'end_turn';
        }
    }
};
