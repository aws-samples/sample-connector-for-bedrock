import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";

type SecretsClient = { send(command: GetSecretValueCommand): Promise<{ SecretString?: string }> };

export function secretRegion(secretId: string): string | undefined {
    return secretId.startsWith("arn:") ? secretId.split(":")[3] : undefined;
}

// A password function for pg, which calls it for each new connection: the secret is read once.
export function secretPassword(secretId: string, client?: SecretsClient): () => Promise<string> {
    const secrets = client ?? new SecretsManagerClient({ region: secretRegion(secretId) });
    let password: Promise<string> | undefined;
    return () => {
        password ??= secrets
            .send(new GetSecretValueCommand({ SecretId: secretId }))
            .then((out) => {
                if (typeof out.SecretString !== "string") throw new Error("the database password secret has no SecretString");
                return out.SecretString;
            })
            .catch((err) => {
                password = undefined;
                throw err;
            });
        return password;
    };
}
