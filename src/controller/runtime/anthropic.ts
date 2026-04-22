import provider from '../../providers/provider';

/**
 * Anthropic Messages API controller
 * POST /v1/messages
 */
export default {
    messages: async (ctx: any) => {
        return provider.anthropicMessages(ctx);
    }
}
