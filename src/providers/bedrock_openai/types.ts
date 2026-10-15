// The usage object of a Chat Completions response or stream chunk, as Bedrock returns it.
// prompt_tokens already includes the tokens counted in prompt_tokens_details.
export interface OpenAIUsage {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    prompt_tokens_details?: {
        cached_tokens?: number;
        cache_write_tokens?: number;
        [k: string]: any;
    } | null;
    [k: string]: any;
}
