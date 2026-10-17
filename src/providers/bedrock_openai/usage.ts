import { ModelData } from '../../entity/chat_request';
import { OpenAIUsage } from './types';

// Prices are per token. Postgres returns decimal columns as strings, so both forms are accepted.
export interface ModelPrices {
    price_in: number | string;
    price_out: number | string;
    price_cache_read?: number | string;
    price_cache_write?: number | string;
}

export interface UsageCost {
    // prompt_tokens as Bedrock reports it: it includes the cached and the cache-write tokens.
    tokens_in: number;
    tokens_out: number;
    cached_tokens: number;
    cache_write_tokens: number;
    fee: number;
}

export function pricesOf(modelData: ModelData): ModelPrices {
    return {
        price_in: modelData.price_in,
        price_out: modelData.price_out,
        price_cache_read: modelData.config?.price_cache_read,
        price_cache_write: modelData.config?.price_cache_write,
    };
}

// The cache prices come from the free-form model config, so a value that is missing, blank or not a
// finite number counts as not configured and bills at the input price. Without this a stray "" would
// make cache tokens free and a stray "abc" would make the fee NaN.
export function cachePrice(configured: number | string | undefined, priceIn: number): number {
    if (configured == null || (typeof configured === 'string' && configured.trim() === '')) {
        return priceIn;
    }
    const price = Number(configured);
    return Number.isFinite(price) ? price : priceIn;
}

export function computeUsageCost(usage: OpenAIUsage | null, prices: ModelPrices): UsageCost {
    const prompt = usage?.prompt_tokens ?? 0;
    const completion = usage?.completion_tokens ?? 0;
    const cached = usage?.prompt_tokens_details?.cached_tokens ?? 0;
    const cacheWrite = usage?.prompt_tokens_details?.cache_write_tokens ?? 0;
    // prompt_tokens already counts the cached and cache-write tokens, so each token is billed once.
    const uncached = Math.max(0, prompt - cached - cacheWrite);

    const priceIn = Number(prices.price_in);
    const fee =
        uncached * priceIn +
        cached * cachePrice(prices.price_cache_read, priceIn) +
        cacheWrite * cachePrice(prices.price_cache_write, priceIn) +
        completion * Number(prices.price_out);

    return { tokens_in: prompt, tokens_out: completion, cached_tokens: cached, cache_write_tokens: cacheWrite, fee };
}
