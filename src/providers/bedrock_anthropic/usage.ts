import { ModelData } from '../../entity/chat_request';
import { ModelPrices, UsageCost, cachePrice } from '../bedrock_openai/usage';

// Anthropic usage as Bedrock returns it. input_tokens does NOT include the cache tokens: cache reads and
// cache writes are reported separately. A cache write has a 5-minute and a 1-hour part in cache_creation.
export interface AnthropicUsage {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number } | null;
    [k: string]: any;
}

// The 1-hour cache write price is optional. When it is not configured, the 5-minute write price applies.
export interface AnthropicPrices extends ModelPrices {
    price_cache_write_1h?: number | string;
}

export function anthropicPricesOf(modelData: ModelData): AnthropicPrices {
    return {
        price_in: modelData.price_in,
        price_out: modelData.price_out,
        price_cache_read: modelData.config?.price_cache_read,
        price_cache_write: modelData.config?.price_cache_write,
        price_cache_write_1h: modelData.config?.price_cache_write_1h,
    };
}

// Merges a stream's usage. Fields from delta override those from start. cache_creation is kept from start
// when delta does not carry it, because message_delta usually reports only the output tokens.
export function mergeAnthropicUsage(start: AnthropicUsage | null, delta: AnthropicUsage | null): AnthropicUsage | null {
    if (start == null && delta == null) {
        return null;
    }
    const merged: AnthropicUsage = { ...(start ?? {}), ...(delta ?? {}) };
    if (delta?.cache_creation == null && start?.cache_creation != null) {
        merged.cache_creation = start.cache_creation;
    }
    return merged;
}

export function computeAnthropicCost(usage: AnthropicUsage | null, prices: AnthropicPrices): UsageCost {
    const input = usage?.input_tokens ?? 0;
    const output = usage?.output_tokens ?? 0;
    const cached = usage?.cache_read_input_tokens ?? 0;

    // Without a cache_creation breakdown, all cache writes are billed as 5-minute writes.
    const breakdown = usage?.cache_creation;
    const write5m = breakdown ? breakdown.ephemeral_5m_input_tokens ?? 0 : usage?.cache_creation_input_tokens ?? 0;
    const write1h = breakdown ? breakdown.ephemeral_1h_input_tokens ?? 0 : 0;
    const cacheWrite = write5m + write1h;

    const priceIn = Number(prices.price_in);
    const priceCacheRead = cachePrice(prices.price_cache_read, priceIn);
    const priceCacheWrite = cachePrice(prices.price_cache_write, priceIn);
    const priceCacheWrite1h = cachePrice(prices.price_cache_write_1h, priceCacheWrite);

    // input_tokens excludes the cache tokens, so each token is billed exactly once.
    const fee =
        input * priceIn +
        cached * priceCacheRead +
        write5m * priceCacheWrite +
        write1h * priceCacheWrite1h +
        output * Number(prices.price_out);

    return {
        tokens_in: input + cached + cacheWrite,
        tokens_out: output,
        cached_tokens: cached,
        cache_write_tokens: cacheWrite,
        fee,
    };
}
