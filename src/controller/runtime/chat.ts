import provider from '../../providers/provider';

export default {
    completions: async (ctx: any) => {
        return provider.chat(ctx);
    }
}
