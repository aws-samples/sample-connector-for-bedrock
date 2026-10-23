import { ModelData } from '../entity/chat_request';
import { cachePrice } from './bedrock_openai/usage';

// The token counts of one call billed through saveThread. input_tokens does not include the cache-read and
// cache-write tokens.
export type LegacyUsage = {
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens?: number;
    cache_write_tokens?: number;
};

// A count that is missing, negative or not a finite number is 0, so a field the upstream left out cannot make the
// fee NaN.
function tokenCount(value: unknown): number {
    const count = Number(value);
    return Number.isFinite(count) && count > 0 ? count : 0;
}

// The fee of one call and the input tokens to record for it. Prices are per token. The cache prices come from the
// model config and fall back to price_in, as on bedrock-runtime-anthropic.
export function legacyFee(modelData: ModelData, usage: LegacyUsage): { fee: number; tokens_in: number } {
    const input = tokenCount(usage.input_tokens);
    const output = tokenCount(usage.output_tokens);
    const cacheRead = tokenCount(usage.cache_read_tokens);
    const cacheWrite = tokenCount(usage.cache_write_tokens);

    // Postgres returns decimal columns as strings.
    const priceIn = Number(modelData.price_in);
    const fee =
        input * priceIn +
        cacheRead * cachePrice(modelData.config?.price_cache_read, priceIn) +
        cacheWrite * cachePrice(modelData.config?.price_cache_write, priceIn) +
        output * Number(modelData.price_out);

    return { fee, tokens_in: input + cacheRead + cacheWrite };
}
