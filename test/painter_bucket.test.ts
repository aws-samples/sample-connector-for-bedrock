import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import logger from '../src/util/logger';
import { pictureBucket, resetStackSettings } from '../src/providers/painter_bucket';

const INSTANCE = 'i-0123456789abcdef0';
const PARAMETER = `/brconnector/instance/${INSTANCE}/painter`;
const TOKEN_URL = 'http://169.254.169.254/latest/api/token';
const INSTANCE_ID_URL = 'http://169.254.169.254/latest/meta-data/instance-id';
const STACK = { PAINTER_S3_BUCKET: 'stack-bucket', PAINTER_S3_REGION: 'us-east-1', PAINTER_S3_PREFIX: 'painter' };
const NO_BUCKET = /no S3 bucket for pictures.*s3Bucket and s3Region in this model's config.*EnablePainter/s;

function fakeImds(token: 'works' | 'fails' | 'hangs' = 'works') {
    const calls: { method: string; url: string; headers: Record<string, string> }[] = [];
    const fetch = vi.fn(async (url: string, init: any = {}) => {
        const method = init.method ?? 'GET';
        calls.push({ method, url, headers: { ...init.headers } });
        if (url === TOKEN_URL && method === 'PUT') {
            if (token === 'fails') throw new TypeError('fetch failed');
            if (token === 'hangs') return new Promise<Response>((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)));
            return new Response('the-token');
        }
        if (url === INSTANCE_ID_URL && method === 'GET') {
            if (token === 'works' && init.headers?.['X-aws-ec2-metadata-token'] !== 'the-token') return new Response('', { status: 401 });
            return new Response(INSTANCE);
        }
        return new Response('', { status: 404 });
    });
    return { fetch, calls };
}

const parameterHolding = (value: unknown = JSON.stringify({ ...STACK, PAINTER_S3_REGION: 'us-west-2' })) =>
    vi.fn(async (_name: string, _region: string | undefined) => value as string);

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
    resetStackSettings();
    warn = vi.spyOn(logger, 'warn').mockImplementation((() => logger) as any);
});
afterEach(() => vi.restoreAllMocks());

describe('the painter picture bucket', () => {
    it('takes all three from the model config, without a slash at the end of the prefix, and asks the instance nothing', async () => {
        const imds = fakeImds();
        const getParameter = parameterHolding();
        const config = { s3Bucket: 'mine', s3Region: 'eu-west-1', s3Prefix: 'out/' };
        expect(await pictureBucket(config, { env: {}, fetch: imds.fetch, getParameter })).toEqual({ bucket: 'mine', region: 'eu-west-1', prefix: 'out' });
        expect(imds.fetch).not.toHaveBeenCalled();
        expect(getParameter).not.toHaveBeenCalled();
    });

    it('takes all three from the stack environment when the model config has no bucket', async () => {
        const imds = fakeImds();
        expect(await pictureBucket({}, { env: STACK, fetch: imds.fetch })).toEqual({ bucket: 'stack-bucket', region: 'us-east-1', prefix: 'painter' });
        expect(imds.fetch).not.toHaveBeenCalled();
    });

    it('leaves the prefix empty when the stack sets none', async () => {
        const { PAINTER_S3_PREFIX, ...noPrefix } = STACK;
        expect(await pictureBucket({}, { env: noPrefix })).toEqual({ bucket: 'stack-bucket', region: 'us-east-1', prefix: '' });
    });

    it('lets a config bucket decide all three, so a config without s3Prefix gets no prefix from the stack', async () => {
        const config = { s3Bucket: 'mine', s3Region: 'eu-west-1' };
        expect(await pictureBucket(config, { env: STACK })).toEqual({ bucket: 'mine', region: 'eu-west-1', prefix: '' });
    });

    it('asks for s3Region when the config names a bucket without one, even when the stack has a Region', async () => {
        await expect(pictureBucket({ s3Bucket: 'mine' }, { env: STACK })).rejects.toThrow("You must specify the parameter 's3Region'.");
    });

    it('asks for PAINTER_S3_REGION when the stack names a bucket without one', async () => {
        const { PAINTER_S3_REGION, ...noRegion } = STACK;
        await expect(pictureBucket({}, { env: noRegion })).rejects.toThrow(/PAINTER_S3_REGION/);
    });

    it('names both fixes when neither the config nor the stack has a bucket', async () => {
        await expect(pictureBucket({}, { env: { AWS_EC2_METADATA_DISABLED: 'true' } })).rejects.toThrow(NO_BUCKET);
    });
});

describe('the painter stack settings on EC2', () => {
    it('reads the instance parameter with an IMDSv2 token when the environment has no bucket', async () => {
        const imds = fakeImds();
        const getParameter = parameterHolding();
        expect(await pictureBucket({}, { env: { AWS_REGION: 'us-west-2' }, fetch: imds.fetch, getParameter }))
            .toEqual({ bucket: 'stack-bucket', region: 'us-west-2', prefix: 'painter' });
        expect(imds.calls.map((c) => [c.method, c.url])).toEqual([['PUT', TOKEN_URL], ['GET', INSTANCE_ID_URL]]);
        expect(Number(imds.calls[0].headers['X-aws-ec2-metadata-token-ttl-seconds'])).toBeGreaterThan(0);
        expect(getParameter).toHaveBeenCalledWith(PARAMETER, 'us-west-2');
    });

    it('falls back to a plain GET when the token call fails, and reads the parameter in AWS_DEFAULT_REGION', async () => {
        const imds = fakeImds('fails');
        const getParameter = parameterHolding();
        expect((await pictureBucket({}, { env: { AWS_DEFAULT_REGION: 'ap-northeast-1' }, fetch: imds.fetch, getParameter })).bucket).toBe('stack-bucket');
        expect(imds.calls.at(-1)).toEqual({ method: 'GET', url: INSTANCE_ID_URL, headers: {} });
        expect(getParameter).toHaveBeenCalledWith(PARAMETER, 'ap-northeast-1');
    });

    it('gives up on a token call after 1 second and uses the plain GET', async () => {
        const imds = fakeImds('hangs');
        const started = Date.now();
        expect((await pictureBucket({}, { env: {}, fetch: imds.fetch, getParameter: parameterHolding() })).bucket).toBe('stack-bucket');
        expect(Date.now() - started).toBeGreaterThanOrEqual(900);
        expect(Date.now() - started).toBeLessThan(3000);
    });

    it.each([
        ['Lambda', { AWS_LAMBDA_FUNCTION_NAME: 'brconnector' }],
        ['ECS', { ECS_CONTAINER_METADATA_URI_V4: 'http://169.254.170.2/v4/abc' }],
        ['a host with AWS_EC2_METADATA_DISABLED', { AWS_EC2_METADATA_DISABLED: 'true' }],
    ])('does not ask the instance metadata service on %s', async (_where, env) => {
        const imds = fakeImds();
        const getParameter = parameterHolding();
        await expect(pictureBucket({}, { env, fetch: imds.fetch, getParameter })).rejects.toThrow(NO_BUCKET);
        expect(imds.fetch).not.toHaveBeenCalled();
        expect(getParameter).not.toHaveBeenCalled();
    });

    it('keeps a parameter it read for every concurrent and later request', async () => {
        const imds = fakeImds();
        const getParameter = parameterHolding();
        const deps = { env: {}, fetch: imds.fetch, getParameter };
        const [a, b] = await Promise.all([pictureBucket({}, deps), pictureBucket({}, deps)]);
        const c = await pictureBucket({}, deps);
        expect([a.bucket, b.bucket, c.bucket]).toEqual(['stack-bucket', 'stack-bucket', 'stack-bucket']);
        expect(getParameter).toHaveBeenCalledTimes(1);
        expect(imds.calls).toHaveLength(2);
    });

    it('does not keep a failure: the next request reads the parameter again', async () => {
        const imds = fakeImds();
        const missing = Object.assign(new Error('Parameter not found'), { name: 'ParameterNotFound' });
        const getParameter = vi.fn<(name: string, region: string | undefined) => Promise<string>>()
            .mockRejectedValueOnce(missing)
            .mockResolvedValue(JSON.stringify(STACK));
        const deps = { env: {}, fetch: imds.fetch, getParameter };
        await expect(pictureBucket({}, deps)).rejects.toThrow(NO_BUCKET);
        expect((await pictureBucket({}, deps)).bucket).toBe('stack-bucket');
        expect(getParameter).toHaveBeenCalledTimes(2);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0][0])).toContain('ParameterNotFound');
    });

    it.each([
        ['not JSON', 'not json'],
        ['JSON without a bucket', JSON.stringify({ PAINTER_S3_REGION: 'us-west-2' })],
        ['a JSON string', JSON.stringify('stack-bucket')],
    ])('takes a parameter that is %s as no stack settings, with one warning and no stack trace', async (_what, value) => {
        const deps = { env: {}, fetch: fakeImds().fetch, getParameter: parameterHolding(value) };
        await expect(pictureBucket({}, deps)).rejects.toThrow(NO_BUCKET);
        expect(warn).toHaveBeenCalledTimes(1);
        const [message, ...rest] = warn.mock.calls[0];
        expect(rest).toEqual([]);
        expect(message).toEqual(expect.stringContaining(PARAMETER));
        expect(message).not.toMatch(/\n/);
        await expect(pictureBucket({}, deps)).rejects.toThrow(NO_BUCKET);
        expect(deps.getParameter).toHaveBeenCalledTimes(2);
    });
});
