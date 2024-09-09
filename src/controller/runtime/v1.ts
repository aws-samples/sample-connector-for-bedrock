import provider from '../../providers/provider';

export default {
  chat_completions: async (ctx: any) => {
    return provider.chat(ctx);
  },

  completions: async (ctx: any) => {
    return provider.complete(ctx);
  }

}
