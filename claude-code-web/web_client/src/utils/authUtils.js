/**
 * Authentication utility functions for the BRConnector API key
 *
 * The key is kept in localStorage and sent as the bearer token on every request.
 */

const API_KEY_STORAGE_KEY = 'brc-cc-api-key'

// BRConnector replaces the session id with one derived from the key, so the client only sends a placeholder
const PLACEHOLDER_SESSION_ID = 'me@workspace'

/**
 * Store the BRConnector API key
 * @param {string} key - API key
 */
export function setApiKey(key) {
  localStorage.setItem(API_KEY_STORAGE_KEY, key)
}

/**
 * Forget the stored BRConnector API key
 */
export function clearApiKey() {
  localStorage.removeItem(API_KEY_STORAGE_KEY)
}

/**
 * Get the stored API key
 * @returns {Promise<string|null>} API key or null if not signed in
 */
export async function getValidAccessToken() {
  try {
    return localStorage.getItem(API_KEY_STORAGE_KEY) || null
  } catch (error) {
    console.error('Failed to read the API key from localStorage:', error)
    return null
  }
}

/**
 * Get AgentCore session ID
 * BRConnector generates the real session id from the key, so this is a placeholder
 * @param {string|null} project - Project name (ignored; kept for the upstream signature)
 * @returns {Promise<string|null>} Placeholder session ID, or null if not signed in
 */
export async function getAgentCoreSessionId(project = null) {
  const key = await getValidAccessToken()
  return key ? PLACEHOLDER_SESSION_ID : null
}

/**
 * Create authorization headers for API requests
 * @param {boolean} includeSessionId - Whether to include X-Amzn-Bedrock-AgentCore-Runtime-Session-Id header
 * @param {string|null} project - Project name (optional) for session ID
 * @returns {Promise<Object>} Headers object with Authorization header and optionally session ID
 */
export async function getAuthHeaders(includeSessionId = false, project = null) {
  const token = await getValidAccessToken()

  if (!token) {
    throw new Error('Not authenticated')
  }

  const headers = {
    'Authorization': `Bearer ${token}`
  }

  // Optionally include AgentCore session ID header
  if (includeSessionId) {
    const sessionId = await getAgentCoreSessionId(project)
    if (sessionId) {
      headers['X-Amzn-Bedrock-AgentCore-Runtime-Session-Id'] = sessionId
    }
  }

  return headers
}

/**
 * Check if error is authentication-related
 * @param {Error} error - Error object
 * @returns {boolean} True if authentication error
 */
export function isAuthError(error) {
  return error?.status === 401 || error?.status === 403
}

/**
 * Global auth error handler - set by App component
 * This will be called when an authentication error is detected
 */
let globalAuthErrorHandler = null

/**
 * Set the global authentication error handler
 * @param {Function} handler - Function to call on auth errors
 */
export function setAuthErrorHandler(handler) {
  globalAuthErrorHandler = handler
}

/**
 * Trigger authentication error handling
 * This will cause the user to be logged out and redirected to login
 */
export function handleAuthError() {
  if (globalAuthErrorHandler) {
    globalAuthErrorHandler()
  } else {
    console.error('Auth error occurred but no handler is registered')
  }
}
