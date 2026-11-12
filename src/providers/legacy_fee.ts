import { ModelData } from '../entity/chat_request';
import { cachePrice } from './bedrock_openai/usage';

// The token counts of one call billed through saveThread. input_tokens does not include the cache-read and
// cache-write tokens. images is the number of images an image model returned, billed at price_per_image. When a
// provider priced its images itself, image_prices holds the price of each one and replaces images x price_per_image.
export type LegacyUsage = {
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens?: number;
    cache_write_tokens?: number;
    images?: number;
    image_prices?: number[];
};

// A count that is missing, negative or not a finite number is 0, so a field the upstream left out cannot make the
// fee NaN.
function tokenCount(value: unknown): number {
    const count = Number(value);
    return Number.isFinite(count) && count > 0 ? count : 0;
}

// price_per_image comes from the free-form model config. A value that is missing, blank, negative or not a finite
// number counts as 0, so the images of a model without one are recorded at no charge.
function imagePrice(configured: unknown): number {
    if (typeof configured !== 'number' && typeof configured !== 'string') {
        return 0;
    }
    const price = Number(configured);
    return Number.isFinite(price) && price > 0 ? price : 0;
}

// The fee of one call and the input tokens to record for it. Prices are per token, and price_per_image is per image.
// The cache prices come from the model config and fall back to price_in, as on bedrock-runtime-anthropic.
export function legacyFee(modelData: ModelData, usage: LegacyUsage): { fee: number; tokens_in: number } {
    const input = tokenCount(usage.input_tokens);
    const output = tokenCount(usage.output_tokens);
    const cacheRead = tokenCount(usage.cache_read_tokens);
    const cacheWrite = tokenCount(usage.cache_write_tokens);
    const imageFee = Array.isArray(usage.image_prices)
        ? usage.image_prices.reduce((sum, price) => sum + tokenCount(price), 0)
        : tokenCount(usage.images) * imagePrice(modelData.config?.price_per_image);

    // Postgres returns decimal columns as strings.
    const priceIn = Number(modelData.price_in);
    const fee =
        input * priceIn +
        cacheRead * cachePrice(modelData.config?.price_cache_read, priceIn) +
        cacheWrite * cachePrice(modelData.config?.price_cache_write, priceIn) +
        output * Number(modelData.price_out) +
        imageFee;

    return { fee, tokens_in: input + cacheRead + cacheWrite };
}
