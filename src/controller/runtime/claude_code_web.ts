import { Readable } from 'stream';
import { loadCcConfig } from '../../claude_code_web/config';
import { ccSessionId } from '../../claude_code_web/identity';
import { getWorkspaceCredentials } from '../../claude_code_web/workspace_credentials';
import { invokeRuntime, stopRuntimeSession } from '../../claude_code_web/agentcore_client';
import { withSseKeepalive } from '../../claude_code_web/sse_keepalive';
import { hasRuntimeAnthropicModel } from '../../claude_code_web/access';
import {
    CC_HEADER_API_KEY,
    CC_HEADER_AWS_ACCESS_KEY_ID,
    CC_HEADER_AWS_SECRET_ACCESS_KEY,
    CC_HEADER_AWS_SESSION_TOKEN,
} from '../../claude_code_web/constants';
import provider from '../../providers/provider';

// Replaceable by tests.
export const deps = {
    loadCcConfig,
    getWorkspaceCredentials,
    invokeRuntime,
    stopRuntimeSession,
    hasRuntimeAnthropicModel,
    checkFee: (ctx: any, key: any) => provider.checkFee(ctx, key),
};

// Checks 1-4 of the BFF contract. Returns the config, or null after having set the error response.
async function admit(ctx: any) {
    const config = await deps.loadCcConfig();
    if (!config) {
        ctx.status = 404;
        ctx.body = { error: 'claude-code-web is not enabled' };
        return null;
    }
    if (ctx.user.id === -1) {
        ctx.status = 403;
        ctx.body = { error: 'the admin key cannot use claude-code-web' };
        return null;
    }
    if (!(await deps.hasRuntimeAnthropicModel(ctx.db, ctx.user))) {
        ctx.status = 403;
        ctx.body = { error: 'this key has no bedrock-runtime-anthropic model' };
        return null;
    }
    try {
        await deps.checkFee(ctx, ctx.user);
    } catch (e: any) {
        if (e?.anthropicType !== 'billing_error') throw e;
        ctx.status = 402;
        ctx.body = { error: e.message };
        return null;
    }
    return config;
}

function unreachable(ctx: any, e: any) {
    // Only the error class and code: never the message, which could echo request details.
    ctx.logger?.error({ message: 'claude-code-web runtime unreachable', name: e?.name, code: e?.code });
    ctx.status = 502;
    ctx.body = { error: 'claude-code-web runtime unreachable' };
}

export async function invocations(ctx: any) {
    const config = await admit(ctx);
    if (!config) return;

    const sessionId = ccSessionId(ctx.user.id);
    const creds = await deps.getWorkspaceCredentials(config, ctx.user.id);

    // Browser closed the page before the response finished: cancel the upstream request and the keepalive timer.
    const abort = new AbortController();
    let output: Readable | undefined;
    // Listen on res: once koa-body has read the request, req 'close' has already fired. Track 'finish'
    // ourselves: errorHandler ends res inside its own 'close' listener, and on Node 22 that already
    // flips writableFinished on a destroyed socket.
    let finished = false;
    ctx.res.once('finish', () => { finished = true; });
    ctx.res.on('close', () => {
        if (finished) return;
        abort.abort();
        output?.destroy();
    });

    let res: Response;
    try {
        res = await deps.invokeRuntime(config, {
            sessionId,
            body: JSON.stringify(ctx.request.body),
            contentType: 'application/json',
            accept: ctx.headers?.accept,
            headers: {
                [CC_HEADER_API_KEY]: ctx.user.api_key,
                [CC_HEADER_AWS_ACCESS_KEY_ID]: creds.accessKeyId,
                [CC_HEADER_AWS_SECRET_ACCESS_KEY]: creds.secretAccessKey,
                [CC_HEADER_AWS_SESSION_TOKEN]: creds.sessionToken,
            },
            signal: abort.signal,
        });
    } catch (e: any) {
        if (abort.signal.aborted) return; // the client left; nobody is waiting for an answer
        unreachable(ctx, e);
        return;
    }
    if (abort.signal.aborted) {
        await res.body?.cancel().catch(() => {});
        return;
    }

    const contentType = res.headers.get('content-type') || 'application/json';
    ctx.status = res.status;
    if (contentType.includes('text/event-stream') && res.body) {
        output = withSseKeepalive(Readable.fromWeb(res.body as any));
        ctx.type = 'text/event-stream';
        ctx.set('Cache-Control', 'no-cache');
        ctx.body = output;
    } else {
        let text: string;
        try {
            text = await res.text();
        } catch (e: any) {
            if (abort.signal.aborted) return; // the client left while the body was being read
            throw e;
        }
        ctx.type = contentType;
        ctx.body = text;
    }
}

export async function stopSession(ctx: any) {
    const config = await admit(ctx);
    if (!config) return;

    let res: { status: number; body: string };
    try {
        res = await deps.stopRuntimeSession(config, ccSessionId(ctx.user.id));
    } catch (e: any) {
        unreachable(ctx, e);
        return;
    }
    if (res.status === 404) {
        ctx.status = 200;
        ctx.body = { status: 'no_session' };
        return;
    }
    ctx.status = res.status;
    ctx.type = 'application/json';
    ctx.body = res.body;
}

export default { invocations, stopSession };
