/**
 * Model list for a BRConnector key
 *
 * Pure ESM with no browser or Vite globals: the BRConnector root test suite imports it directly.
 */

// Claude Code speaks the Anthropic Messages API, which BRConnector serves through this provider
export const RUNTIME_ANTHROPIC_PROVIDER = 'bedrock-runtime-anthropic'

// Preferred default model when the key has it
export const PREFERRED_DEFAULT_MODEL = 'claude-sonnet-5-5'

/**
 * Pick the models Claude Code can use from a BRConnector GET /v1/models response
 * @param {{ data?: Array<{ id: string, owned_by: string }> } | null | undefined} resp - Response body
 * @returns {{ models: string[], defaultModel: string | null }} Model ids sorted by id, and the default model
 */
export function pickRuntimeAnthropicModels(resp) {
  const items = Array.isArray(resp?.data) ? resp.data : []
  const models = items
    .filter(item => item?.owned_by === RUNTIME_ANTHROPIC_PROVIDER && typeof item.id === 'string')
    .map(item => item.id)
    .sort()

  const defaultModel = models.includes(PREFERRED_DEFAULT_MODEL)
    ? PREFERRED_DEFAULT_MODEL
    : (models[0] ?? null)

  return { models, defaultModel }
}
