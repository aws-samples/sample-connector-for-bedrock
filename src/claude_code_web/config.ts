import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

export type CcConfig = { runtimeArn: string; workspaceRoleArn: string; bucket: string; prefix: string };

type Deps = { env?: NodeJS.ProcessEnv; getParameter?: (arn: string) => Promise<string> };

// Only successes are cached: BRConnector may start before the SSM parameter exists, and a
// cached failure would keep the feature off until restart.
let cached: CcConfig | null = null;

export function resetCcConfigCache(): void {
    cached = null;
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

export async function loadCcConfig(deps: Deps = {}): Promise<CcConfig | null> {
    if (cached) return cached;
    const env = deps.env ?? process.env;

    if (env.CC_RUNTIME_ARN) {
        const { CC_RUNTIME_ARN: runtimeArn, CC_WORKSPACE_ROLE_ARN: workspaceRoleArn, CC_WORKSPACE_BUCKET: bucket } = env;
        if (!nonEmpty(workspaceRoleArn) || !nonEmpty(bucket)) return null;
        cached = { runtimeArn, workspaceRoleArn, bucket, prefix: env.CC_WORKSPACE_PREFIX || 'user_data' };
        return cached;
    }

    const paramArn = env.CC_CONFIG_PARAM;
    if (!paramArn) return null;
    try {
        const raw = await (deps.getParameter ?? defaultGetParameter)(paramArn);
        const v = JSON.parse(raw);
        if (![v?.runtimeArn, v?.workspaceRoleArn, v?.bucket, v?.prefix].every(nonEmpty)) return null;
        cached = { runtimeArn: v.runtimeArn, workspaceRoleArn: v.workspaceRoleArn, bucket: v.bucket, prefix: v.prefix };
        return cached;
    } catch {
        return null;
    }
}
