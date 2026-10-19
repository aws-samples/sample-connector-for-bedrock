/**
 * Authentication utility functions for token management
 */

import { fetchAuthSession } from 'aws-amplify/auth'

// Token refresh threshold: refresh if token expires in less than 5 minutes
const TOKEN_REFRESH_THRESHOLD = 5 * 60 * 1000 // 5 minutes in milliseconds

/**
 * Get valid access token, refreshing if necessary
 * @returns {Promise<string|null>} Access token or null if not authenticated
 */
export async function getValidAccessToken() {
  try {
    const session = await fetchAuthSession({ forceRefresh: false })

    if (!session.tokens || !session.tokens.accessToken) {
      return null
    }

    const accessToken = session.tokens.accessToken
    const expiresAt = accessToken.payload.exp * 1000 // Convert to milliseconds
    const now = Date.now()
    const timeUntilExpiry = expiresAt - now

    // If token expires soon, force refresh
    if (timeUntilExpiry < TOKEN_REFRESH_THRESHOLD) {
      console.log('🔄 Access token expiring soon, refreshing...')
      const refreshedSession = await fetchAuthSession({ forceRefresh: true })
      return refreshedSession.tokens?.accessToken?.toString() || null
    }

    return accessToken.toString()
  } catch (error) {
    console.error('Failed to get access token:', error)
    return null
  }
}

/**
 * Get AgentCore session ID from access token
 * Extracts user_id from JWT 'sub' claim and formats as session ID
 * @param {string|null} project - Project name (optional). If provided and workspace mode is disabled, formats as userid@workspace/project
 * @returns {Promise<string|null>} Session ID or null if not available
 */
export async function getAgentCoreSessionId(project = null) {
  try {
    const token = await getValidAccessToken()
    if (!token) {
      return null
    }

    // Decode JWT token (without verification - just parse)
    const parts = token.split('.')
    if (parts.length !== 3) {
      return null
    }

    const payload = JSON.parse(atob(parts[1]))
    const userId = payload.sub

    if (!userId) {
      return null
    }

    // Check workspace mode from environment variable
    const workspaceMode = import.meta.env.VITE_WORKSPACE_MODE === 'true'

    console.log(`[AuthUtils] getAgentCoreSessionId:`, {
      workspaceMode,
      project,
      VITE_WORKSPACE_MODE: import.meta.env.VITE_WORKSPACE_MODE
    })

    // Format session ID based on mode
    if (workspaceMode || !project) {
      // Workspace mode: user_id@workspace
      const sessionId = `${userId}@workspace`
      console.log(`[AuthUtils] Using workspace mode, session ID: ${sessionId}`)
      return sessionId
    } else {
      // Project mode: user_id@workspace/project
      const sessionId = `${userId}@workspace/${project}`
      console.log(`[AuthUtils] Using project mode, session ID: ${sessionId}`)
      return sessionId
    }
  } catch (error) {
    console.error('Failed to get AgentCore session ID:', error)
    return null
  }
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
  return (
    error.status === 401 ||
    error.statusCode === 401 ||
    error.message?.includes('401') ||
    error.message?.includes('Unauthorized') ||
    error.message?.includes('Not authenticated')
  )
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
