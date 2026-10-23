// Fetches a caller-supplied image URL. Only http(s) URLs on public addresses are fetched: literal addresses are
// checked before connecting, host names when the connection is made, and every redirect hop again.
import net from 'node:net';
import dns from 'node:dns';
import { Agent, fetch as undiciFetch } from 'undici';
import { withAnthropicType } from './anthropic_error';

export const PUBLIC_FETCH_LIMITS = { maxBytes: 10 * 1024 * 1024, timeoutMs: 15000, maxRedirects: 3 };

export const IMAGE_URL_NOT_ALLOWED = 'Image URL is not allowed: use an http(s) URL on a public address, or a data: URL.';

export type PublicFetchOptions = {
    resolve?: (host: string) => Promise<string[]>;
    isAllowedAddress?: (ip: string) => boolean;
    maxBytes?: number;
    timeoutMs?: number;
    maxRedirects?: number;
};

const NOT_PUBLIC_V4: Array<[string, number]> = [
    ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
    ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
    ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
];
// 64:ff9b::/96 and 64:ff9b:1::/48 are NAT64 prefixes, which a DNS64/NAT64 network translates to IPv4 addresses.
const NOT_PUBLIC_V6: Array<[string, number]> = [
    ['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['2001:db8::', 32],
    ['64:ff9b::', 96], ['64:ff9b:1::', 48],
];

const notPublic = new net.BlockList();
for (const [address, prefix] of NOT_PUBLIC_V4) {
    notPublic.addSubnet(address, prefix, 'ipv4');
    notPublic.addSubnet(`::ffff:${address}`, 96 + prefix, 'ipv6');
}
for (const [address, prefix] of NOT_PUBLIC_V6) {
    notPublic.addSubnet(address, prefix, 'ipv6');
}

export function isPublicAddress(ip: string): boolean {
    const family = net.isIP(ip);
    // A zone index (fe80::1%eth0) is only used with link-local addresses.
    if (family === 0 || ip.includes('%')) {
        return false;
    }
    return !notPublic.check(ip, family === 6 ? 'ipv6' : 'ipv4');
}

export type ImageUrlRejection = 'scheme' | 'address' | 'redirects' | 'status' | 'content-type' | 'size' | 'timeout' | 'network';

// Every rejection answers with the same message; reason is for logs and tests and is not sent to the client.
export class ImageUrlNotAllowedError extends Error {
    statusCode = 400;
    reason: ImageUrlRejection;

    constructor(reason: ImageUrlRejection) {
        super(IMAGE_URL_NOT_ALLOWED);
        this.reason = reason;
        withAnthropicType(this, 'invalid_request_error');
    }
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

async function systemResolve(host: string): Promise<string[]> {
    const records = await dns.promises.lookup(host, { all: true });
    return records.map((record) => record.address);
}

function familyOf(family: number | string | undefined): number {
    if (family === 4 || family === 'IPv4') return 4;
    if (family === 6 || family === 'IPv6') return 6;
    return 0;
}

// The connect-time lookup: it answers with allowed addresses only, so a name cannot lead to any other address.
function allowedLookup(resolve: (host: string) => Promise<string[]>, isAllowed: (ip: string) => boolean): net.LookupFunction {
    return (hostname, options, callback) => {
        resolve(hostname).then((addresses) => {
            const wanted = familyOf(options.family);
            const allowed = addresses.filter((address) => {
                const family = net.isIP(address);
                return family !== 0 && (wanted === 0 || family === wanted) && isAllowed(address);
            });
            if (allowed.length === 0) {
                callback(new ImageUrlNotAllowedError('address'), undefined);
                return;
            }
            const entries = allowed.map((address) => ({ address, family: net.isIP(address) }));
            if (options.all) {
                callback(null, entries);
            } else {
                callback(null, entries[0].address, entries[0].family);
            }
        }, (error) => callback(error, undefined));
    };
}

function httpUrl(raw: string, base?: URL): URL {
    let url: URL;
    try {
        url = new URL(raw, base);
    } catch {
        throw new ImageUrlNotAllowedError('scheme');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new ImageUrlNotAllowedError('scheme');
    }
    return url;
}

function literalAddress(url: URL): string | undefined {
    const host = url.hostname.startsWith('[') ? url.hostname.slice(1, -1) : url.hostname;
    return net.isIP(host) ? host : undefined;
}

async function readAtMost(body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<Buffer> {
    const chunks: Buffer[] = [];
    let size = 0;
    if (!body) {
        return Buffer.alloc(0);
    }
    const reader = body.getReader();
    for (;;) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }
        size += value.byteLength;
        if (size > maxBytes) {
            await reader.cancel().catch(() => undefined);
            throw new ImageUrlNotAllowedError('size');
        }
        chunks.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
    }
    return Buffer.concat(chunks, size);
}

function rejectionIn(error: any): ImageUrlNotAllowedError | undefined {
    for (let current = error, depth = 0; current && depth < 5; current = current.cause, depth++) {
        if (current instanceof ImageUrlNotAllowedError) {
            return current;
        }
    }
    return undefined;
}

export async function fetchPublicImage(url: string, opts: PublicFetchOptions = {}): Promise<{ bytes: Buffer; contentType: string }> {
    const isAllowed = opts.isAllowedAddress ?? isPublicAddress;
    const maxBytes = opts.maxBytes ?? PUBLIC_FETCH_LIMITS.maxBytes;
    const maxRedirects = opts.maxRedirects ?? PUBLIC_FETCH_LIMITS.maxRedirects;
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), opts.timeoutMs ?? PUBLIC_FETCH_LIMITS.timeoutMs);
    // Its own dispatcher, so neither a proxy nor the global dispatcher takes part in the connection.
    const dispatcher = new Agent({ connect: { lookup: allowedLookup(opts.resolve ?? systemResolve, isAllowed) } });
    try {
        let target = httpUrl(url);
        for (let redirects = 0; ; redirects++) {
            const literal = literalAddress(target);
            if (literal !== undefined && !isAllowed(literal)) {
                throw new ImageUrlNotAllowedError('address');
            }
            const response = await undiciFetch(target, {
                redirect: 'manual',
                dispatcher,
                signal: timeout.signal,
            });
            if (REDIRECT_STATUSES.has(response.status)) {
                await response.body?.cancel().catch(() => undefined);
                const location = response.headers.get('location');
                if (redirects >= maxRedirects || !location) {
                    throw new ImageUrlNotAllowedError('redirects');
                }
                target = httpUrl(location, target);
                continue;
            }
            const contentType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
            const rejection: ImageUrlRejection | undefined = !response.ok ? 'status'
                : !contentType.startsWith('image/') ? 'content-type'
                : Number(response.headers.get('content-length')) > maxBytes ? 'size'
                : undefined;
            if (rejection) {
                await response.body?.cancel().catch(() => undefined);
                throw new ImageUrlNotAllowedError(rejection);
            }
            return { bytes: await readAtMost(response.body as ReadableStream<Uint8Array> | null, maxBytes), contentType };
        }
    } catch (error) {
        const rejection = rejectionIn(error);
        if (rejection) {
            throw rejection;
        }
        throw new ImageUrlNotAllowedError(timeout.signal.aborted ? 'timeout' : 'network');
    } finally {
        clearTimeout(timer);
        dispatcher.destroy().catch(() => undefined);
    }
}
