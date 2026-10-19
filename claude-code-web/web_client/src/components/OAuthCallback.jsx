import { useEffect, useState } from 'react'
import { Loader2, CheckCircle, XCircle } from 'lucide-react'
import { getAgentCoreSessionId } from '../utils/authUtils'
import { createAPIClient } from '../api/client'

export default function OAuthCallback() {
  const [status, setStatus] = useState('processing') // 'processing' | 'success' | 'error'
  const [message, setMessage] = useState('Completing GitHub authentication...')

  useEffect(() => {
    const completeOAuthFlow = async () => {
      try {
        // Extract session_id from URL query parameters
        const urlParams = new URLSearchParams(window.location.search)
        const sessionId = urlParams.get('session_id')

        if (!sessionId) {
          setStatus('error')
          setMessage('Missing session_id parameter')
          return
        }

        // Get AgentCore session ID from token
        const agentCoreSessionId = await getAgentCoreSessionId()

        if (!agentCoreSessionId) {
          setStatus('error')
          setMessage('Not authenticated. Please log in first.')
          return
        }

        // Get server URL from localStorage settings
        const settingsStr = localStorage.getItem('claude-agent-settings')
        const settings = settingsStr ? JSON.parse(settingsStr) : {}
        const serverUrl = settings.serverUrl || 'http://127.0.0.1:8000'

        console.log(`📝 Completing OAuth flow for session: ${sessionId}`)

        // Create API client with session ID (will use invocations endpoint if configured)
        const apiClient = createAPIClient(serverUrl, agentCoreSessionId)

        // Call backend OAuth callback endpoint through API client
        const result = await apiClient.completeGithubOAuthCallback(sessionId)

        setStatus('success')
        setMessage('GitHub authentication completed successfully!')
        console.log('✅ OAuth flow completed')

        // Close window after 2 seconds
        setTimeout(() => {
          window.close()
        }, 2000)
      } catch (error) {
        setStatus('error')
        setMessage(`Error: ${error.message}`)
        console.error('❌ OAuth callback error:', error)
      }
    }

    completeOAuthFlow()
  }, [])

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      backgroundColor: '#f5f5f5',
      fontFamily: 'Arial, sans-serif'
    }}>
      <div style={{
        textAlign: 'center',
        padding: '2rem',
        backgroundColor: 'white',
        borderRadius: '8px',
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
        maxWidth: '500px',
        width: '100%'
      }}>
        {status === 'processing' && (
          <>
            <Loader2 size={48} style={{ color: '#007bff', margin: '0 auto 1rem', animation: 'spin 1s linear infinite' }} />
            <h1 style={{ color: '#333', marginBottom: '0.5rem' }}>Processing...</h1>
            <p style={{ color: '#666', margin: 0 }}>{message}</p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle size={48} style={{ color: '#28a745', margin: '0 auto 1rem' }} />
            <h1 style={{ color: '#28a745', marginBottom: '0.5rem' }}>Success!</h1>
            <p style={{ color: '#666', margin: 0 }}>{message}</p>
            <p style={{ color: '#999', fontSize: '0.9rem', marginTop: '1rem' }}>
              This window will close automatically...
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle size={48} style={{ color: '#dc3545', margin: '0 auto 1rem' }} />
            <h1 style={{ color: '#dc3545', marginBottom: '0.5rem' }}>Error</h1>
            <p style={{ color: '#666', margin: 0 }}>{message}</p>
            <button
              onClick={() => window.close()}
              style={{
                marginTop: '1.5rem',
                padding: '0.5rem 1rem',
                backgroundColor: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '1rem'
              }}
            >
              Close Window
            </button>
          </>
        )}

        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  )
}
