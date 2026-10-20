import { useState, useEffect, useCallback, useRef } from 'react'
import { GitCommit, RefreshCw, Upload, FileText, Plus, Minus, Edit } from 'lucide-react'
import { createAPIClient } from '../api/client'
import { getAgentCoreSessionId } from '../utils/authUtils'

function GitPanel({ serverUrl, cwd, disabled, currentProject, isActive }) {
  const [commits, setCommits] = useState([])
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)
  const [selectedCommit, setSelectedCommit] = useState(null)
  const [commitMessage, setCommitMessage] = useState('')
  const [showCommitForm, setShowCommitForm] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState(new Set())
  const apiClientRef = useRef(null)
  const prevIsActiveRef = useRef(false)

  // Initialize API client
  useEffect(() => {
    const initApiClient = async () => {
      if (!serverUrl) return
      const agentCoreSessionId = await getAgentCoreSessionId(currentProject)
      apiClientRef.current = createAPIClient(serverUrl, agentCoreSessionId)
    }
    initApiClient()
  }, [serverUrl, currentProject])

  const fetchGitLog = useCallback(async () => {
    if (!cwd || disabled || !apiClientRef.current) return

    setLoading(true)
    try {
      const data = await apiClientRef.current.getGitLog(cwd, 10)
      setCommits(data.commits || [])
    } catch (error) {
      console.error('Failed to fetch git log:', error)
    } finally {
      setLoading(false)
    }
  }, [cwd, disabled])

  const fetchGitStatus = useCallback(async () => {
    if (!cwd || disabled || !apiClientRef.current) return

    try {
      const data = await apiClientRef.current.getGitStatus(cwd)
      setStatus(data)
    } catch (error) {
      console.error('Failed to fetch git status:', error)
    }
  }, [cwd, disabled])

  const handleCommit = async () => {
    if (!commitMessage.trim() || disabled || !apiClientRef.current) return

    setLoading(true)
    try {
      const files = selectedFiles.size > 0 ? Array.from(selectedFiles) : null
      await apiClientRef.current.createGitCommit(cwd, commitMessage, files)

      setCommitMessage('')
      setShowCommitForm(false)
      setSelectedFiles(new Set())
      await fetchGitLog()
      await fetchGitStatus()
    } catch (error) {
      console.error('Failed to create commit:', error)
      alert(`Commit failed: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handlePush = async () => {
    if (disabled || !apiClientRef.current) return

    if (!confirm('Push commits to remote?')) return

    setLoading(true)
    try {
      await apiClientRef.current.pushGitCommits(cwd, 'origin')
      alert('Successfully pushed commits')
      await fetchGitLog()
    } catch (error) {
      console.error('Failed to push:', error)
      alert(`Push failed: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const toggleFileSelection = (filepath) => {
    const newSelected = new Set(selectedFiles)
    if (newSelected.has(filepath)) {
      newSelected.delete(filepath)
    } else {
      newSelected.add(filepath)
    }
    setSelectedFiles(newSelected)
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'M': return <Edit size={14} className="text-blue-500" title="Modified" />
      case 'A': return <Plus size={14} className="text-green-500" title="Added" />
      case 'D': return <Minus size={14} className="text-red-500" title="Deleted" />
      default: return <FileText size={14} />
    }
  }

  useEffect(() => {
    if (cwd && !disabled) {
      fetchGitLog()
      fetchGitStatus()
    }
  }, [cwd, disabled, fetchGitLog, fetchGitStatus])

  // Refresh when tab becomes active
  useEffect(() => {
    if (isActive && !prevIsActiveRef.current && cwd && !disabled) {
      console.log('🔄 Git tab activated, refreshing git status and log')
      fetchGitLog()
      fetchGitStatus()
    }
    prevIsActiveRef.current = isActive
  }, [isActive, cwd, disabled, fetchGitLog, fetchGitStatus])

  if (disabled) {
    return <div className="git-panel-disabled">Git panel disabled (no server connection)</div>
  }

  if (!cwd) {
    return <div className="git-panel-disabled">No working directory selected</div>
  }

  return (
    <div className="git-panel">
      <div className="git-panel-header">
        <h2>Git</h2>
        <div className="git-panel-actions">
          {status && (
            <span className="git-branch-badge">
              {status.branch}
            </span>
          )}
          <button
            className="btn-icon"
            onClick={() => { fetchGitLog(); fetchGitStatus(); }}
            disabled={loading}
            title="Refresh"
          >
            <RefreshCw size={16} className={loading ? 'spinning' : ''} />
          </button>
        </div>
      </div>

      {/* Git Status Section */}
      {status && (status.staged.length > 0 || status.unstaged.length > 0 || status.untracked.length > 0) && (
        <div className="git-status-section">
          <div className="section-header">
            <h3>Changes</h3>
            <button
              className="btn-secondary btn-small"
              onClick={() => setShowCommitForm(!showCommitForm)}
              disabled={loading}
            >
              <GitCommit size={14} />
              Commit
            </button>
          </div>

          {showCommitForm && (
            <div className="commit-form">
              <textarea
                placeholder="Commit message..."
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                rows={3}
              />
              <div className="file-selection">
                {[...status.staged, ...status.unstaged, ...status.untracked].map((file, idx) => {
                  const filepath = file.path
                  return (
                    <label key={idx} className="file-checkbox">
                      <input
                        type="checkbox"
                        checked={selectedFiles.size === 0 || selectedFiles.has(filepath)}
                        onChange={() => toggleFileSelection(filepath)}
                      />
                      {getStatusIcon(file.status)}
                      <span>{filepath}</span>
                    </label>
                  )
                })}
              </div>
              <div className="commit-form-actions">
                <button
                  className="btn-primary btn-small"
                  onClick={handleCommit}
                  disabled={!commitMessage.trim() || loading}
                >
                  Create Commit
                </button>
                <button
                  className="btn-secondary btn-small"
                  onClick={() => {
                    setShowCommitForm(false)
                    setCommitMessage('')
                    setSelectedFiles(new Set())
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {!showCommitForm && (
            <>
              {status.staged.length > 0 && (
                <div className="git-file-list">
                  <div className="file-list-header">Staged ({status.staged.length})</div>
                  {status.staged.map((file, idx) => (
                    <div key={idx} className="git-file-item">
                      {getStatusIcon(file.status)}
                      <span>{file.path}</span>
                    </div>
                  ))}
                </div>
              )}

              {status.unstaged.length > 0 && (
                <div className="git-file-list">
                  <div className="file-list-header">Unstaged ({status.unstaged.length})</div>
                  {status.unstaged.map((file, idx) => (
                    <div key={idx} className="git-file-item">
                      {getStatusIcon(file.status)}
                      <span>{file.path}</span>
                    </div>
                  ))}
                </div>
              )}

              {status.untracked.length > 0 && (
                <div className="git-file-list">
                  <div className="file-list-header">Untracked ({status.untracked.length})</div>
                  {status.untracked.map((file, idx) => (
                    <div key={idx} className="git-file-item">
                      <FileText size={14} />
                      <span>{file.path}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Git Log Section */}
      <div className="git-log-section">
        <div className="section-header">
          <h3>Recent Commits</h3>
          <button
            className="btn-secondary btn-small"
            onClick={handlePush}
            disabled={loading || commits.length === 0}
            title="Push to remote"
          >
            <Upload size={14} />
            Push
          </button>
        </div>

        {loading && commits.length === 0 ? (
          <div className="git-loading">Loading commits...</div>
        ) : commits.length === 0 ? (
          <div className="git-empty">No commits found</div>
        ) : (
          <div className="git-commits">
            {commits.map((commit) => (
              <div
                key={commit.hash}
                className={`git-commit-item ${selectedCommit === commit.hash ? 'selected' : ''}`}
                onClick={() => setSelectedCommit(selectedCommit === commit.hash ? null : commit.hash)}
              >
                <div className="commit-header">
                  <span className="commit-hash" title={commit.hash}>
                    {commit.short_hash}
                  </span>
                  <span className="commit-author">{commit.author}</span>
                  <span className="commit-date">{commit.date}</span>
                </div>
                <div className="commit-message">{commit.message}</div>
                {selectedCommit === commit.hash && commit.files_changed.length > 0 && (
                  <div className="commit-files">
                    {commit.files_changed.map((file, idx) => (
                      <div key={idx} className="commit-file">
                        {getStatusIcon(file.status)}
                        <span>{file.path}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default GitPanel
