// Custom headers AgentCore forwards to the container. Defined once; the BFF and the
// claude-code-web fork must use these exact names.
export const CC_HEADER_API_KEY = 'X-Amzn-Bedrock-AgentCore-Runtime-Custom-Brc-Api-Key';
export const CC_HEADER_AWS_ACCESS_KEY_ID = 'X-Amzn-Bedrock-AgentCore-Runtime-Custom-Brc-Aws-Access-Key-Id';
export const CC_HEADER_AWS_SECRET_ACCESS_KEY = 'X-Amzn-Bedrock-AgentCore-Runtime-Custom-Brc-Aws-Secret-Access-Key';
export const CC_HEADER_AWS_SESSION_TOKEN = 'X-Amzn-Bedrock-AgentCore-Runtime-Custom-Brc-Aws-Session-Token';

export const CC_SESSION_HEADER = 'X-Amzn-Bedrock-AgentCore-Runtime-Session-Id';
