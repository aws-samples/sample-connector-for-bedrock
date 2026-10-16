// Errors for /v1/messages in the shape Claude Code expects: {type:'error', error:{type, message}} with a
// status that matches the type, so its retry logic can tell a 429 from a bad request.

export type AnthropicErrorType = 'invalid_request_error' | 'authentication_error' | 'billing_error' | 'permission_error'
    | 'not_found_error' | 'request_too_large' | 'rate_limit_error' | 'api_error' | 'timeout_error' | 'overloaded_error';

export type AnthropicTagged = { anthropicType?: AnthropicErrorType };

export interface AnthropicErrorResponse {
    status: number;
    body: { type: 'error'; error: { type: AnthropicErrorType; message: string } };
    headers: Record<string, string>;
}

const STATUS_OF_TYPE: Record<AnthropicErrorType, number> = {
    invalid_request_error: 400,
    authentication_error: 401,
    billing_error: 402,
    permission_error: 403,
    not_found_error: 404,
    request_too_large: 413,
    rate_limit_error: 429,
    api_error: 500,
    timeout_error: 504,
    overloaded_error: 529,
};

const FORWARDED_HEADERS = ['retry-after', 'x-should-retry'];

// Marks an error with the Anthropic type it should be answered with. Other routes ignore the mark.
export function withAnthropicType<E extends Error>(error: E, type: AnthropicErrorType): E & AnthropicTagged {
    const tagged = error as E & AnthropicTagged;
    tagged.anthropicType = type;
    return tagged;
}

export function isAnthropicPath(path: string): boolean {
    const lower = path.toLowerCase();
    return lower === '/v1/messages' || lower.startsWith('/v1/messages/');
}

function typeOfStatus(status: number): AnthropicErrorType {
    switch (status) {
        case 400: return 'invalid_request_error';
        case 401: return 'authentication_error';
        case 403: return 'permission_error';
        case 404: return 'not_found_error';
        case 413: return 'request_too_large';
        case 429: return 'rate_limit_error';
        case 503:
        case 529: return 'overloaded_error';
        case 504: return 'timeout_error';
        default: return status >= 500 ? 'api_error' : 'invalid_request_error';
    }
}

function forwardedHeaders(ex: any): Record<string, string> {
    const headers: Record<string, string> = {};
    for (const name of FORWARDED_HEADERS) {
        if (typeof ex?.headers?.[name] === 'string') {
            headers[name] = ex.headers[name];
        }
    }
    return headers;
}

// The upstream's own Anthropic error body, when the error carries one.
function upstreamAnthropicBody(ex: any): AnthropicErrorResponse['body'] | undefined {
    if (typeof ex?.body !== 'string') {
        return undefined;
    }
    try {
        const parsed = JSON.parse(ex.body);
        if (parsed?.type === 'error' && typeof parsed.error?.type === 'string' && typeof parsed.error?.message === 'string') {
            return parsed;
        }
    } catch {
        // Not JSON: fall through to the status mapping.
    }
    return undefined;
}

// A body that does not look like JSON is a proxy's page. One that starts like JSON but does not parse is an upstream
// body cut at the stored limit, and its message is already in the error.
function isNonJsonBody(body: unknown): boolean {
    if (typeof body !== 'string') {
        return false;
    }
    const trimmed = body.trim();
    return trimmed !== '' && !trimmed.startsWith('{') && !trimmed.startsWith('[');
}

export function toAnthropicError(ex: any): AnthropicErrorResponse {
    const message = ex?.message ?? String(ex);
    const headers = forwardedHeaders(ex);

    if (ex?.anthropicType && ex.anthropicType in STATUS_OF_TYPE) {
        const type: AnthropicErrorType = ex.anthropicType;
        return { status: STATUS_OF_TYPE[type], body: { type: 'error', error: { type, message } }, headers };
    }
    const upstream = upstreamAnthropicBody(ex);
    if (upstream) {
        return { status: ex.statusCode || 400, body: upstream, headers };
    }
    const status = ex?.$metadata?.httpStatusCode || ex?.statusCode;
    if (status) {
        // A body that is not JSON is a proxy's page, not a reason: the client gets a short text instead of it.
        const text = isNonJsonBody(ex.body) ? `Bedrock returned HTTP ${status}.` : message;
        return { status, body: { type: 'error', error: { type: typeOfStatus(status), message: text } }, headers };
    }
    return { status: 400, body: { type: 'error', error: { type: 'invalid_request_error', message } }, headers };
}
