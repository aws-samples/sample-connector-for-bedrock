/**
 * Session utility functions for agent core session management
 */

/**
 * Generate a UUID v4
 * @returns {string} UUID v4 string
 */
function generateUUID() {
  // Use crypto.randomUUID if available (modern browsers)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }

  // Fallback implementation for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

/**
 * Generate agent core session ID based on user ID and optional project
 * Format: "{userId}@workspace" for workspace mode or no project
 *         "{userId}@workspace/{projectName}" for project mode with project
 * @param {string} userId - User ID from authentication
 * @param {string|null} projectName - Optional project name
 * @returns {string} Agent core session ID
 */
export function generateAgentCoreSessionId(userId, projectName = null) {
  if (!userId) {
    throw new Error('userId is required to generate agent core session ID')
  }

  // Check workspace mode from environment variable
  const workspaceMode = import.meta.env.VITE_WORKSPACE_MODE === 'true'

  console.log(`[SessionUtils] generateAgentCoreSessionId:`, {
    userId,
    projectName,
    workspaceMode,
    VITE_WORKSPACE_MODE: import.meta.env.VITE_WORKSPACE_MODE
  })

  // In workspace mode, always use workspace-only format regardless of project
  if (workspaceMode || !projectName) {
    const sessionId = `${userId}@workspace`
    console.log(`[SessionUtils] Generated session ID (workspace mode): ${sessionId}`)
    return sessionId
  }

  // In project mode with a project, include the project name
  const sessionId = `${userId}@workspace/${projectName}`
  console.log(`[SessionUtils] Generated session ID (project mode): ${sessionId}`)
  return sessionId
}

/**
 * Validate agent core session ID format
 * @param {string} sessionId - Session ID to validate
 * @returns {boolean} True if valid format
 */
export function isValidAgentCoreSessionId(sessionId) {
  if (!sessionId || typeof sessionId !== 'string') {
    return false
  }

  // Check format: prefix-uuid (where uuid is 36 characters)
  // Total length should be around 48-50 characters
  return sessionId.length >= 40 && sessionId.includes('-')
}
