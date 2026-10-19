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
        expect(
            await loadCcConfig({ env: { CC_CONFIG_PARAM: PARAM }, getParameter: async () => JSON.stringify({ ...ssmValue, prefix: '' }) }),
        ).toBeNull();
    });

    it('returns null for non-JSON SSM values', async () => {
        expect(await loadCcConfig({ env: { CC_CONFIG_PARAM: PARAM }, getParameter: async () => 'not json' })).toBeNull();
    });

    it('does not cache a failure: first getParameter throws, second succeeds', async () => {
        const getParameter = vi
            .fn<(arn: string) => Promise<string>>()
            .mockRejectedValueOnce(new Error('ParameterNotFound'))
            .mockResolvedValue(JSON.stringify(ssmValue));
        const env = { CC_CONFIG_PARAM: PARAM };
        expect(await loadCcConfig({ env, getParameter })).toBeNull();
        expect(await loadCcConfig({ env, getParameter })).toEqual(ssmValue);
        expect(getParameter).toHaveBeenCalledTimes(2);
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
