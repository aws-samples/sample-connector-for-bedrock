import { useState, useEffect, useRef } from 'react'
import {
  Package,
  Store,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  X,
  Check,
  ExternalLink,
  Tag,
  User,
  Clock,
  Info
} from 'lucide-react'
import { createAPIClient } from '../api/client'
import { getAgentCoreSessionId } from '../utils/authUtils'
import './PluginsPanel.css'

function PluginsPanel({ serverUrl, disabled, isActive, currentProject }) {
  const [marketplaces, setMarketplaces] = useState([])
  const [installedPlugins, setInstalledPlugins] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [expandedMarketplaces, setExpandedMarketplaces] = useState(new Set())
  const [selectedPlugin, setSelectedPlugin] = useState(null)
  const [showAddMarketplace, setShowAddMarketplace] = useState(false)
  const [newMarketplace, setNewMarketplace] = useState({ name: '', gitUrl: '' })
  const [addingMarketplace, setAddingMarketplace] = useState(false)
  const [deletingMarketplace, setDeletingMarketplace] = useState(null)
  const [updatingMarketplace, setUpdatingMarketplace] = useState(null)
  const [enablingPlugin, setEnablingPlugin] = useState(null)
  const [disablingPlugin, setDisablingPlugin] = useState(null)
  const apiClientRef = useRef(null)
  const previousActiveRef = useRef(false)

  useEffect(() => {
    if (disabled) {
      setMarketplaces([])
      setInstalledPlugins({})
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

  useEffect(() => {
    if (disabled) {
      previousActiveRef.current = isActive
      return
    }

    if (isActive && !previousActiveRef.current) {
      const timer = setTimeout(() => {
        if (apiClientRef.current) {
          loadPlugins()
        }
      }, 100)

      previousActiveRef.current = isActive
      return () => clearTimeout(timer)
    }

    previousActiveRef.current = isActive
  }, [isActive, disabled])

  const loadPlugins = async () => {
    if (!apiClientRef.current) return

    setLoading(true)
    setError(null)

    try {
      const data = await apiClientRef.current.listPlugins()
      setMarketplaces(data.marketplaces || [])
      setInstalledPlugins(data.installed_plugins || {})
    } catch (err) {
      console.error('Failed to load plugins:', err)
      setError(err.message)
      setMarketplaces([])
      setInstalledPlugins({})
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = () => {
    loadPlugins()
  }

  const toggleMarketplace = (marketplaceName) => {
    setExpandedMarketplaces(prev => {
      const newSet = new Set(prev)
      if (newSet.has(marketplaceName)) {
        newSet.delete(marketplaceName)
      } else {
        newSet.add(marketplaceName)
      }
      return newSet
    })
  }

  const isPluginInstalled = (pluginName, marketplaceName) => {
    const key = `${pluginName}@${marketplaceName}`
    return key in installedPlugins
  }

  const handleAddMarketplace = async (e) => {
    e.preventDefault()
    if (!newMarketplace.name.trim() || !newMarketplace.gitUrl.trim()) {
      alert('Both name and Git URL are required')
      return
    }

    setAddingMarketplace(true)
    try {
      await apiClientRef.current.addMarketplace(
        newMarketplace.name.trim(),
        newMarketplace.gitUrl.trim()
      )
      setNewMarketplace({ name: '', gitUrl: '' })
      setShowAddMarketplace(false)
      await loadPlugins()
    } catch (err) {
      console.error('Failed to add marketplace:', err)
      alert(`Failed to add marketplace: ${err.message}`)
    } finally {
      setAddingMarketplace(false)
    }
  }

  const handleDeleteMarketplace = async (marketplaceName) => {
    if (!confirm(`Delete marketplace "${marketplaceName}"?\n\nThis will remove the marketplace and all its installed plugins.`)) {
      return
    }

    setDeletingMarketplace(marketplaceName)
    try {
      await apiClientRef.current.deleteMarketplace(marketplaceName)
      await loadPlugins()
    } catch (err) {
      console.error('Failed to delete marketplace:', err)
      alert(`Failed to delete marketplace: ${err.message}`)
    } finally {
      setDeletingMarketplace(null)
    }
  }

  const handleUpdateMarketplace = async (marketplaceName) => {
    setUpdatingMarketplace(marketplaceName)
    try {
      await apiClientRef.current.updateMarketplace(marketplaceName)
      await loadPlugins()
    } catch (err) {
      console.error('Failed to update marketplace:', err)
      alert(`Failed to update marketplace: ${err.message}`)
    } finally {
      setUpdatingMarketplace(null)
    }
  }

  const handleEnablePlugin = async (pluginName, marketplaceName) => {
    const key = `${pluginName}@${marketplaceName}`
    setEnablingPlugin(key)
    try {
      await apiClientRef.current.installPlugin(pluginName, marketplaceName)
      await loadPlugins()
    } catch (err) {
      console.error('Failed to enable plugin:', err)
      alert(`Failed to enable plugin: ${err.message}`)
    } finally {
      setEnablingPlugin(null)
    }
  }

  const handleDisablePlugin = async (pluginName, marketplaceName) => {
    const key = `${pluginName}@${marketplaceName}`

    setDisablingPlugin(key)
    try {
      await apiClientRef.current.uninstallPlugin(key)
      await loadPlugins()
    } catch (err) {
      console.error('Failed to disable plugin:', err)
      alert(`Failed to disable plugin: ${err.message}`)
    } finally {
      setDisablingPlugin(null)
    }
  }

  const handlePluginClick = (plugin, marketplaceName) => {
    setSelectedPlugin({ ...plugin, marketplaceName })
  }

  const closePluginDetail = () => {
    setSelectedPlugin(null)
  }

  const getCategoryColor = (category) => {
    const colors = {
      development: '#3b82f6',
      productivity: '#10b981',
      security: '#ef4444',
      testing: '#f59e0b',
      database: '#8b5cf6',
      design: '#ec4899',
      monitoring: '#06b6d4',
      deployment: '#84cc16',
      learning: '#6366f1'
    }
    return colors[category] || '#6b7280'
  }

  const marketplaceCount = marketplaces.length
  const totalPlugins = marketplaces.reduce((sum, m) => sum + (m.plugins?.length || 0), 0)
  const enabledCount = Object.keys(installedPlugins).length

  return (
    <div className="plugins-panel">
      <div className="plugins-panel-header">
        <h2>Plugins</h2>
        <div className="plugins-panel-actions">
          <button
            className="btn-icon btn-small"
            onClick={handleRefresh}
            disabled={loading || disabled}
            title="Refresh plugins"
          >
            <RefreshCw size={14} className={loading ? 'spinning' : ''} />
          </button>
          <button
            className="btn-icon btn-small"
            onClick={() => setShowAddMarketplace(!showAddMarketplace)}
            disabled={disabled}
            title="Add marketplace"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {showAddMarketplace && (
        <div className="plugins-add-form">
          <form onSubmit={handleAddMarketplace}>
            <div className="form-row">
              <input
                type="text"
                placeholder="Marketplace name (e.g., my-plugins)"
                value={newMarketplace.name}
                onChange={(e) => setNewMarketplace(prev => ({ ...prev, name: e.target.value }))}
                disabled={addingMarketplace}
                required
              />
            </div>
            <div className="form-row">
              <input
                type="text"
                placeholder="Git URL (e.g., https://github.com/owner/repo.git)"
                value={newMarketplace.gitUrl}
                onChange={(e) => setNewMarketplace(prev => ({ ...prev, gitUrl: e.target.value }))}
                disabled={addingMarketplace}
                required
              />
            </div>
            <div className="form-actions">
              <button
                type="submit"
                className="btn-primary btn-small"
                disabled={addingMarketplace || !newMarketplace.name.trim() || !newMarketplace.gitUrl.trim()}
              >
                {addingMarketplace ? 'Adding...' : 'Add Marketplace'}
              </button>
              <button
                type="button"
                className="btn-secondary btn-small"
                onClick={() => {
                  setShowAddMarketplace(false)
                  setNewMarketplace({ name: '', gitUrl: '' })
                }}
                disabled={addingMarketplace}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="plugins-info">
        <small>{marketplaceCount} marketplace{marketplaceCount !== 1 ? 's' : ''} | {totalPlugins} plugin{totalPlugins !== 1 ? 's' : ''} | {enabledCount} enabled</small>
      </div>

      <div className="plugins-list-container">
        {loading && marketplaceCount === 0 ? (
          <div className="plugins-loading">
            <RefreshCw size={24} className="spinning" />
            <p>Loading plugins...</p>
          </div>
        ) : error ? (
          <div className="plugins-error">
            <p style={{ color: 'var(--danger-color)' }}>Error: {error}</p>
          </div>
        ) : marketplaceCount === 0 ? (
          <div className="plugins-empty">
            <Store size={48} style={{ opacity: 0.3 }} />
            <p>No marketplaces configured</p>
            <small>Click + to add a marketplace</small>
          </div>
        ) : (
          <div className="plugins-list">
            {marketplaces.map((marketplace) => {
              const isExpanded = expandedMarketplaces.has(marketplace.name)
              const pluginCount = marketplace.plugins?.length || 0
              const enabledInMarketplace = marketplace.plugins?.filter(
                p => isPluginInstalled(p.name, marketplace.name)
              ).length || 0

              return (
                <div key={marketplace.name} className="marketplace-item">
                  <div className="marketplace-header-row">
                    <button
                      className="marketplace-header"
                      onClick={() => toggleMarketplace(marketplace.name)}
                    >
                      <div className="marketplace-name">
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <Store size={14} />
                        <span>{marketplace.name}</span>
                        <span className={`marketplace-count ${enabledInMarketplace > 0 ? 'has-enabled' : ''}`}>
                          ({enabledInMarketplace}/{pluginCount})
                        </span>
                      </div>
                    </button>
                    <div className="marketplace-actions">
                      <button
                        className="btn-icon btn-small"
                        onClick={() => handleUpdateMarketplace(marketplace.name)}
                        disabled={updatingMarketplace === marketplace.name || disabled}
                        title="Update marketplace"
                      >
                        <RefreshCw size={12} className={updatingMarketplace === marketplace.name ? 'spinning' : ''} />
                      </button>
                      <button
                        className="btn-icon btn-small btn-danger"
                        onClick={() => handleDeleteMarketplace(marketplace.name)}
                        disabled={deletingMarketplace === marketplace.name || disabled}
                        title="Delete marketplace"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="marketplace-plugins">
                      {marketplace.description && (
                        <div className="marketplace-description">{marketplace.description}</div>
                      )}
                      {marketplace.plugins?.length === 0 ? (
                        <div className="no-plugins">No plugins available</div>
                      ) : (
                        marketplace.plugins?.map((plugin) => {
                          const enabled = isPluginInstalled(plugin.name, marketplace.name)
                          const key = `${plugin.name}@${marketplace.name}`
                          const isEnabling = enablingPlugin === key
                          const isDisabling = disablingPlugin === key

                          return (
                            <div key={plugin.name} className={`plugin-item ${enabled ? 'enabled' : ''}`}>
                              <div className="plugin-main" onClick={() => handlePluginClick(plugin, marketplace.name)}>
                                <div className="plugin-info">
                                  <div className="plugin-name">
                                    <Package size={14} />
                                    <span>{plugin.name}</span>
                                    {plugin.category && (
                                      <span
                                        className="plugin-category"
                                        style={{ backgroundColor: getCategoryColor(plugin.category) }}
                                      >
                                        {plugin.category}
                                      </span>
                                    )}
                                  </div>
                                  {plugin.description && (
                                    <div className="plugin-description">{plugin.description}</div>
                                  )}
                                </div>
                                <div className="plugin-actions" onClick={(e) => e.stopPropagation()}>
                                  {enabled ? (
                                    <button
                                      className="btn-small btn-enabled"
                                      onClick={() => handleDisablePlugin(plugin.name, marketplace.name)}
                                      disabled={isDisabling || disabled}
                                      title="Disable plugin"
                                    >
                                      {isDisabling ? (
                                        <RefreshCw size={12} className="spinning" />
                                      ) : (
                                        <ToggleRight size={16} />
                                      )}
                                    </button>
                                  ) : (
                                    <button
                                      className="btn-small btn-disabled-state"
                                      onClick={() => handleEnablePlugin(plugin.name, marketplace.name)}
                                      disabled={isEnabling || disabled}
                                      title="Enable plugin"
                                    >
                                      {isEnabling ? (
                                        <RefreshCw size={12} className="spinning" />
                                      ) : (
                                        <ToggleLeft size={16} />
                                      )}
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {selectedPlugin && (
        <div className="plugin-detail-overlay" onClick={closePluginDetail}>
          <div className="plugin-detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="plugin-detail-header">
              <h3>
                <Package size={18} />
                {selectedPlugin.name}
              </h3>
              <button className="btn-icon" onClick={closePluginDetail}>
                <X size={18} />
              </button>
            </div>
            <div className="plugin-detail-content">
              {selectedPlugin.description && (
                <div className="detail-section">
                  <div className="detail-row">
                    <Info size={14} />
                    <span>{selectedPlugin.description}</span>
                  </div>
                </div>
              )}

              <div className="detail-section">
                {selectedPlugin.category && (
                  <div className="detail-row">
                    <Tag size={14} />
                    <span className="detail-label">Category:</span>
                    <span
                      className="plugin-category"
                      style={{ backgroundColor: getCategoryColor(selectedPlugin.category) }}
                    >
                      {selectedPlugin.category}
                    </span>
                  </div>
                )}

                {selectedPlugin.version && (
                  <div className="detail-row">
                    <span className="detail-label">Version:</span>
                    <span>{selectedPlugin.version}</span>
                  </div>
                )}

                {selectedPlugin.author && (
                  <div className="detail-row">
                    <User size={14} />
                    <span className="detail-label">Author:</span>
                    <span>{selectedPlugin.author.name || selectedPlugin.author}</span>
                  </div>
                )}

                <div className="detail-row">
                  <Store size={14} />
                  <span className="detail-label">Marketplace:</span>
                  <span>{selectedPlugin.marketplaceName}</span>
                </div>

                {selectedPlugin.homepage && (
                  <div className="detail-row">
                    <ExternalLink size={14} />
                    <span className="detail-label">Homepage:</span>
                    <a href={selectedPlugin.homepage} target="_blank" rel="noopener noreferrer">
                      {selectedPlugin.homepage}
                    </a>
                  </div>
                )}

                {selectedPlugin.tags && selectedPlugin.tags.length > 0 && (
                  <div className="detail-row">
                    <Tag size={14} />
                    <span className="detail-label">Tags:</span>
                    <div className="plugin-tags">
                      {selectedPlugin.tags.map((tag, idx) => (
                        <span key={idx} className="plugin-tag">{tag}</span>
                      ))}
                    </div>
                  </div>
                )}

                {selectedPlugin.skills && selectedPlugin.skills.length > 0 && (
                  <div className="detail-row">
                    <span className="detail-label">Skills:</span>
                    <div className="plugin-skills">
                      {selectedPlugin.skills.map((skill, idx) => (
                        <code key={idx}>{skill}</code>
                      ))}
                    </div>
                  </div>
                )}

                {selectedPlugin.lsp_servers && Object.keys(selectedPlugin.lsp_servers).length > 0 && (
                  <div className="detail-row">
                    <span className="detail-label">LSP Servers:</span>
                    <div className="plugin-lsp">
                      {Object.keys(selectedPlugin.lsp_servers).map((server, idx) => (
                        <code key={idx}>{server}</code>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="detail-actions">
                {isPluginInstalled(selectedPlugin.name, selectedPlugin.marketplaceName) ? (
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      handleDisablePlugin(selectedPlugin.name, selectedPlugin.marketplaceName)
                      closePluginDetail()
                    }}
                    disabled={disabled}
                  >
                    <ToggleLeft size={14} />
                    Disable
                  </button>
                ) : (
                  <button
                    className="btn-primary"
                    onClick={() => {
                      handleEnablePlugin(selectedPlugin.name, selectedPlugin.marketplaceName)
                      closePluginDetail()
                    }}
                    disabled={disabled}
                  >
                    <ToggleRight size={14} />
                    Enable
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default PluginsPanel
