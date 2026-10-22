import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';
import type { CcConfig } from './config';
import { ccUserId } from './identity';

export type WorkspaceCredentials = {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken: string;
    expiration: Date;
};

type AssumeRoleInput = { roleArn: string; roleSessionName: string; durationSeconds: number; policy: string };

type Deps = {
    assumeRole?: (input: AssumeRoleInput) => Promise<WorkspaceCredentials>;
    now?: () => Date;
};

const REFRESH_BEFORE_MS = 15 * 60 * 1000;

// Session policy that narrows the workspace role to one user's S3 prefix and, when configured, the web
// search gateway.
export function buildSessionPolicy(config: CcConfig, userId: string): string {
    const partition = config.workspaceRoleArn.split(':')[1] || 'aws';
    const base = `${config.prefix}/${userId}`;
    const statements: object[] = [
        {
            Effect: 'Allow',
            Action: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject', 's3:AbortMultipartUpload'],
            Resource: `arn:${partition}:s3:::${config.bucket}/${base}/*`,
        },
        {
            Effect: 'Allow',
            Action: 's3:ListBucket',
            Resource: `arn:${partition}:s3:::${config.bucket}`,
            Condition: { StringLike: { 's3:prefix': [`${base}/*`, base] } },
        },
    ];
    if (config.webSearchGatewayArn) {
        statements.push({ Effect: 'Allow', Action: 'bedrock-agentcore:InvokeGateway', Resource: config.webSearchGatewayArn });
    }
    return JSON.stringify({ Version: '2012-10-17', Statement: statements });
}

async function defaultAssumeRole(input: AssumeRoleInput): Promise<WorkspaceCredentials> {
    // The role lives in the same partition; the region only selects the STS endpoint.
    const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
    const out = await new STSClient({ region }).send(
        new AssumeRoleCommand({
            RoleArn: input.roleArn,
            RoleSessionName: input.roleSessionName,
            DurationSeconds: input.durationSeconds,
            Policy: input.policy,
        }),
    );
    const c = out.Credentials;
    if (!c?.AccessKeyId || !c.SecretAccessKey || !c.SessionToken || !c.Expiration) {
        throw new Error('sts:AssumeRole returned no credentials');
    }
    return {
        accessKeyId: c.AccessKeyId,
        secretAccessKey: c.SecretAccessKey,
        sessionToken: c.SessionToken,
        expiration: c.Expiration,
    };
}

// Keyed by key id so one user's scoped credentials can never be served to another.
// The in-flight promise is cached too, so concurrent requests share one AssumeRole call.
const cache = new Map<number, Promise<WorkspaceCredentials>>();

export async function getWorkspaceCredentials(
    config: CcConfig,
    keyId: number,
    deps: Deps = {},
): Promise<WorkspaceCredentials> {
    const now = deps.now ?? (() => new Date());
    const hit = cache.get(keyId);
    if (hit) {
        try {
            const creds = await hit;
            if (creds.expiration.getTime() - now().getTime() >= REFRESH_BEFORE_MS) return creds;
        } catch {
            // Fall through and retry below.
        }
        // Only evict the entry we inspected; another caller may already have replaced it.
        if (cache.get(keyId) === hit) cache.delete(keyId);
        else return getWorkspaceCredentials(config, keyId, deps);
    }
    const p = (deps.assumeRole ?? defaultAssumeRole)({
        roleArn: config.workspaceRoleArn,
        roleSessionName: `brc-cc-${keyId}`,
        durationSeconds: 3600,
        policy: buildSessionPolicy(config, ccUserId(keyId)),
    });
    cache.set(keyId, p);
    p.catch(() => {
        if (cache.get(keyId) === p) cache.delete(keyId);
    });
    return p;
}
