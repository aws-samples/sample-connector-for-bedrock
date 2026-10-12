import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import BedrockConverse from '../src/providers/bedrock_converse';

// Fake values only. The stub request handler records the Authorization header and stops the
// request, so nothing leaves the process.
const bearerModel = (key: string) => ({
    config: { modelId: 'anthropic.claude-test', regions: ['us-east-1'], bearerToken: key },
});
const akskModel = (...accessKeyIds: string[]) => ({
    config: {
        modelId: 'anthropic.claude-test',
        regions: ['us-east-1'],
        credentials: accessKeyIds.map((accessKeyId) => ({ accessKeyId, secretAccessKey: 'fake-secret' })),
    },
});
const noAuthModel = { config: { modelId: 'anthropic.claude-test', regions: ['us-east-1'] } };

// Keep the SDK's default credential chain away from the developer's real AWS setup. If code
// under test falls through to that chain, it signs as 'fake-host-ak' instead of a real identity.
const HERMETIC_ENV: Record<string, string | undefined> = {
    AWS_PROFILE: undefined,
    AWS_DEFAULT_PROFILE: undefined,
    AWS_SESSION_TOKEN: undefined,
    AWS_ROLE_ARN: undefined,
    AWS_WEB_IDENTITY_TOKEN_FILE: undefined,
    AWS_CONTAINER_CREDENTIALS_FULL_URI: undefined,
    AWS_CONTAINER_CREDENTIALS_RELATIVE_URI: undefined,
    AWS_AUTH_SCHEME_PREFERENCE: undefined,
    AWS_BEARER_TOKEN_BEDROCK: undefined,
    AWS_CONFIG_FILE: '/nonexistent/aws-config',
    AWS_SHARED_CREDENTIALS_FILE: '/nonexistent/aws-credentials',
    AWS_EC2_METADATA_DISABLED: 'true',
    AWS_ACCESS_KEY_ID: 'fake-host-ak',
    AWS_SECRET_ACCESS_KEY: 'fake-host-secret',
    HTTPS_PROXY: undefined,
    HTTP_PROXY: undefined,
};

async function initProvider(modelData: any, excludeAccessKeyId?: string): Promise<any> {
    const provider: any = new BedrockConverse();
    provider.setModelData(modelData);
    // The retry path sets this to the key of the attempt that just failed.
    if (excludeAccessKeyId) provider.excludeAccessKeyId = excludeAccessKeyId;
    await provider.init();
    return provider;
}

// Returns the Authorization header the provider's client sends for one Converse call.
async function authHeaderOf(provider: any): Promise<string> {
    let header = '';
    provider.client.config.requestHandler = {
        handle: async (request: any) => {
            header = request.headers.authorization ?? request.headers.Authorization ?? '';
            throw new Error('stop before network');
        },
    };
    await provider.client
        .send(new ConverseCommand({ modelId: 'm', messages: [{ role: 'user', content: [{ text: 'hi' }] }] }))
        .catch(() => undefined);
    return header;
}

// 'sigv4:<access key id>' or 'bearer:<token>', so a mismatch shows which identity was used.
function signedAs(header: string): string {
    const sigv4 = /^AWS4-HMAC-SHA256 Credential=([^/]+)\//.exec(header);
    if (sigv4) return `sigv4:${sigv4[1]}`;
    if (header.startsWith('Bearer ')) return `bearer:${header.slice('Bearer '.length)}`;
    return `unknown:${header}`;
}

describe('bedrock-converse outbound auth is scoped to each model', () => {
    beforeEach(() => {
        for (const [name, value] of Object.entries(HERMETIC_ENV)) vi.stubEnv(name, value);
    });

    it('initialising a bearer-token model leaves AWS_BEARER_TOKEN_BEDROCK unset', async () => {
        await initProvider(bearerModel('fake-key-A'));
        expect(process.env.AWS_BEARER_TOKEN_BEDROCK).toBeUndefined();
    });

    it('an AK/SK model keeps SigV4 after a bearer-token model was initialised', async () => {
        await initProvider(bearerModel('fake-key-A'));
        const aksk = await initProvider(akskModel('test-access-key-id'));
        expect(signedAs(await authHeaderOf(aksk))).toBe('sigv4:test-access-key-id');
    });

    it('two bearer-token models each send their own key', async () => {
        const a = await initProvider(bearerModel('fake-key-A'));
        const b = await initProvider(bearerModel('fake-key-B'));
        expect(signedAs(await authHeaderOf(a))).toBe('bearer:fake-key-A');
        expect(signedAs(await authHeaderOf(b))).toBe('bearer:fake-key-B');
    });

    it('an AK/SK model ignores an ambient AWS_BEARER_TOKEN_BEDROCK', async () => {
        vi.stubEnv('AWS_BEARER_TOKEN_BEDROCK', 'fake-operator-key');
        const aksk = await initProvider(akskModel('test-access-key-id'));
        expect(signedAs(await authHeaderOf(aksk))).toBe('sigv4:test-access-key-id');
    });

    it('a single-key AK/SK model keeps its own key on retry', async () => {
        const aksk = await initProvider(akskModel('test-access-key-id'), 'test-access-key-id');
        expect(signedAs(await authHeaderOf(aksk))).toBe('sigv4:test-access-key-id');
    });

    it('a two-key AK/SK model moves to the other key on retry', async () => {
        const aksk = await initProvider(akskModel('test-key-one', 'test-key-two'), 'test-key-one');
        expect(signedAs(await authHeaderOf(aksk))).toBe('sigv4:test-key-two');
    });

    it('a model with neither a key nor credentials uses an ambient AWS_BEARER_TOKEN_BEDROCK', async () => {
        vi.stubEnv('AWS_BEARER_TOKEN_BEDROCK', 'fake-operator-key');
        const plain = await initProvider(noAuthModel);
        expect(signedAs(await authHeaderOf(plain))).toBe('bearer:fake-operator-key');
    });
});
