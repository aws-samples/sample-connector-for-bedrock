import { describe, it, expect, beforeEach, vi } from 'vitest';
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
