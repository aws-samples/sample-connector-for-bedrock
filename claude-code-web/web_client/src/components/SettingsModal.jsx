import { useState, useEffect } from 'react'

function SettingsModal({ isOpen, onClose, settings, onSave }) {
  const [localSettings, setLocalSettings] = useState(settings)

  // Get available models from environment or use defaults
  const availableModels = import.meta.env.VITE_AVAILABLE_MODELS
    ? import.meta.env.VITE_AVAILABLE_MODELS.split(',')
    : [
        'global.anthropic.claude-sonnet-4-5-20250929-v1:0',
        'global.anthropic.claude-haiku-4-5-20251001-v1:0',
        'qwen.qwen3-coder-480b-a35b-v1:0'
      ]

  useEffect(() => {
    setLocalSettings(settings)
  }, [settings, isOpen])

  if (!isOpen) return null

  const handleChange = (key, value) => {
    setLocalSettings(prev => ({
      ...prev,
      [key]: value
    }))
  }

  const handleSave = () => {
    onSave(localSettings)
    onClose()
  }

  const handleCancel = () => {
    setLocalSettings(settings) // Reset to original settings
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={handleCancel}>
      <div className="modal-content settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="modal-close" onClick={handleCancel}>×</button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label htmlFor="settings-server-url">Server URL:</label>
            <input
              type="text"
              id="settings-server-url"
              value={localSettings.serverUrl}
              onChange={(e) => handleChange('serverUrl', e.target.value)}
              placeholder="http://127.0.0.1:8000"
            />
            <small>API server endpoint</small>
          </div>

          <div className="form-group">
            <label htmlFor="settings-cwd">Working Directory:</label>
            <input
              type="text"
              id="settings-cwd"
              value={localSettings.cwd}
              onChange={(e) => handleChange('cwd', e.target.value)}
              placeholder="/workspace"
            />
            <small>Default working directory for sessions</small>
          </div>

          <div className="form-group">
            <label htmlFor="settings-model">Main Model:</label>
            <select
              id="settings-model"
              value={localSettings.model || ''}
              onChange={(e) => handleChange('model', e.target.value)}
            >
              {availableModels.map(model => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
            <small>Select the main model for agent responses</small>
          </div>

          <div className="form-group">
            <label htmlFor="settings-background-model">Background Model:</label>
            <select
              id="settings-background-model"
              value={localSettings.backgroundModel || ''}
              onChange={(e) => handleChange('backgroundModel', e.target.value)}
            >
              {availableModels.map(model => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
            <small>Select the model for background tasks (proxy mode auto-detected)</small>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={handleCancel}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            Save Settings
          </button>
        </div>
      </div>
    </div>
  )
}

export default SettingsModal
