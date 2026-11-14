import crypto from "crypto";

// Painter calls its chat model back through this gateway with the caller's key, and a key granted painter alone
// may not use that chat model itself. The grant lets that one call through: it is known only to this process,
// bound to the key and the model, valid for one lookup within 60 seconds.
export const MODEL_GRANT_HEADER = "x-brconnector-model-grant";

const GRANT_LIFETIME_MS = 60_000;

type Grant = { keyId: number; modelName: string; expiresAt: number };

const grants = new Map<string, Grant>();

export function issueModelGrant(keyId: number, modelName: string): string {
  const now = Date.now();
  for (const [token, grant] of grants) {
    if (grant.expiresAt <= now) grants.delete(token);
  }
  const token = crypto.randomBytes(32).toString("base64url");
  grants.set(token, { keyId, modelName, expiresAt: now + GRANT_LIFETIME_MS });
  return token;
}

export function redeemModelGrant(token: unknown, keyId: number, modelName: string): boolean {
  if (typeof token !== "string") return false;
  const grant = grants.get(token);
  if (!grant) return false;
  grants.delete(token);
  return grant.expiresAt > Date.now() && grant.keyId === keyId && grant.modelName === modelName;
}
