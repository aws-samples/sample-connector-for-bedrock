import logger from '../util/logger';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

export type CcConfig = { runtimeArn: string; workspaceRoleArn: string; bucket: string; prefix: string };

type Deps = { env?: NodeJS.ProcessEnv; getParameter?: (arn: string) => Promise<string>; now?: () => number };

// A failure is cached for a short while only: BRConnector may start before the SSM parameter exists, and a
// long-cached failure would keep the feature off until restart. The short window stops a misconfigured deploy
// from reading SSM and warning on every request.
const FAILURE_TTL_MS = 30 * 1000;

let cached: CcConfig | null = null;
let failedUntil = 0;

export function resetCcConfigCache(): void {
    cached = null;
    failedUntil = 0;
}

// GetParameter accepts the full ARN as Name; the region comes from the ARN, credentials from the default chain.
async function defaultGetParameter(arn: string): Promise<string> {
    const region = arn.split(':')[3];
    const client = new SSMClient({ region });
    const out = await client.send(new GetParameterCommand({ Name: arn, WithDecryption: true }));
    return out.Parameter?.Value ?? '';
}

function nonEmpty(v: unknown): v is string {
    return typeof v === 'string' && v.length > 0;
}

// The prefix goes into the session policy's S3 resource and s3:prefix condition, where * ? are wildcards and
// ${...} is a policy variable; an edge slash would change the user path.
function validPrefix(v: unknown): v is string {
    return nonEmpty(v) && !/[*?${}]/.test(v) && !v.startsWith('/') && !v.endsWith('/');
}

export async function loadCcConfig(deps: Deps = {}): Promise<CcConfig | null> {
    if (cached) return cached;
    const now = deps.now ?? Date.now;
    if (now() < failedUntil) return null;
    const env = deps.env ?? process.env;
    if (!env.CC_RUNTIME_ARN && !env.CC_CONFIG_PARAM) return null; // not configured: not a failure

    const config = await readConfig(env, deps);
    if (config) cached = config;
    else failedUntil = now() + FAILURE_TTL_MS;
    return config;
}

async function readConfig(env: NodeJS.ProcessEnv, deps: Deps): Promise<CcConfig | null> {
    if (env.CC_RUNTIME_ARN) {
        const { CC_RUNTIME_ARN: runtimeArn, CC_WORKSPACE_ROLE_ARN: workspaceRoleArn, CC_WORKSPACE_BUCKET: bucket } = env;
        const missing = [
            ['CC_WORKSPACE_ROLE_ARN', workspaceRoleArn],
            ['CC_WORKSPACE_BUCKET', bucket],
        ]
            .filter(([, v]) => !nonEmpty(v))
            .map(([k]) => k);
        if (missing.length > 0 || !nonEmpty(workspaceRoleArn) || !nonEmpty(bucket)) {
            logger.warn(`claude-code-web disabled: direct env config is incomplete, missing ${missing.join(', ')}`);
            return null;
        }
        const prefix = env.CC_WORKSPACE_PREFIX || 'user_data';
        if (!validPrefix(prefix)) {
            logger.warn('claude-code-web disabled: CC_WORKSPACE_PREFIX is invalid (no * ? $ { }, no leading or trailing /)');
            return null;
        }
        return { runtimeArn, workspaceRoleArn, bucket, prefix };
    }

    const paramArn = env.CC_CONFIG_PARAM as string;
    try {
        const raw = await (deps.getParameter ?? defaultGetParameter)(paramArn);
        let v: any;
        try {
            v = JSON.parse(raw);
        } catch {
            // Do not log the parse error: its message can quote part of the input.
            logger.warn('claude-code-web disabled: CC_CONFIG_PARAM value is not valid JSON');
            return null;
        }
        const bad = ['runtimeArn', 'workspaceRoleArn', 'bucket'].filter((k) => !nonEmpty(v?.[k]));
        if (!validPrefix(v?.prefix)) bad.push('prefix');
        if (bad.length > 0) {
            logger.warn(`claude-code-web disabled: SSM config has missing or invalid fields: ${bad.join(', ')}`);
            return null;
        }
        return { runtimeArn: v.runtimeArn, workspaceRoleArn: v.workspaceRoleArn, bucket: v.bucket, prefix: v.prefix };
    } catch (err: any) {
        // Name and HTTP status only; the message may carry request details.
        logger.warn(
            `claude-code-web disabled: reading CC_CONFIG_PARAM failed: ${err?.name ?? 'Error'} (http ${err?.$metadata?.httpStatusCode ?? 'n/a'})`,
        );
        return null;
    }
}
