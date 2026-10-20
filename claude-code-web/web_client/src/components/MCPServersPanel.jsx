import { useState, useEffect, useRef } from 'react'
import { Server, RefreshCw, ChevronRight, ChevronDown, Plus, Trash2 } from 'lucide-react'
import { createAPIClient } from '../api/client'
import { getAgentCoreSessionId } from '../utils/authUtils'

function MCPServersPanel({ serverUrl, disabled, isActive, currentProject }) {
  const [mcpServers, setMcpServers] = useState({})
  const [mcpConfigPath, setMcpConfigPath] = useState('')
  const [configExists, setConfigExists] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [expandedServers, setExpandedServers] = useState(new Set())
  const [showAddForm, setShowAddForm] = useState(false)
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const apiClientRef = useRef(null)
  const previousActiveRef = useRef(false)

  // Form state for adding new server
  const [newServer, setNewServer] = useState({
    name: '',
    type: 'stdio',
    command: '',
    args: [],
    env: {},
    url: ''
  })
  const [newArg, setNewArg] = useState('')
  const [newEnvKey, setNewEnvKey] = useState('')
  const [newEnvValue, setNewEnvValue] = useState('')

  // Create API client
  useEffect(() => {
    if (disabled) {
      setMcpServers({})
      return
    }

    const initApiClient = async () => {
      if (serverUrl && (!apiClientRef.current || apiClientRef.current.baseUrl !== serverUrl)) {
        const agentCoreSessionId = await getAgentCoreSessionId(currentProject)
        apiClientRef.current = createAPIClient(serverUrl, agentCoreSessionId)
      }
    }
    initApiClient()
  }, [serverUrl, disabled, currentProject])

  // Auto-refresh when tab becomes active
  useEffect(() => {
    if (disabled) {
      previousActiveRef.current = isActive
      return
    }

    // Check if tab just became active (transition from false to true)
    if (isActive && !previousActiveRef.current) {
      const timer = setTimeout(() => {
        if (apiClientRef.current) {
          loadMCPServers()
        }
      }, 100)

      previousActiveRef.current = isActive
      return () => clearTimeout(timer)
    }

    previousActiveRef.current = isActive
  }, [isActive, disabled])

  const loadMCPServers = async () => {
    if (!apiClientRef.current) return

    setLoading(true)
    setError(null)

    try {
      const data = await apiClientRef.current.listMCPServers()
      setMcpServers(data.servers || {})
      setMcpConfigPath(data.mcp_config_path || '')
      setConfigExists(data.exists || false)
    } catch (err) {
      console.error('Failed to load MCP servers:', err)
      setError(err.message)
      setMcpServers({})
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = () => {
    loadMCPServers()
  }

  const toggleServerExpanded = (serverName) => {
    setExpandedServers(prev => {
      const newSet = new Set(prev)
      if (newSet.has(serverName)) {
        newSet.delete(serverName)
      } else {
        newSet.add(serverName)
      }
      return newSet
    })
  }

  const handleAddServer = async (e) => {
    e.preventDefault()

    // Validate based on type
    if (!newServer.name.trim()) {
      alert('Server name is required')
      return
    }

    if (newServer.type === 'stdio') {
      if (!newServer.command.trim()) {
        alert('Command is required for stdio type')
        return
      }
    } else if (newServer.type === 'sse' || newServer.type === 'http') {
      if (!newServer.url.trim()) {
        alert(`URL is required for ${newServer.type} type`)
        return
      }
    }

    setAdding(true)
    try {
      await apiClientRef.current.addMCPServer(
        newServer.name.trim(),
        newServer.type,
        newServer.command.trim() || null,
        newServer.args,
        newServer.env,
        newServer.url.trim() || null
      )

      // Reset form
      setNewServer({
        name: '',
        type: 'stdio',
        command: '',
        args: [],
        env: {},
        url: ''
      })
      setNewArg('')
      setNewEnvKey('')
      setNewEnvValue('')
      setShowAddForm(false)

      // Reload servers
      await loadMCPServers()
    } catch (err) {
      console.error('Failed to add MCP server:', err)
      alert(`Failed to add server: ${err.message}`)
    } finally {
      setAdding(false)
    }
  }

  const handleDeleteServer = async (serverName) => {
    if (!confirm(`Delete MCP server "${serverName}"?`)) {
      return
    }

    setDeleting(serverName)
    try {
      await apiClientRef.current.deleteMCPServer(serverName)
      // Reload servers
      await loadMCPServers()
    } catch (err) {
      console.error('Failed to delete MCP server:', err)
      alert(`Failed to delete server: ${err.message}`)
    } finally {
      setDeleting(null)
    }
  }

  const addArg = () => {
    if (newArg.trim()) {
      setNewServer(prev => ({
        ...prev,
        args: [...prev.args, newArg.trim()]
      }))
      setNewArg('')
    }
  }

  const removeArg = (index) => {
    setNewServer(prev => ({
      ...prev,
      args: prev.args.filter((_, i) => i !== index)
    }))
  }

  const addEnv = () => {
    if (newEnvKey.trim()) {
      setNewServer(prev => ({
        ...prev,
        env: { ...prev.env, [newEnvKey.trim()]: newEnvValue.trim() }
      }))
      setNewEnvKey('')
      setNewEnvValue('')
    }
  }

  const removeEnv = (key) => {
    setNewServer(prev => {
      const newEnv = { ...prev.env }
      delete newEnv[key]
      return { ...prev, env: newEnv }
    })
  }

  const serverCount = Object.keys(mcpServers).length

  return (
    <div className="mcp-servers-panel">
      <div className="mcp-servers-panel-header">
        <h2>MCP Servers</h2>
        <div className="mcp-servers-panel-actions">
          <button
            className="btn-icon btn-small"
            onClick={handleRefresh}
            disabled={loading || disabled}
            title="Refresh MCP servers"
          >
            <RefreshCw size={14} className={loading ? 'spinning' : ''} />
          </button>
          <button
            className="btn-icon btn-small"
            onClick={() => setShowAddForm(!showAddForm)}
            disabled={disabled}
            title="Add new MCP server"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {showAddForm && (
        <div className="mcp-add-form">
          <form onSubmit={handleAddServer}>
            <div className="form-row">
              <input
                type="text"
                placeholder="Server name (e.g., chrome-devtools)"
                value={newServer.name}
                onChange={(e) => setNewServer(prev => ({ ...prev, name: e.target.value }))}
                disabled={adding}
                required
              />
            </div>

            <div className="form-row">
              <select
                value={newServer.type}
                onChange={(e) => setNewServer(prev => ({ ...prev, type: e.target.value }))}
                disabled={adding}
              >
                <option value="stdio">stdio - Local process</option>
                <option value="sse">sse - Server-Sent Events</option>
                <option value="http">http - HTTP service</option>
              </select>
            </div>

            {newServer.type === 'stdio' ? (
              <>
                <div className="form-row">
                  <input
                    type="text"
                    placeholder="Command (e.g., npx)"
                    value={newServer.command}
                    onChange={(e) => setNewServer(prev => ({ ...prev, command: e.target.value }))}
                    disabled={adding}
                    required
                  />
                </div>

                <div className="form-section">
                  <label>Arguments</label>
              <div className="form-list">
                {newServer.args.map((arg, idx) => (
                  <div key={idx} className="form-list-item">
                    <code>{arg}</code>
                    <button
                      type="button"
                      className="btn-icon btn-small"
                      onClick={() => removeArg(idx)}
                      disabled={adding}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
                <div className="form-list-add">
                  <input
                    type="text"
                    placeholder="Add argument"
                    value={newArg}
                    onChange={(e) => setNewArg(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addArg())}
                    disabled={adding}
                  />
                  <button
                    type="button"
                    className="btn-secondary btn-small"
                    onClick={addArg}
                    disabled={adding || !newArg.trim()}
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>

                <div className="form-section">
                  <label>Environment Variables (Optional)</label>
                  <div className="form-list">
                    {Object.entries(newServer.env).map(([key, value]) => (
                      <div key={key} className="form-list-item">
                        <code>{key}={value}</code>
                        <button
                          type="button"
                          className="btn-icon btn-small"
                          onClick={() => removeEnv(key)}
                          disabled={adding}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                    <div className="form-list-add">
                      <input
                        type="text"
                        placeholder="Key"
                        value={newEnvKey}
                        onChange={(e) => setNewEnvKey(e.target.value)}
                        disabled={adding}
                        style={{ flex: '1' }}
                      />
                      <input
                        type="text"
                        placeholder="Value"
                        value={newEnvValue}
                        onChange={(e) => setNewEnvValue(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addEnv())}
                        disabled={adding}
                        style={{ flex: '1' }}
                      />
                      <button
                        type="button"
                        className="btn-secondary btn-small"
                        onClick={addEnv}
                        disabled={adding || !newEnvKey.trim()}
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="form-row">
                <input
                  type="url"
                  placeholder="URL (e.g., http://localhost:3000/sse)"
                  value={newServer.url}
                  onChange={(e) => setNewServer(prev => ({ ...prev, url: e.target.value }))}
                  disabled={adding}
                  required
                />
              </div>
            )}

            <div className="form-actions">
              <button
                type="submit"
                className="btn-primary btn-small"
                disabled={
                  adding ||
                  !newServer.name.trim() ||
                  (newServer.type === 'stdio' && !newServer.command.trim()) ||
                  ((newServer.type === 'sse' || newServer.type === 'http') && !newServer.url.trim())
                }
              >
                {adding ? 'Adding...' : 'Add Server'}
              </button>
              <button
                type="button"
                className="btn-secondary btn-small"
                onClick={() => {
                  setShowAddForm(false)
                  setNewServer({
                    name: '',
                    type: 'stdio',
                    command: '',
                    args: [],
                    env: {},
                    url: ''
                  })
                  setNewArg('')
                  setNewEnvKey('')
                  setNewEnvValue('')
                }}
                disabled={adding}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="mcp-servers-info">
        <small>Config: {mcpConfigPath}</small>
        {configExists && <small style={{ color: 'var(--success-color)' }}>✓ Found {serverCount} server{serverCount !== 1 ? 's' : ''}</small>}
        {!configExists && !loading && <small style={{ color: 'var(--warning-color)' }}>⚠ Config file not found</small>}
      </div>

      <div className="mcp-servers-list-container">
        {loading && serverCount === 0 ? (
          <div className="mcp-servers-loading">
            <RefreshCw size={24} className="spinning" />
            <p>Loading MCP servers...</p>
          </div>
        ) : error ? (
          <div className="mcp-servers-error">
            <p style={{ color: 'var(--danger-color)' }}>Error: {error}</p>
          </div>
        ) : !configExists ? (
          <div className="mcp-servers-empty">
            <Server size={48} style={{ opacity: 0.3 }} />
            <p>No MCP configuration found</p>
            <small>Create {mcpConfigPath} to configure MCP servers</small>
          </div>
        ) : serverCount === 0 ? (
          <div className="mcp-servers-empty">
            <Server size={48} style={{ opacity: 0.3 }} />
            <p>No MCP servers configured</p>
            <small>Add servers to {mcpConfigPath}</small>
          </div>
        ) : (
          <div className="mcp-servers-list">
            {Object.entries(mcpServers).map(([name, config]) => {
              const isExpanded = expandedServers.has(name)
              return (
                <div key={name} className="mcp-server-item">
                  <div className="mcp-server-header-row">
                    <button
                      className="mcp-server-header"
                      onClick={() => toggleServerExpanded(name)}
                    >
                      <div className="mcp-server-name">
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <span>{name}</span>
                      </div>
                      <span className="mcp-server-type">{config.type}</span>
                    </button>
                    <button
                      className="btn-icon btn-small mcp-delete-btn"
                      onClick={() => handleDeleteServer(name)}
                      disabled={deleting === name || disabled}
                      title="Delete server"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="mcp-server-details">
                      {config.type === 'stdio' ? (
                        <>
                          {config.command && (
                            <div className="mcp-server-detail-row">
                              <span className="mcp-server-detail-label">Command:</span>
                              <code>{config.command}</code>
                            </div>
                          )}

                          {config.args && config.args.length > 0 && (
                            <div className="mcp-server-detail-row">
                              <span className="mcp-server-detail-label">Arguments:</span>
                              <div className="mcp-server-args">
                                {config.args.map((arg, idx) => (
                                  <code key={idx}>{arg}</code>
                                ))}
                              </div>
                            </div>
                          )}

                          {config.env && Object.keys(config.env).length > 0 && (
                            <div className="mcp-server-detail-row">
                              <span className="mcp-server-detail-label">Environment:</span>
                              <div className="mcp-server-env">
                                {Object.entries(config.env).map(([key, value]) => (
                                  <div key={key} className="mcp-server-env-var">
                                    <code>{key}={value}</code>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          {config.url && (
                            <div className="mcp-server-detail-row">
                              <span className="mcp-server-detail-label">URL:</span>
                              <code>{config.url}</code>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default MCPServersPanel
