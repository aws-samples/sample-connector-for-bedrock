// Keep the SDK's default credential chain away from the developer's real AWS setup. If code
// under test falls through to that chain, it signs as 'fake-host-ak' instead of a real identity.
export const HERMETIC_ENV: Record<string, string | undefined> = {
    AWS_PROFILE: undefined,
    AWS_DEFAULT_PROFILE: undefined,
    AWS_SESSION_TOKEN: undefined,
    AWS_ROLE_ARN: undefined,
    AWS_WEB_IDENTITY_TOKEN_FILE: undefined,
    AWS_CONTAINER_CREDENTIALS_FULL_URI: undefined,
    AWS_CONTAINER_CREDENTIALS_RELATIVE_URI: undefined,
    AWS_AUTH_SCHEME_PREFERENCE: undefined,
    AWS_BEARER_TOKEN_BEDROCK: undefined,
    AWS_CONFIG_FILE: '/nonexistent/aws-config',
    AWS_SHARED_CREDENTIALS_FILE: '/nonexistent/aws-credentials',
    AWS_EC2_METADATA_DISABLED: 'true',
    AWS_ACCESS_KEY_ID: 'fake-host-ak',
    AWS_SECRET_ACCESS_KEY: 'fake-host-secret',
    HTTPS_PROXY: undefined,
    HTTP_PROXY: undefined,
};
