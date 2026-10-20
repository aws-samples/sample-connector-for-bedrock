import { describe, it, expect, vi } from 'vitest';
import {
    buildSessionPolicy,
    getWorkspaceCredentials,
    type WorkspaceCredentials,
} from '../src/claude_code_web/workspace_credentials';
import type { CcConfig } from '../src/claude_code_web/config';

// Fake values only.
const config: CcConfig = {
    runtimeArn: 'arn:aws:bedrock-agentcore:us-east-1:111111111111:runtime/fake',
    workspaceRoleArn: 'arn:aws:iam::111111111111:role/fake-workspace',
    bucket: 'fake-bucket',
    prefix: 'user_data',
};

const T0 = new Date('2026-01-01T00:00:00Z');
const minutes = (n: number) => new Date(T0.getTime() + n * 60_000);

function fakeAssume(lifetimeMin = 60) {
    return vi.fn(async (input: { roleSessionName: string }): Promise<WorkspaceCredentials> => ({
        accessKeyId: `AKIAFAKE-${input.roleSessionName}`,
        secretAccessKey: 'fake-secret',
        sessionToken: 'fake-token',
        expiration: minutes(lifetimeMin),
    }));
}

describe('buildSessionPolicy', () => {
    it('scopes object access and listing to the user prefix', () => {
        expect(JSON.parse(buildSessionPolicy(config, 'brc-key-0000000000000001'))).toEqual({
            Version: '2012-10-17',
            Statement: [
                {
                    Effect: 'Allow',
                    Action: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject', 's3:AbortMultipartUpload'],
                    Resource: 'arn:aws:s3:::fake-bucket/user_data/brc-key-0000000000000001/*',
                },
                {
                    Effect: 'Allow',
                    Action: 's3:ListBucket',
                    Resource: 'arn:aws:s3:::fake-bucket',
                    Condition: {
                        StringLike: {
                            's3:prefix': ['user_data/brc-key-0000000000000001/*', 'user_data/brc-key-0000000000000001'],
                        },
                    },
                },
            ],
        });
    });

    it('takes the partition from the role ARN', () => {
        const p = buildSessionPolicy({ ...config, workspaceRoleArn: 'arn:aws-cn:iam::1:role/r' }, 'u');
        expect(JSON.parse(p).Statement[0].Resource).toBe('arn:aws-cn:s3:::fake-bucket/user_data/u/*');
    });
});

describe('getWorkspaceCredentials', () => {
    it('assumes the role with the per-key session name, policy and 1h duration', async () => {
        const assumeRole = fakeAssume();
        await getWorkspaceCredentials(config, 7, { assumeRole, now: () => T0 });
        expect(assumeRole).toHaveBeenCalledWith({
            roleArn: config.workspaceRoleArn,
            roleSessionName: 'brc-cc-7',
            durationSeconds: 3600,
            policy: buildSessionPolicy(config, 'brc-key-0000000000000007'),
        });
    });

    it('calls assumeRole once per key while the credentials are valid', async () => {
        const assumeRole = fakeAssume();
        const a = await getWorkspaceCredentials(config, 1, { assumeRole, now: () => T0 });
        const b = await getWorkspaceCredentials(config, 1, { assumeRole, now: () => minutes(30) });
        expect(assumeRole).toHaveBeenCalledTimes(1);
        expect(b).toEqual(a);
    });

    it('refreshes when fewer than 15 minutes remain', async () => {
        const assumeRole = fakeAssume();
        await getWorkspaceCredentials(config, 3, { assumeRole, now: () => T0 });
        await getWorkspaceCredentials(config, 3, { assumeRole, now: () => minutes(46) }); // 14 min left
        expect(assumeRole).toHaveBeenCalledTimes(2);
    });

    it('does not refresh with 16 minutes left', async () => {
        const assumeRole = fakeAssume();
        await getWorkspaceCredentials(config, 4, { assumeRole, now: () => T0 });
        await getWorkspaceCredentials(config, 4, { assumeRole, now: () => minutes(44) });
        expect(assumeRole).toHaveBeenCalledTimes(1);
    });

    it('keeps concurrent keys apart', async () => {
        const assumeRole = vi.fn(async (input: { roleSessionName: string; policy: string }) => {
            // Yield so both calls are in flight at once.
            await new Promise((r) => setTimeout(r, 5));
            return {
                accessKeyId: input.roleSessionName,
                secretAccessKey: 'fake-secret',
                sessionToken: input.policy,
                expiration: minutes(60),
            };
        });
        const [c1, c2] = await Promise.all([
            getWorkspaceCredentials(config, 101, { assumeRole, now: () => T0 }),
            getWorkspaceCredentials(config, 102, { assumeRole, now: () => T0 }),
        ]);
        expect(c1.accessKeyId).toBe('brc-cc-101');
        expect(c2.accessKeyId).toBe('brc-cc-102');
        expect(c1.sessionToken).toContain('brc-key-0000000000000101/*');
        expect(c1.sessionToken).not.toContain('0000000000000102');
        expect(c2.sessionToken).toContain('brc-key-0000000000000102/*');
        expect(c2.sessionToken).not.toContain('0000000000000101');
    });

    it('shares one in-flight request for the same key', async () => {
        const assumeRole = fakeAssume();
        await Promise.all([
            getWorkspaceCredentials(config, 201, { assumeRole, now: () => T0 }),
            getWorkspaceCredentials(config, 201, { assumeRole, now: () => T0 }),
        ]);
        expect(assumeRole).toHaveBeenCalledTimes(1);
    });
});
