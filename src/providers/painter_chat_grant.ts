import crypto from "crypto";

export const PAINTER_CHAT_GRANT_HEADER = "x-brconnector-painter-grant";

const GRANT_LIFETIME_MS = 60_000;

type Grant = { keyId: number; modelName: string; expiresAt: number };

const grants = new Map<string, Grant>();

export function issuePainterChatGrant(keyId: number, modelName: string): string {
  const now = Date.now();
  for (const [token, grant] of grants) {
    if (grant.expiresAt <= now) grants.delete(token);
  }
  const token = crypto.randomBytes(32).toString("base64url");
  grants.set(token, { keyId, modelName, expiresAt: now + GRANT_LIFETIME_MS });
  return token;
}

export function redeemPainterChatGrant(token: unknown, keyId: number, modelName: string): boolean {
  if (typeof token !== "string") return false;
  const grant = grants.get(token);
  if (!grant) return false;
  grants.delete(token);
  return grant.expiresAt > Date.now() && grant.keyId === keyId && grant.modelName === modelName;
}
