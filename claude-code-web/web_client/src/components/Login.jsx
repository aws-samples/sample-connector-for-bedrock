import { useState } from 'react'
import { useAuth } from '../hooks/useAuth.jsx'
import { KeyRound, Loader2, AlertCircle } from 'lucide-react'

function Login() {
  const { login, error: restoreError } = useAuth()

  const [apiKey, setApiKey] = useState('')
  // Show why the stored key could not be used, if it was rejected on load
  const [error, setError] = useState(restoreError || '')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('') // Clear any previous errors
    setLoading(true)

    try {
      const result = await login(apiKey.trim())

      if (!result.success) {
        const errorMessage = result.error || 'Sign in failed. Please try again.'
        setLoading(false)
        setError(errorMessage)
        return
      }

      setLoading(false)
    } catch (err) {
      console.error('Unexpected error in handleSubmit:', err)
      setLoading(false)
      setError('An unexpected error occurred')
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1>🤖 Claude Agent</h1>
          <h2>Sign In</h2>
          <p>Enter your BRConnector API key</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && (
            <div className="auth-error">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="api-key">
              <KeyRound size={16} />
              API Key
            </label>
            <input
              id="api-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="BRConnector API key"
              required
              autoComplete="off"
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={loading || !apiKey.trim()}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="spinning" />
                Signing in...
              </>
            ) : (
              'Sign In'
            )}
          </button>
        </form>
      </div>
    </div>
  )
}

export default Login
