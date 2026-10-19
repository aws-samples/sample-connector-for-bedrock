import { Sha256 } from '@aws-crypto/sha256-js';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { HttpRequest } from '@smithy/protocol-http';
import { SignatureV4 } from '@smithy/signature-v4';
import { Agent, fetch as undiciFetch } from 'undici';
import { CC_SESSION_HEADER } from './constants';
import type { CcConfig } from './config';

type AwsCredentialIdentityProvider = ReturnType<typeof defaultProvider>;
type Deps = { fetch?: typeof fetch; credentials?: AwsCredentialIdentityProvider };

// undici's defaults cut a response after 300 s without body bytes, which an SSE stream reaches during a long tool
// run, a permission prompt or an idle terminal. AgentCore holds a synchronous invocation open for up to 15 minutes
// before sending headers. fetch and Agent both come from the pinned undici package: the bundled one differs by Node
// major (22 in the container image, 24 on Lambda).
export const RUNTIME_DISPATCHER_OPTIONS = { bodyTimeout: 0, headersTimeout: 16 * 60 * 1000 };

let runtimeDispatcher: Agent | undefined;
function defaultFetch(url: string, init: RequestInit): Promise<Response> {
    if (!runtimeDispatcher) runtimeDispatcher = new Agent(RUNTIME_DISPATCHER_OPTIONS);
    return undiciFetch(url, { ...(init as any), dispatcher: runtimeDispatcher }) as unknown as Promise<Response>;
}

// Shared default chain: created on first use because it caches and refreshes what it resolves.
let hostCredentialChain: AwsCredentialIdentityProvider | undefined;
function hostCredentials(): AwsCredentialIdentityProvider {
    if (!hostCredentialChain) hostCredentialChain = defaultProvider();
    return hostCredentialChain;
}

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
        credentials: deps.credentials ?? hostCredentials(),
        sha256: Sha256,
    }).sign(request);

    const headers = { ...signed.headers };
    delete headers.host;
    return (deps.fetch ?? defaultFetch)(`https://${hostname}${path}?qualifier=DEFAULT`, {
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
