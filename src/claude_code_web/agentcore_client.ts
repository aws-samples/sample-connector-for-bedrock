import { Sha256 } from '@aws-crypto/sha256-js';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { HttpRequest } from '@smithy/protocol-http';
import { SignatureV4 } from '@smithy/signature-v4';
import { CC_SESSION_HEADER } from './constants';
import type { CcConfig } from './config';

type AwsCredentialIdentityProvider = ReturnType<typeof defaultProvider>;
type Deps = { fetch?: typeof fetch; credentials?: AwsCredentialIdentityProvider };

export function runtimeRegion(runtimeArn: string): string {
    return runtimeArn.split(':')[3];
}

// The ARN is percent-encoded once in the path. SignatureV4 (default uriEscapePath) encodes each segment a second
// time when it builds the canonical request, which is what non-S3 services expect; the URL fetch sends keeps the
// single encoding.
async function signedFetch(
    config: CcConfig,
    action: 'invocations' | 'stopruntimesession',
    req: { sessionId: string; body: string; headers: Record<string, string>; signal?: AbortSignal },
    deps: Deps,
): Promise<Response> {
    const region = runtimeRegion(config.runtimeArn);
    const hostname = `bedrock-agentcore.${region}.amazonaws.com`;
    const path = `/runtimes/${encodeURIComponent(config.runtimeArn)}/${action}`;
    const request = new HttpRequest({
        method: 'POST',
        protocol: 'https:',
        hostname,
        path,
        query: { qualifier: 'DEFAULT' },
        headers: { ...req.headers, [CC_SESSION_HEADER]: req.sessionId, host: hostname },
        body: req.body,
    });
    const signed = await new SignatureV4({
        service: 'bedrock-agentcore',
        region,
        credentials: deps.credentials ?? defaultProvider(),
        sha256: Sha256,
    }).sign(request);

    const headers = { ...signed.headers };
    delete headers.host;
    return (deps.fetch ?? fetch)(`https://${hostname}${path}?qualifier=DEFAULT`, {
        method: 'POST',
        headers,
        body: req.body,
        signal: req.signal,
    });
}

export function invokeRuntime(
    config: CcConfig,
    opts: { sessionId: string; body: string; contentType: string; accept?: string; headers: Record<string, string>; signal?: AbortSignal },
    deps: Deps = {},
): Promise<Response> {
    const headers: Record<string, string> = { ...opts.headers, 'content-type': opts.contentType };
    if (opts.accept) headers.accept = opts.accept;
    return signedFetch(config, 'invocations', { sessionId: opts.sessionId, body: opts.body, headers, signal: opts.signal }, deps);
}

export async function stopRuntimeSession(config: CcConfig, sessionId: string, deps: Deps = {}): Promise<{ status: number; body: string }> {
    const res = await signedFetch(config, 'stopruntimesession', { sessionId, body: '{}', headers: { 'content-type': 'application/json' } }, deps);
    return { status: res.status, body: await res.text() };
}
