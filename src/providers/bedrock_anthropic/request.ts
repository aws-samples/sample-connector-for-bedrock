// Bedrock's 400 for a beta it does not support. The back-quoted values come before "for the `anthropic-beta` header".
// Not anchored: a gateway may put text in front, and the capture is lazy so it stops at the first such header mention.
const REJECTED_BETAS_PATTERN = /Unexpected value\(s\) (.*?) for the `anthropic-beta` header/;

// Only plain beta names are remembered, and only so many per model, so a hostile or odd error body cannot grow the denylist.
const BETA_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_DENIED_PER_MODEL = 64;

// The client's anthropic-version is passed through; this is the fallback when it sends none.
const DEFAULT_ANTHROPIC_VERSION = '2023-06-01';

/**
 * Normalises the client's anthropic-beta header: split on commas (an array is joined first), trim,
 * drop empty values and de-duplicate, keeping the first occurrence.
 */
export function betasOf(header: string | string[] | undefined): string[] {
    const joined = Array.isArray(header) ? header.join(',') : (header ?? '');
    const values = joined.split(',').map((value) => value.trim()).filter((value) => value.length > 0);
    return [...new Set(values)];
}

/**
 * Reads the rejected beta values from Bedrock's error body. Returns [] for any other message, and never
 * returns 'anthropic-beta' itself.
 */
export function parseRejectedBetas(errorBody: string): string[] {
    let message = errorBody;
    try {
        const parsed = JSON.parse(errorBody);
        // Anthropic's own body nests the message; the AWS envelope puts it at the top, as message or Message.
        const found = [parsed?.error?.message, parsed?.message, parsed?.Message].find((m) => typeof m === 'string');
        if (found !== undefined) message = found;
    } catch {
        // Not JSON: match the raw text.
    }
    const match = REJECTED_BETAS_PATTERN.exec(message);
    if (!match) return [];
    const values = [...match[1].matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    return values.filter((value) => value !== 'anthropic-beta');
}

/**
 * Remembers the betas Bedrock rejected, per Bedrock modelId, so later requests to that model leave them out.
 */
export class BetaDenylist {
    private readonly rejected = new Map<string, Set<string>>();

    // Keeps the order of the betas that are not remembered for this model.
    strip(modelId: string, betas: string[]): string[] {
        const denied = this.rejected.get(modelId);
        if (!denied) return [...betas];
        return betas.filter((beta) => !denied.has(beta));
    }

    add(modelId: string, values: string[]): void {
        let denied = this.rejected.get(modelId);
        if (!denied) {
            denied = new Set<string>();
            this.rejected.set(modelId, denied);
        }
        for (const value of values) {
            if (denied.size >= MAX_DENIED_PER_MODEL) break;
            if (BETA_NAME_PATTERN.test(value)) denied.add(value);
        }
    }
}

// The process-wide denylist, shared by every request.
export const betaDenylist = new BetaDenylist();

/**
 * Builds the native /anthropic/v1/messages request. Only model is rewritten, and metadata is dropped because
 * Bedrock rejects Claude Code's JSON-string metadata.user_id. Every other field passes through, and the input is not mutated.
 */
export function buildNativeRequest(
    body: any,
    modelId: string,
    betas: string[],
    anthropicVersion?: string,
): { json: string; headers: Record<string, string>; stream: boolean } {
    const rewritten = { ...body, model: modelId };
    delete rewritten.metadata;

    const headers: Record<string, string> = { 'anthropic-version': anthropicVersion || DEFAULT_ANTHROPIC_VERSION };
    if (betas.length > 0) headers['anthropic-beta'] = betas.join(',');

    return { json: JSON.stringify(rewritten), headers, stream: body.stream === true };
}
