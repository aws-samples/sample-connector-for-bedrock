// One workspace per BRConnector key: the user id names the S3 prefix, the session id pins
// the AgentCore microVM. AgentCore requires session ids of at least 33 characters.
export function ccUserId(keyId: number): string {
    return `brc-key-${String(keyId).padStart(16, '0')}`;
}

export function ccSessionId(keyId: number): string {
    return `${ccUserId(keyId)}@workspace`;
}
