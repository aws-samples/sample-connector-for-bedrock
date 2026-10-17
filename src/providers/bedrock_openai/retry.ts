import { BedrockHttpError, readBody } from "./transport";

export const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
// Failures to reach Bedrock at all. Anything else, such as a credential error, is final.
const NETWORK_ERROR_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'ENOTFOUND', 'EAI_AGAIN']);
export const DEFAULT_MAX_RETRIES = 3;
// The length of eiai_session.key and eiai_thread.session_key.
export const MAX_SESSION_ID_LENGTH = 128;

// Retries back off with full jitter: a random wait below a ceiling that doubles with each attempt, so clients
// throttled together do not all come back together.
const BACKOFF_BASE_MS = 200;
const BACKOFF_CAP_MS = 2000;
// A retry-after longer than this is cut short, so a client is not kept waiting on one retry for minutes.
const RETRY_AFTER_CAP_MS = 5000;

export type Sleep = (ms: number) => Promise<void>;
export const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function backoffMs(attempt: number): number {
    return Math.floor(Math.random() * Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** attempt));
}

// The wait a retry-after header asks for, when it is a number of seconds. The HTTP-date form is ignored.
export function retryAfterMs(headers: Record<string, string> | undefined): number | undefined {
    const value = headers?.['retry-after'];
    if (typeof value !== 'string' || !/^\d+(\.\d+)?$/.test(value.trim())) {
        return undefined;
    }
    return Math.min(RETRY_AFTER_CAP_MS, Number(value) * 1000);
}

export function isNetworkError(error: any): boolean {
    return NETWORK_ERROR_CODES.has(error?.code) || error?.name === 'TimeoutError';
}

// A network error that ends the call. Left as it is, the error middleware would answer it with 400.
export function gatewayError(error: any): BedrockHttpError {
    const failure = new BedrockHttpError(error?.name === 'TimeoutError' ? 504 : 502, messageOf(error));
    if (error?.code) {
        failure.code = error.code;
    }
    return failure;
}

// maxRetries comes from the free-form model config. Anything but a whole number of zero or more means the default,
// so a typo cannot make the retries endless.
export function maxRetriesOf(config: any): number {
    const value = config.maxRetries;
    return Number.isInteger(value) && value >= 0 ? value : DEFAULT_MAX_RETRIES;
}

// An error body that breaks off counts as empty, so the client still gets the upstream status.
export async function readErrorBody(body: AsyncIterable<Uint8Array>): Promise<string> {
    try {
        return await readBody(body);
    } catch {
        return '';
    }
}

export function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

