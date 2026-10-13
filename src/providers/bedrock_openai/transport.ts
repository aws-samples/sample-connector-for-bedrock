import { Sha256 } from '@aws-crypto/sha256-js';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { HttpRequest } from '@smithy/protocol-http';
import { SignatureV4 } from '@smithy/signature-v4';
import { HttpsProxyAgent } from 'https-proxy-agent';
import helper from '../../util/helper';

export interface AwsCredentials {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
}

// How one call authenticates. label is for logs and never holds a secret.
export type BedrockAuth =
    | { kind: 'bearer'; token: string; label: string }
    | { kind: 'sigv4'; credentials: AwsCredentials | (() => Promise<AwsCredentials>); accessKeyId?: string; label: string };

// The host's default credential chain (environment, profile, container or instance role). It is created on
// first use and shared, because the chain caches what it finds and refreshes it before it expires.
let hostCredentialChain: (() => Promise<AwsCredentials>) | undefined;
function hostCredentials(): () => Promise<AwsCredentials> {
    if (!hostCredentialChain) {
        hostCredentialChain = defaultProvider();
    }
    return hostCredentialChain;
}

// Picks how to authenticate one call: the model's own Bedrock API key, then its own access keys, then an
// API key in the environment, then the host's default credential chain. On a retry, excludeAccessKeyId is
// the key that just failed.
export function selectAuth(config: any, excludeAccessKeyId?: string | null): BedrockAuth {
    if (config?.bearerToken) {
        return { kind: 'bearer', token: config.bearerToken, label: 'bearer-token' };
    }

    // Skip the key that just failed. If that leaves none, reuse it rather than fall back to the host's credentials.
    const configured = config?.credentials;
    const credentials = helper.selectCredentials(configured, excludeAccessKeyId)
        ?? helper.selectCredentials(configured, null);
    if (credentials) {
        return {
            kind: 'sigv4',
            credentials,
            accessKeyId: credentials.accessKeyId,
            label: `${String(credentials.accessKeyId).slice(0, 8)}...`,
        };
    }

    // Read on each call, not when the module loads.
    const ambientToken = process.env.AWS_BEARER_TOKEN_BEDROCK;
    if (ambientToken) {
        return { kind: 'bearer', token: ambientToken, label: 'bearer-token' };
    }
    return { kind: 'sigv4', credentials: hostCredentials(), label: 'default-chain' };
}

// The part of an HTTP client the transport needs. NodeHttpHandler fits it; tests pass a stub.
export interface RequestHandler {
    handle(request: any, options?: { abortSignal?: AbortSignal }): Promise<{ response: { statusCode: number; headers: Record<string, string>; body: any } }>;
}

export interface UpstreamResponse {
    statusCode: number;
    headers: Record<string, string>;
    body: AsyncIterable<Uint8Array>;
}

// One handler for the process, so requests share its connection pool. It is built on the first request,
// which is when the proxy variables are read. The connect timeout turns a dead route into an error the
// caller can retry elsewhere. The proxy handling is the same as in bedrock_converse.
let sharedHandler: RequestHandler | undefined;
function defaultHandler(): RequestHandler {
    if (!sharedHandler) {
        const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
        // NodeHttpHandler types the response body as optional; an HTTP response always carries one.
        sharedHandler = new NodeHttpHandler({
            connectionTimeout: 10000,
            ...(proxyUrl ? { httpsAgent: new HttpsProxyAgent(proxyUrl) } : {}),
        }) as RequestHandler;
    }
    return sharedHandler;
}

// Sends one Chat Completions request, signed with SigV4 or carrying a bearer token. The response comes back
// as it is, error statuses included: the caller decides what to retry and reads the body itself.
export async function postChatCompletions(
    req: { region: string; auth: BedrockAuth; body: string; abortSignal?: AbortSignal },
    handler: RequestHandler = defaultHandler(),
): Promise<UpstreamResponse> {
    const { region, auth } = req;
    const hostname = `bedrock-runtime.${region}.amazonaws.com`;
    const headers: Record<string, string> = { host: hostname, 'content-type': 'application/json' };
    if (auth.kind === 'bearer') {
        headers.authorization = `Bearer ${auth.token}`;
    }
    const request = new HttpRequest({
        method: 'POST',
        protocol: 'https:',
        hostname,
        path: '/openai/v1/chat/completions',
        headers,
        body: req.body,
    });

    const outgoing = auth.kind === 'bearer'
        ? request
        : await new SignatureV4({ service: 'bedrock', region, credentials: auth.credentials, sha256: Sha256 }).sign(request);
    const { response } = await handler.handle(outgoing, { abortSignal: req.abortSignal });
    return { statusCode: response.statusCode, headers: response.headers, body: response.body };
}

// An error response from the endpoint. src/middleware/handlers.ts answers the client with statusCode and
// shows body in the error details.
export class BedrockHttpError extends Error {
    statusCode: number;
    body?: string;

    constructor(statusCode: number, message: string, body?: string) {
        super(message);
        this.name = 'BedrockRuntimeOpenAIError';
        this.statusCode = statusCode;
        this.body = body;
    }
}

// How much of an upstream error page is kept, so a large one cannot flood the client or the log.
const MESSAGE_LIMIT = 500;
const BODY_LIMIT = 2000;

// The reason the upstream gave, so the client sees why the request was refused. Bedrock puts it in
// error.message, message or Message. A body that is not JSON, or has none of those, is cut to MESSAGE_LIMIT.
function upstreamMessage(statusCode: number, bodyText: string): string {
    const text = bodyText.trim();
    if (!text) {
        return `HTTP ${statusCode}`;
    }
    try {
        const parsed = JSON.parse(text);
        for (const candidate of [parsed?.error?.message, parsed?.message, parsed?.Message]) {
            if (typeof candidate === 'string' && candidate.trim()) {
                return candidate;
            }
        }
    } catch {
        // Not JSON: the text itself is the best message there is.
    }
    return text.slice(0, MESSAGE_LIMIT);
}

export function errorFromResponse(statusCode: number, bodyText: string): BedrockHttpError {
    return new BedrockHttpError(statusCode, upstreamMessage(statusCode, bodyText), bodyText.slice(0, BODY_LIMIT));
}

// Reads a response body to the end. The bytes are joined before decoding, so a multi-byte character split
// across two chunks survives.
export async function readBody(body: AsyncIterable<Uint8Array | string> | undefined): Promise<string> {
    if (!body) {
        return '';
    }
    const chunks: Uint8Array[] = [];
    for await (const chunk of body) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
}
