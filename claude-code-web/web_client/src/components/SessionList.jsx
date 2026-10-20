import { useEffect, useState, useRef } from 'react'
import { Plus, Circle } from 'lucide-react'
import { createAPIClient } from '../api/client'
import { getAgentCoreSessionId } from '../utils/authUtils'
import { formatRelativeTime, compareDates } from '../utils/dateUtils'

function SessionList({ serverUrl, currentSessionId, onSessionSelect, onNewSession, cwd, disabled, isActive, currentProject, refreshTrigger }) {
  const [sessions, setSessions] = useState([])
  const [activeSessions, setActiveSessions] = useState(new Set())
  const [loading, setLoading] = useState(false)
  const apiClientRef = useRef(null)
  const previousActiveRef = useRef(false)

  // Function to fetch sessions
  const fetchSessions = async () => {
    if (!apiClientRef.current) return

    setLoading(true)
    try {
      // Fetch available sessions from disk
      const availableData = await apiClientRef.current.listAvailableSessions(cwd)

      // Filter out empty sessions (no messages or only warmup)
      // BUT keep active sessions even if they have no messages yet
      const filteredSessions = (availableData.sessions || []).filter(session => {
        // Always show active (in-memory) sessions, even if message_count is 0
        if (session.active === true) return true

        // For persisted sessions, skip if no messages
        if (session.message_count === 0) return false

        // Skip sessions with only one message that is "Warmup"
        if (session.message_count === 1 &&
            session.first_message &&
            session.first_message.trim().toLowerCase() === 'warmup') {
          return false
        }

        return true
      })

      setSessions(filteredSessions)

      // Fetch active sessions to mark them with indicator
      const activeData = await apiClientRef.current.listSessions(cwd)
      const activeIds = new Set(activeData.sessions.map(s => s.session_id))
      setActiveSessions(activeIds)

      // Sort sessions: active first, then by time (newest first)
      setSessions(prev => {
        return [...prev].sort((a, b) => {
          const aIsActive = activeIds.has(a.session_id)
          const bIsActive = activeIds.has(b.session_id)

          // Active sessions always come first
          if (aIsActive && !bIsActive) return -1
          if (!aIsActive && bIsActive) return 1

          // If both active or both inactive, sort by modified time (newest first)
          return compareDates(a.modified, b.modified)
        })
      })
    } catch (error) {
      console.error('Failed to fetch sessions:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Don't fetch sessions if disabled
    if (disabled) {
      setSessions([])
      setActiveSessions(new Set())
      return
    }

    if (!serverUrl) return

    // Create or update API client when serverUrl changes
    const initApiClient = async () => {
      if (!apiClientRef.current || apiClientRef.current.baseUrl !== serverUrl) {
        const agentCoreSessionId = await getAgentCoreSessionId(currentProject)
        apiClientRef.current = createAPIClient(serverUrl, agentCoreSessionId)
      }
    }
    initApiClient()

    // Initial fetch
    fetchSessions()

    // Refresh session list every 30 seconds when page is visible
    let interval = null
    const startInterval = () => {
      if (!document.hidden && !interval) {
        interval = setInterval(fetchSessions, 30000)
      }
    }

    const stopInterval = () => {
      if (interval) {
        clearInterval(interval)
        interval = null
      }
    }

    // Handle visibility change - stop polling when page is hidden
    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopInterval()
      } else {
        fetchSessions()
        startInterval()
      }
    }

    // Also refresh on window focus (when user comes back to the tab)
    const handleFocus = () => {
      fetchSessions()
    }

    startInterval()
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)

    return () => {
      stopInterval()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
    }
  }, [serverUrl, cwd, disabled, currentSessionId])

  // Auto-refresh when tab becomes active
  useEffect(() => {
    if (disabled) {
      previousActiveRef.current = isActive
      return
    }

    // Check if tab just became active (transition from false to true)
    if (isActive && !previousActiveRef.current) {
      // Use a small delay to ensure apiClient is initialized
      const timer = setTimeout(() => {
        if (apiClientRef.current) {
          fetchSessions()
        }
      }, 100)

      // Update previous active state immediately
      previousActiveRef.current = isActive

      return () => clearTimeout(timer)
    }

    // Update previous active state
    previousActiveRef.current = isActive
  }, [isActive, disabled])

  // Refresh when refreshTrigger changes (messages changed)
  useEffect(() => {
    if (disabled || !refreshTrigger) return

    console.log('🔄 Refresh trigger changed - refreshing session list')
    if (apiClientRef.current) {
      fetchSessions()
    }
  }, [refreshTrigger, disabled])


  return (
    <div className="session-list">
      <div className="session-list-header">
        <h2>Sessions</h2>
        <button
          className="btn btn-primary btn-sm"
          onClick={onNewSession}
          title="Create new session"
        >
          <Plus size={16} /> New
        </button>
      </div>

      {loading && sessions.length === 0 ? (
        <div className="session-list-loading">Loading...</div>
      ) : sessions.length === 0 ? (
        <div className="session-list-empty">No sessions found</div>
      ) : (
        <div className="session-list-items">
          {sessions.map((session) => {
            const isActive = activeSessions.has(session.session_id)
            const isCurrentSession = session.session_id === currentSessionId

            return (
              <div
                key={session.session_id}
                className={`session-item ${isCurrentSession ? 'current' : ''}`}
                onClick={() => onSessionSelect(session.session_id)}
              >
                <div className="session-item-header">
                  <div className="session-preview-wrapper">
                    {isActive && <Circle size={8} className="active-indicator" fill="currentColor" title="Active session" />}
                    <span className="session-preview-title" title={session.preview}>
                      {session.preview}
                    </span>
                  </div>
                  <span className="session-project" title={session.project}>
                    {session.project}
                  </span>
                </div>
                <div className="session-item-info">
                  <span className="session-id-small" title={session.session_id}>
                    {session.session_id.slice(0, 8)}...
                  </span>
                  <span className="session-time" title={session.modified}>
                    {formatRelativeTime(session.modified)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default SessionList
