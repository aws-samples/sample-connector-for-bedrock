import { describe, it, expect, afterEach, vi } from 'vitest';
import { secretPassword, secretRegion } from '../src/util/db_password';

const ARN = 'arn:aws:secretsmanager:us-west-2:111122223333:secret:brc-pg-AbCdEf';

function fakeClient(...replies: Array<{ SecretString?: string } | Error>) {
    const calls: any[] = [];
    return {
        calls,
        send: async (command: any) => {
            calls.push(command.input);
            const reply = replies[Math.min(calls.length - 1, replies.length - 1)];
            if (reply instanceof Error) throw reply;
            return reply;
        },
    };
}

describe('database password from Secrets Manager', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.resetModules();
    });

    it('reads the secret once and gives every connection the same password', async () => {
        const client = fakeClient({ SecretString: 'pw-from-secret' });
        const password = secretPassword(ARN, client);
        expect(await password()).toBe('pw-from-secret');
        expect(await password()).toBe('pw-from-secret');
        expect(client.calls).toEqual([{ SecretId: ARN }]);
    });

    it('asks again after a failed read', async () => {
        const client = fakeClient(new Error('throttled'), { SecretString: 'pw-from-secret' });
        const password = secretPassword(ARN, client);
        await expect(password()).rejects.toThrow('throttled');
        expect(await password()).toBe('pw-from-secret');
        expect(client.calls).toHaveLength(2);
    });

    it('refuses a secret without a string value', async () => {
        const password = secretPassword(ARN, fakeClient({}));
        await expect(password()).rejects.toThrow('SecretString');
    });

    it('calls the Region of the secret', () => {
        expect(secretRegion(ARN)).toBe('us-west-2');
        expect(secretRegion('brc-pg')).toBeUndefined();
    });

    it('uses the secret when PGSQL_PASSWORD_SECRET_ARN is set', async () => {
        vi.stubEnv('PGSQL_PASSWORD_SECRET_ARN', ARN);
        vi.stubEnv('PGSQL_PASSWORD', 'ignored');
        const config = (await import('../src/config')).default;
        expect(typeof config.pgsql.password).toBe('function');
    });

    it('uses PGSQL_PASSWORD as before when no secret is set', async () => {
        vi.stubEnv('PGSQL_PASSWORD_SECRET_ARN', '');
        vi.stubEnv('PGSQL_PASSWORD', 'pw-from-env');
        const config = (await import('../src/config')).default;
        expect(config.pgsql.password).toBe('pw-from-env');
    });
});
