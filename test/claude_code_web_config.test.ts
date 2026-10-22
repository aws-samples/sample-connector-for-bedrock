import { describe, it, expect, beforeEach, vi } from 'vitest';
import logger from '../src/util/logger';
import { loadCcConfig, resetCcConfigCache } from '../src/claude_code_web/config';
import { ccUserId, ccSessionId } from '../src/claude_code_web/identity';

// Fake ARNs only.
const RUNTIME = 'arn:aws:bedrock-agentcore:us-east-1:111111111111:runtime/fake';
const ROLE = 'arn:aws:iam::111111111111:role/fake-workspace';
const PARAM = 'arn:aws:ssm:us-west-2:111111111111:parameter/brc/cc';
const full = { CC_RUNTIME_ARN: RUNTIME, CC_WORKSPACE_ROLE_ARN: ROLE, CC_WORKSPACE_BUCKET: 'fake-bucket' };
const ssmValue = { runtimeArn: RUNTIME, workspaceRoleArn: ROLE, bucket: 'ssm-bucket', prefix: 'p' };

describe('loadCcConfig', () => {
    beforeEach(() => resetCcConfigCache());

    it('returns the config from direct env vars, prefix defaults to user_data', async () => {
        expect(await loadCcConfig({ env: full })).toEqual({
            runtimeArn: RUNTIME,
            workspaceRoleArn: ROLE,
            bucket: 'fake-bucket',
            prefix: 'user_data',
        });
    });

    it('honours CC_WORKSPACE_PREFIX', async () => {
        const cfg = await loadCcConfig({ env: { ...full, CC_WORKSPACE_PREFIX: 'x' } });
        expect(cfg?.prefix).toBe('x');
    });

    it('returns null when CC_RUNTIME_ARN is set but the bucket is missing', async () => {
        const { CC_WORKSPACE_BUCKET, ...partial } = full;
        expect(await loadCcConfig({ env: partial })).toBeNull();
    });

    it('prefers direct env vars over the SSM parameter', async () => {
        const getParameter = vi.fn(async () => JSON.stringify(ssmValue));
        const cfg = await loadCcConfig({ env: { ...full, CC_CONFIG_PARAM: PARAM }, getParameter });
        expect(cfg?.bucket).toBe('fake-bucket');
        expect(getParameter).not.toHaveBeenCalled();
    });

    it('reads the SSM parameter by ARN', async () => {
        const getParameter = vi.fn(async (_arn: string) => JSON.stringify(ssmValue));
        const cfg = await loadCcConfig({ env: { CC_CONFIG_PARAM: PARAM }, getParameter });
        expect(cfg).toEqual(ssmValue);
        expect(getParameter).toHaveBeenCalledWith(PARAM);
    });

    it('returns null when the SSM JSON lacks a field or has an empty one', async () => {
        const { bucket, ...missing } = ssmValue;
        expect(await loadCcConfig({ env: { CC_CONFIG_PARAM: PARAM }, getParameter: async () => JSON.stringify(missing) })).toBeNull();
        resetCcConfigCache();
        expect(
            await loadCcConfig({ env: { CC_CONFIG_PARAM: PARAM }, getParameter: async () => JSON.stringify({ ...ssmValue, prefix: '' }) }),
        ).toBeNull();
    });

    it('returns null for non-JSON SSM values', async () => {
        expect(await loadCcConfig({ env: { CC_CONFIG_PARAM: PARAM }, getParameter: async () => 'not json' })).toBeNull();
    });

    it('caches a failure for 30 s only: a parameter that becomes valid is picked up afterwards', async () => {
        let t = 1_000_000;
        const now = () => t;
        const getParameter = vi
            .fn<(arn: string) => Promise<string>>()
            .mockRejectedValueOnce(new Error('ParameterNotFound'))
            .mockResolvedValue(JSON.stringify(ssmValue));
        const env = { CC_CONFIG_PARAM: PARAM };
        expect(await loadCcConfig({ env, getParameter, now })).toBeNull();
        t += 29_999;
        expect(await loadCcConfig({ env, getParameter, now })).toBeNull();
        expect(getParameter).toHaveBeenCalledTimes(1);
        t += 1;
        expect(await loadCcConfig({ env, getParameter, now })).toEqual(ssmValue);
        expect(getParameter).toHaveBeenCalledTimes(2);
    });

    it('warns once per 30 s while misconfigured, not per request', async () => {
        const spy = vi.spyOn(logger, 'warn').mockImplementation((() => logger) as any);
        let t = 0;
        const now = () => t;
        const getParameter = vi.fn(async (_arn: string) => 'not json');
        const env = { CC_CONFIG_PARAM: PARAM };
        for (let i = 0; i < 5; i++) expect(await loadCcConfig({ env, getParameter, now })).toBeNull();
        expect(getParameter).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledTimes(1);
        t = 30_000;
        expect(await loadCcConfig({ env, getParameter, now })).toBeNull();
        expect(getParameter).toHaveBeenCalledTimes(2);
        expect(spy).toHaveBeenCalledTimes(2);
        spy.mockRestore();
    });

    it('does not cache "not configured"', async () => {
        expect(await loadCcConfig({ env: {} })).toBeNull();
        expect(await loadCcConfig({ env: full })).not.toBeNull();
    });

    it('caches a success', async () => {
        const getParameter = vi.fn(async (_arn: string) => JSON.stringify(ssmValue));
        const env = { CC_CONFIG_PARAM: PARAM };
        await loadCcConfig({ env, getParameter });
        await loadCcConfig({ env, getParameter });
        expect(getParameter).toHaveBeenCalledTimes(1);
    });

    it('returns null when nothing is configured', async () => {
        expect(await loadCcConfig({ env: {} })).toBeNull();
    });
});

describe('loadCcConfig workspace prefix validation', () => {
    beforeEach(() => resetCcConfigCache());
    const env = { CC_CONFIG_PARAM: PARAM };
    const BAD = ['user_*', 'user?', 'u$x', 'u{x}', 'a{', 'b}', '/user_data', 'user_data/', '/', ''];

    it('rejects an SSM prefix with IAM wildcard or policy-variable characters, edge slashes, or nothing', async () => {
        const spy = vi.spyOn(logger, 'warn').mockImplementation((() => logger) as any);
        for (const prefix of BAD) {
            resetCcConfigCache();
            const getParameter = async () => JSON.stringify({ ...ssmValue, prefix });
            expect(await loadCcConfig({ env, getParameter }), prefix).toBeNull();
            expect(String(spy.mock.calls.at(-1)?.[0]), prefix).toMatch(/fields: prefix$/);
        }
        spy.mockRestore();
    });

    it('rejects such a CC_WORKSPACE_PREFIX and names the variable', async () => {
        const spy = vi.spyOn(logger, 'warn').mockImplementation((() => logger) as any);
        for (const prefix of BAD.filter((p) => p !== '')) {
            resetCcConfigCache();
            expect(await loadCcConfig({ env: { ...full, CC_WORKSPACE_PREFIX: prefix } }), prefix).toBeNull();
            const msg = String(spy.mock.calls.at(-1)?.[0]);
            expect(msg, prefix).toContain('CC_WORKSPACE_PREFIX');
            if (/[a-z]/.test(prefix)) expect(msg, prefix).not.toContain(prefix); // names the variable, not its value
        }
        spy.mockRestore();
    });

    it('accepts nested prefixes', async () => {
        expect((await loadCcConfig({ env, getParameter: async () => JSON.stringify({ ...ssmValue, prefix: 'cc/user_data' }) }))?.prefix).toBe(
            'cc/user_data',
        );
        resetCcConfigCache();
        expect((await loadCcConfig({ env: { ...full, CC_WORKSPACE_PREFIX: 'a/b-c_d.e' } }))?.prefix).toBe('a/b-c_d.e');
    });
});

describe('loadCcConfig webSearchGatewayArn', () => {
    beforeEach(() => resetCcConfigCache());
    const env = { CC_CONFIG_PARAM: PARAM };
    const GATEWAY = 'arn:aws:bedrock-agentcore:us-east-1:111111111111:gateway/brc-cc-ws-1a2b3c4d-abcdefghij';

    it('reads an optional gateway ARN from the SSM JSON', async () => {
        const getParameter = async () => JSON.stringify({ ...ssmValue, webSearchGatewayArn: GATEWAY });
        expect(await loadCcConfig({ env, getParameter })).toEqual({ ...ssmValue, webSearchGatewayArn: GATEWAY });
    });

    it('leaves it out, without a warning, when the SSM JSON has none', async () => {
        const spy = vi.spyOn(logger, 'warn').mockImplementation((() => logger) as any);
        const cfg = await loadCcConfig({ env, getParameter: async () => JSON.stringify(ssmValue) });
        expect(cfg).toEqual(ssmValue);
        expect(cfg).not.toHaveProperty('webSearchGatewayArn');
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });

    it('ignores a malformed gateway ARN with a warning and keeps the rest of the config', async () => {
        const BAD = [
            'not-an-arn',
            'arn:aws:bedrock-agentcore:us-east-1:111111111111:gateway/*',
            'arn:aws:bedrock-agentcore:us-east-1:111111111111:gateway/brc-?',
            'arn:aws:bedrock-agentcore:us-east-1:111111111111:gateway/${aws:username}',
            'arn:aws:bedrock-agentcore:us-east-1:111111111111:runtime/fake',
            'arn:aws:bedrock-agentcore:us-east-1:*:gateway/brc-cc-ws-1a2b3c4d-abcdefghij',
            `${GATEWAY}/extra`,
            42,
            {},
        ];
        const spy = vi.spyOn(logger, 'warn').mockImplementation((() => logger) as any);
        for (const webSearchGatewayArn of BAD) {
            resetCcConfigCache();
            spy.mockClear();
            const getParameter = async () => JSON.stringify({ ...ssmValue, webSearchGatewayArn });
            const cfg = await loadCcConfig({ env, getParameter });
            expect(cfg, String(webSearchGatewayArn)).toEqual(ssmValue);
            expect(cfg, String(webSearchGatewayArn)).not.toHaveProperty('webSearchGatewayArn');
            expect(spy, String(webSearchGatewayArn)).toHaveBeenCalledTimes(1);
            const msg = String(spy.mock.calls[0][0]);
            expect(msg).toContain('webSearchGatewayArn');
            if (typeof webSearchGatewayArn === 'string') expect(msg).not.toContain(webSearchGatewayArn); // names the field, not its value
        }
        spy.mockRestore();
    });
});

describe('cc identity', () => {
    it('pads the key id to 16 digits', () => {
        expect(ccUserId(42)).toBe('brc-key-0000000000000042');
    });
    it('session id is user id plus @workspace and long enough for AgentCore', () => {
        expect(ccSessionId(42)).toBe('brc-key-0000000000000042@workspace');
        expect(ccSessionId(42).length).toBeGreaterThanOrEqual(33);
    });
});

describe('loadCcConfig failure diagnostics', () => {
    beforeEach(() => resetCcConfigCache());
    const env = { CC_CONFIG_PARAM: PARAM };
    const warnings = () => (logger.warn as any).mock.calls.map((c: any[]) => String(c[0]));

    function spyWarn() {
        return vi.spyOn(logger, 'warn').mockImplementation((() => logger) as any);
    }

    it('logs the error name and http status for SDK errors, not the message', async () => {
        const spy = spyWarn();
        const err = Object.assign(new Error('secret-looking detail'), { name: 'AccessDeniedException', $metadata: { httpStatusCode: 400 } });
        expect(await loadCcConfig({ env, getParameter: async () => { throw err; } })).toBeNull();
        const out = warnings().join('\n');
        expect(out).toContain('AccessDeniedException');
        expect(out).toContain('400');
        expect(out).not.toContain('secret-looking detail');
        spy.mockRestore();
    });

    it('logs malformed JSON without echoing the value', async () => {
        const spy = spyWarn();
        const raw = '{"bucket": "leaky-bucket-value" oops';
        expect(await loadCcConfig({ env, getParameter: async () => raw })).toBeNull();
        const out = warnings().join('\n');
        expect(out).toContain('not valid JSON');
        expect(out).not.toContain('leaky-bucket-value');
        spy.mockRestore();
    });

    it('names the missing SSM fields but not their siblings values', async () => {
        const spy = spyWarn();
        const raw = JSON.stringify({ runtimeArn: RUNTIME, workspaceRoleArn: ROLE, bucket: '', prefix: 'p' });
        expect(await loadCcConfig({ env, getParameter: async () => raw })).toBeNull();
        const out = warnings().join('\n');
        expect(out).toContain('bucket');
        expect(out).not.toContain(raw);
        expect(out).not.toContain(RUNTIME);
        expect(out).not.toContain(ROLE);
        spy.mockRestore();
    });

    it('names the missing direct env vars without logging env values', async () => {
        const spy = spyWarn();
        expect(await loadCcConfig({ env: { CC_RUNTIME_ARN: RUNTIME } })).toBeNull();
        const out = warnings().join('\n');
        expect(out).toContain('CC_WORKSPACE_ROLE_ARN');
        expect(out).toContain('CC_WORKSPACE_BUCKET');
        expect(out).not.toContain(RUNTIME);
        spy.mockRestore();
    });
});
