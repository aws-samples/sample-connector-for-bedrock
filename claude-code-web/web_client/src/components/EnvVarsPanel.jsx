import { useState, useEffect, useRef } from 'react'
import { Settings, RefreshCw, ChevronRight, ChevronDown, Plus, Trash2, Eye, EyeOff, Save } from 'lucide-react'
import { createAPIClient } from '../api/client'
import { getAgentCoreSessionId } from '../utils/authUtils'

function EnvVarsPanel({ serverUrl, disabled, isActive, currentProject }) {
  const [envVars, setEnvVars] = useState({})
  const [settingsPath, setSettingsPath] = useState('')
  const [configExists, setConfigExists] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [expandedVars, setExpandedVars] = useState(new Set())
  const [showAddForm, setShowAddForm] = useState(false)
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [showValues, setShowValues] = useState(new Set())
  const apiClientRef = useRef(null)
  const previousActiveRef = useRef(false)

  // Form state for adding new variable
  const [newVar, setNewVar] = useState({
    key: '',
    value: ''
  })

  // Edit mode state
  const [editingKey, setEditingKey] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)

  // Create API client
  useEffect(() => {
    if (disabled) {
      setEnvVars({})
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
          loadEnvVars()
        }
      }, 100)

      previousActiveRef.current = isActive
      return () => clearTimeout(timer)
    }

    previousActiveRef.current = isActive
  }, [isActive, disabled])

  const loadEnvVars = async () => {
    if (!apiClientRef.current) return

    setLoading(true)
    setError(null)

    try {
      const data = await apiClientRef.current.listEnvVars()
      setEnvVars(data.env_vars || {})
      setSettingsPath(data.settings_path || '')
      setConfigExists(data.exists || false)
    } catch (err) {
      console.error('Failed to load environment variables:', err)
      setError(err.message)
      setEnvVars({})
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = () => {
    loadEnvVars()
  }

  const toggleVarExpanded = (key) => {
    setExpandedVars(prev => {
      const newSet = new Set(prev)
      if (newSet.has(key)) {
        newSet.delete(key)
      } else {
        newSet.add(key)
      }
      return newSet
    })
  }

  const toggleShowValue = (key) => {
    setShowValues(prev => {
      const newSet = new Set(prev)
      if (newSet.has(key)) {
        newSet.delete(key)
      } else {
        newSet.add(key)
      }
      return newSet
    })
  }

  const handleAddVar = async (e) => {
    e.preventDefault()

    if (!newVar.key.trim()) {
      alert('Variable name is required')
      return
    }

    setAdding(true)
    try {
      await apiClientRef.current.setEnvVar(newVar.key.trim(), newVar.value)

      // Reset form
      setNewVar({ key: '', value: '' })
      setShowAddForm(false)

      // Reload variables
      await loadEnvVars()
    } catch (err) {
      console.error('Failed to add environment variable:', err)
      alert(`Failed to add variable: ${err.message}`)
    } finally {
      setAdding(false)
    }
  }

  const handleDeleteVar = async (key) => {
    if (!confirm(`Delete environment variable "${key}"?`)) {
      return
    }

    setDeleting(key)
    try {
      await apiClientRef.current.deleteEnvVar(key)
      // Reload variables
      await loadEnvVars()
    } catch (err) {
      console.error('Failed to delete environment variable:', err)
      alert(`Failed to delete variable: ${err.message}`)
    } finally {
      setDeleting(null)
    }
  }

  const handleStartEdit = (key, value) => {
    setEditingKey(key)
    setEditValue(value)
  }

  const handleCancelEdit = () => {
    setEditingKey(null)
    setEditValue('')
  }

  const handleSaveEdit = async (key) => {
    setSaving(true)
    try {
      await apiClientRef.current.setEnvVar(key, editValue)
      setEditingKey(null)
      setEditValue('')
      await loadEnvVars()
    } catch (err) {
      console.error('Failed to update environment variable:', err)
      alert(`Failed to update variable: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  const maskValue = (value) => {
    if (!value) return ''
    if (value.length <= 8) return '*'.repeat(value.length)
    return value.substring(0, 4) + '*'.repeat(Math.min(value.length - 8, 20)) + value.substring(value.length - 4)
  }

  const varCount = Object.keys(envVars).length

  return (
    <div className="env-vars-panel">
      <div className="env-vars-panel-header">
        <h2>Environment Variables</h2>
        <div className="env-vars-panel-actions">
          <button
            className="btn-icon btn-small"
            onClick={handleRefresh}
            disabled={loading || disabled}
            title="Refresh environment variables"
          >
            <RefreshCw size={14} className={loading ? 'spinning' : ''} />
          </button>
          <button
            className="btn-icon btn-small"
            onClick={() => setShowAddForm(!showAddForm)}
            disabled={disabled}
            title="Add new environment variable"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {showAddForm && (
        <div className="env-vars-add-form">
          <form onSubmit={handleAddVar}>
            <div className="form-row">
              <input
                type="text"
                placeholder="Variable name (e.g., API_KEY)"
                value={newVar.key}
                onChange={(e) => setNewVar(prev => ({ ...prev, key: e.target.value }))}
                disabled={adding}
                required
              />
            </div>

            <div className="form-row">
              <input
                type="text"
                placeholder="Value"
                value={newVar.value}
                onChange={(e) => setNewVar(prev => ({ ...prev, value: e.target.value }))}
                disabled={adding}
              />
            </div>

            <div className="form-actions">
              <button
                type="submit"
                className="btn-primary btn-small"
                disabled={adding || !newVar.key.trim()}
              >
                {adding ? 'Adding...' : 'Add Variable'}
              </button>
              <button
                type="button"
                className="btn-secondary btn-small"
                onClick={() => {
                  setShowAddForm(false)
                  setNewVar({ key: '', value: '' })
                }}
                disabled={adding}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="env-vars-info">
        <small>Config: {settingsPath}</small>
        {configExists && <small style={{ color: 'var(--success-color)' }}>Found {varCount} variable{varCount !== 1 ? 's' : ''}</small>}
        {!configExists && !loading && <small style={{ color: 'var(--warning-color)' }}>Config file not found</small>}
      </div>

      <div className="env-vars-list-container">
        {loading && varCount === 0 ? (
          <div className="env-vars-loading">
            <RefreshCw size={24} className="spinning" />
            <p>Loading environment variables...</p>
          </div>
        ) : error ? (
          <div className="env-vars-error">
            <p style={{ color: 'var(--danger-color)' }}>Error: {error}</p>
          </div>
        ) : varCount === 0 ? (
          <div className="env-vars-empty">
            <Settings size={48} style={{ opacity: 0.3 }} />
            <p>No environment variables configured</p>
            <small>Click + to add variables to {settingsPath}</small>
          </div>
        ) : (
          <div className="env-vars-list">
            {Object.entries(envVars).map(([key, value]) => {
              const isExpanded = expandedVars.has(key)
              const isValueShown = showValues.has(key)
              const isEditing = editingKey === key

              return (
                <div key={key} className="env-var-item">
                  <div className="env-var-header-row">
                    <button
                      className="env-var-header"
                      onClick={() => toggleVarExpanded(key)}
                    >
                      <div className="env-var-name">
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <span>{key}</span>
                      </div>
                    </button>
                    <div className="env-var-actions">
                      <button
                        className="btn-icon btn-small"
                        onClick={() => toggleShowValue(key)}
                        title={isValueShown ? 'Hide value' : 'Show value'}
                      >
                        {isValueShown ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                      <button
                        className="btn-icon btn-small env-delete-btn"
                        onClick={() => handleDeleteVar(key)}
                        disabled={deleting === key || disabled}
                        title="Delete variable"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="env-var-details">
                      {isEditing ? (
                        <div className="env-var-edit">
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            disabled={saving}
                            className="env-var-edit-input"
                          />
                          <div className="env-var-edit-actions">
                            <button
                              className="btn-primary btn-small"
                              onClick={() => handleSaveEdit(key)}
                              disabled={saving}
                            >
                              {saving ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              className="btn-secondary btn-small"
                              onClick={handleCancelEdit}
                              disabled={saving}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="env-var-value-row">
                          <code className="env-var-value">
                            {isValueShown ? value : maskValue(value)}
                          </code>
                          <button
                            className="btn-icon btn-small"
                            onClick={() => handleStartEdit(key, value)}
                            title="Edit value"
                          >
                            <Save size={14} />
                          </button>
                        </div>
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

export default EnvVarsPanel
