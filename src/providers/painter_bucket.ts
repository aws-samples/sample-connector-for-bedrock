import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import logger from "../util/logger";

export type PictureBucket = { bucket: string; region: string; prefix: string };

type ModelS3Config = { s3Bucket?: string; s3Region?: string; s3Prefix?: string };

type StackSettings = { PAINTER_S3_BUCKET?: string; PAINTER_S3_REGION?: string; PAINTER_S3_PREFIX?: string };

type Deps = {
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  getParameter?: (name: string, region: string | undefined) => Promise<string | undefined>;
};

const NO_BUCKET = "painter has no S3 bucket for pictures. Set s3Bucket and s3Region in this model's config, or update the BRConnector stack to a template with painter (EnablePainter true), which sets them.";
const IMDS = "http://169.254.169.254/latest";
const IMDS_TIMEOUT_MS = 1000;
const INSTANCE_ID = /^i-[0-9a-f]+$/;

let ec2Settings: Promise<StackSettings | null> | null = null;

export function resetStackSettings(): void {
  ec2Settings = null;
}

const withoutTrailingSlash = (prefix: string) => (prefix.endsWith("/") ? prefix.slice(0, -1) : prefix);

export async function pictureBucket(config: ModelS3Config, deps: Deps = {}): Promise<PictureBucket> {
  if (config.s3Bucket) {
    if (!config.s3Region) throw new Error("You must specify the parameter 's3Region'.");
    return { bucket: config.s3Bucket, region: config.s3Region, prefix: withoutTrailingSlash(config.s3Prefix || "") };
  }
  const env = deps.env ?? process.env;
  const stack = env.PAINTER_S3_BUCKET ? env : await stackSettingsOnEc2(env, deps);
  if (!stack?.PAINTER_S3_BUCKET) throw new Error(NO_BUCKET);
  if (!stack.PAINTER_S3_REGION) {
    throw new Error("painter's stack settings have PAINTER_S3_BUCKET but no PAINTER_S3_REGION. Set PAINTER_S3_REGION, or set s3Bucket and s3Region in this model's config.");
  }
  return { bucket: stack.PAINTER_S3_BUCKET, region: stack.PAINTER_S3_REGION, prefix: withoutTrailingSlash(stack.PAINTER_S3_PREFIX || "") };
}

function stackSettingsOnEc2(env: NodeJS.ProcessEnv, deps: Deps): Promise<StackSettings | null> {
  if (env.AWS_LAMBDA_FUNCTION_NAME || env.ECS_CONTAINER_METADATA_URI_V4 || env.AWS_EC2_METADATA_DISABLED?.toLowerCase() === "true") {
    return Promise.resolve(null);
  }
  ec2Settings ??= rememberOnlyWhenFound(readEc2Settings(env, deps));
  return ec2Settings;
}

function rememberOnlyWhenFound(lookup: Promise<StackSettings | null>): Promise<StackSettings | null> {
  const forget = () => {
    if (ec2Settings === lookup) ec2Settings = null;
  };
  lookup.then((settings) => {
    if (!settings) forget();
  }, forget);
  return lookup;
}

async function readEc2Settings(env: NodeJS.ProcessEnv, deps: Deps): Promise<StackSettings | null> {
  const instanceId = await ec2InstanceId(deps.fetch ?? fetch);
  if (!instanceId) {
    logger.warn("painter has no stack S3 settings: the instance metadata service gave no EC2 instance id.");
    return null;
  }
  const name = `/brconnector/instance/${instanceId}/painter`;
  let value: string | undefined;
  try {
    value = await (deps.getParameter ?? ssmParameter)(name, env.AWS_REGION || env.AWS_DEFAULT_REGION);
  } catch (e: any) {
    logger.warn(`painter has no stack S3 settings: reading the SSM parameter ${name} failed: ${e?.name ?? "Error"} (http ${e?.$metadata?.httpStatusCode ?? "n/a"})`);
    return null;
  }
  const settings = parseStackSettings(value);
  if (!settings) logger.warn(`painter has no stack S3 settings: the SSM parameter ${name} is not JSON that names PAINTER_S3_BUCKET.`);
  return settings;
}

function parseStackSettings(value: string | undefined): StackSettings | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value ?? "");
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const settings: StackSettings = {};
  for (const key of ["PAINTER_S3_BUCKET", "PAINTER_S3_REGION", "PAINTER_S3_PREFIX"] as const) {
    const v = (parsed as Record<string, unknown>)[key];
    if (typeof v === "string") settings[key] = v;
  }
  return settings.PAINTER_S3_BUCKET ? settings : null;
}

// IMDSv2 first. The plain GET covers an instance that still allows IMDSv1 but refuses the token call.
async function ec2InstanceId(fetchFn: typeof fetch): Promise<string | null> {
  const text = (path: string, init: RequestInit) => fetchFn(`${IMDS}${path}`, { ...init, signal: AbortSignal.timeout(IMDS_TIMEOUT_MS) })
    .then((response) => (response.ok ? response.text() : ""))
    .catch(() => "");
  const token = await text("/api/token", { method: "PUT", headers: { "X-aws-ec2-metadata-token-ttl-seconds": "60" } });
  const id = (await text("/meta-data/instance-id", { headers: token ? { "X-aws-ec2-metadata-token": token } : {} })).trim();
  return INSTANCE_ID.test(id) ? id : null;
}

async function ssmParameter(name: string, region: string | undefined): Promise<string | undefined> {
  const out = await new SSMClient({ region }).send(new GetParameterCommand({ Name: name }));
  return out.Parameter?.Value;
}
