const DEFAULT_HOST = '0.0.0.0';
const DEFAULT_PORT = 8866;
const ENV_NAME = 'AWS_LAMBDA_HTTP_ENDPOINT';

/**
 * Parse the `host:port` the platform tells us to bind (AWS_LAMBDA_HTTP_ENDPOINT).
 * Unset means the classic server default.
 */
export function parseListenAddress(endpoint?: string): { host: string; port: number } {
    if (endpoint === undefined) return { host: DEFAULT_HOST, port: DEFAULT_PORT };
    const fail = () => new Error(`Invalid ${ENV_NAME} value: ${JSON.stringify(endpoint)} (expected host:port)`);
    endpoint = endpoint.trim();
    const idx = endpoint.lastIndexOf(':');
    if (idx <= 0) throw fail();
    let host = endpoint.slice(0, idx);
    const portText = endpoint.slice(idx + 1);
    if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
    if (!host || /[\/\s]/.test(host) || !/^\d+$/.test(portText)) throw fail();
    const port = Number(portText);
    if (port < 1 || port > 65535) throw fail();
    return { host, port };
}

/** Base URL for calling this server back; wildcard bind addresses map to loopback. */
export function selfBaseUrlFor(host: string, port: number): string {
    let h = host;
    if (h === '0.0.0.0') h = '127.0.0.1';
    else if (h === '::') h = '[::1]';
    else if (h.includes(':')) h = `[${h}]`;
    return `http://${h}:${port}`;
}

const rawEndpoint = process.env[ENV_NAME];
const parsed = parseListenAddress(rawEndpoint);
// Undefined when the platform supplied nothing: app.listen() must then get no host so Node
// keeps its dual-stack default (`::`, ipv6Only false) and existing deployments are unchanged.
export const listenHost: string | undefined = rawEndpoint === undefined ? undefined : parsed.host;
export const listenPort: number = parsed.port;
export const selfBaseUrl: string = selfBaseUrlFor(parsed.host, parsed.port);
