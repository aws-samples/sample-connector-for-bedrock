// What an OpenAI SDK chat stream sent, for saveThread.
export interface OpenAIStreamResult {
    text: string;
    // The usage of the last chunk that carried one, or null when none did.
    usage: { prompt_tokens: number; completion_tokens: number } | null;
}

// Relays an OpenAI SDK chat stream to the client as SSE, without the final [DONE], and collects the text and the
// usage. Streams ask the upstream for usage so the call can be billed, so the usage-only chunk (empty or no choices)
// is forwarded only to a client that asked for it with stream_options.include_usage.
export async function pipeOpenAIStream(ctx: any, stream: AsyncIterable<any>, opts: { forwardUsageChunk: boolean }): Promise<OpenAIStreamResult> {
    const result: OpenAIStreamResult = { text: '', usage: null };
    for await (const part of stream) {
        const delta = part?.choices?.[0]?.delta;
        result.text += (delta?.reasoning_content || '') + (delta?.content || '');

        const usage = part?.usage;
        if (usage) {
            result.usage = { prompt_tokens: usage.prompt_tokens ?? 0, completion_tokens: usage.completion_tokens ?? 0 };
            const usageOnly = !Array.isArray(part.choices) || part.choices.length === 0;
            if (usageOnly && !opts.forwardUsageChunk) {
                continue;
            }
        }
        ctx.res.write("data: " + JSON.stringify(part) + "\n\n");
    }
    return result;
}
