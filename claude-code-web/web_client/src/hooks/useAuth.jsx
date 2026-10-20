import { useState, useEffect, createContext, useContext, useCallback } from 'react'
import { getValidAccessToken, setApiKey, clearApiKey, isAuthError } from '../utils/authUtils'
import { pickRuntimeAnthropicModels } from '../utils/brcModels'

// BRConnector lists the key's models on the same origin that serves this page
const MODELS_URL = '/v1/models'

// The client never learns the real user id: BRConnector derives it from the key on every request
const KEY_USER = {
  userId: 'me',
  username: 'BRConnector key'
}

// Create Auth Context
const AuthContext = createContext(null)

/**
 * Check a key against BRConnector and return the models it can use with Claude Code
 * @param {string} key - BRConnector API key
 * @returns {Promise<{ models: string[], defaultModel: string }>} Throws an Error with a user-facing message
 */
async function fetchKeyModels(key) {
  const response = await fetch(MODELS_URL, {
    headers: { 'Authorization': `Bearer ${key}` }
  })

  if (!response.ok) {
    const error = new Error(`Failed to verify the API key (HTTP ${response.status})`)
    error.status = response.status
    if (isAuthError(error)) {
      error.message = 'Invalid API key'
    } else {
      // BRConnector puts its reason in `data`, e.g. a key that does not exist
      try {
        const body = await response.json()
        if (typeof body?.data === 'string' && body.data) {
          error.message = body.data
        }
      } catch {
        // Ignore JSON parse errors
      }
    }
    throw error
  }

  const picked = pickRuntimeAnthropicModels(await response.json())
  if (picked.models.length === 0) {
    const error = new Error('This key has no bedrock-runtime-anthropic model')
    error.noModels = true
    throw error
  }
  return picked
}

/**
 * Auth Provider Component
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [models, setModels] = useState([])
  const [defaultModel, setDefaultModel] = useState(null)
  const [initializing, setInitializing] = useState(true) // Initial key check on app load
  const [loading, setLoading] = useState(false) // Login operation
  const [error, setError] = useState(null)

  // Sign in with a key once BRConnector accepts it and it has a model Claude Code can use
  const signInWithKey = useCallback(async (key) => {
    try {
      const picked = await fetchKeyModels(key)
      setApiKey(key)
      setModels(picked.models)
      setDefaultModel(picked.defaultModel)
      setUser(KEY_USER)
      setError(null)
      return { success: true }
    } catch (err) {
      // Drop a key BRConnector rejected or that has no model; keep it when the server is unreachable or failing
      if (err.noModels || (err.status >= 400 && err.status < 500)) {
        clearApiKey()
      }
      const userMessage = (err.status || err.noModels) ? err.message : 'Failed to reach the server. Please try again.'
      setUser(null)
      setModels([])
      setDefaultModel(null)
      setError(userMessage)
      return { success: false, error: userMessage }
    }
  }, [])

  // Sign in again with the stored key, if any
  useEffect(() => {
    const restore = async () => {
      const key = await getValidAccessToken()
      if (key) {
        await signInWithKey(key)
      }
      setInitializing(false)
    }
    restore()
  }, [signInWithKey])

  // Sign in with a BRConnector API key
  const login = useCallback(async (key) => {
    setLoading(true)
    setError(null)
    try {
      return await signInWithKey(key)
    } finally {
      setLoading(false)
    }
  }, [signInWithKey])

  // Sign out
  const logout = useCallback(async () => {
    clearApiKey()
    setUser(null)
    setModels([])
    setDefaultModel(null)
    setError(null)
    return { success: true }
  }, [])

  const value = {
    user,
    initializing,
    loading,
    error,
    login,
    logout,
    models,
    defaultModel,
    isAuthenticated: !!user
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/**
 * Hook to use Auth context
 */
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
