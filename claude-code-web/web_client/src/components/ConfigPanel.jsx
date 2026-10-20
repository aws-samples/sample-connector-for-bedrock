import { useState } from 'react'

function ConfigPanel({ onConnect, connecting }) {
  const [config, setConfig] = useState({
    serverUrl: 'http://127.0.0.1:8000',
    model: '',
    backgroundModel: '',
    enableProxy: false,
    cwd: ''
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    onConnect(config)
  }

  const handleChange = (field, value) => {
    setConfig(prev => ({ ...prev, [field]: value }))
  }

  return (
    <div className="config-panel">
      <h2>Session Configuration</h2>

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="serverUrl">Server URL:</label>
          <input
            type="text"
            id="serverUrl"
            value={config.serverUrl}
            onChange={(e) => handleChange('serverUrl', e.target.value)}
            placeholder="http://127.0.0.1:8000"
          />
        </div>

        <div className="form-group">
          <label htmlFor="model">Main Model:</label>
          <input
            type="text"
            id="model"
            value={config.model}
            onChange={(e) => handleChange('model', e.target.value)}
            placeholder="e.g., claude-3-5-sonnet-20241022 or gpt-4"
          />
        </div>

        <div className="form-group">
          <label htmlFor="backgroundModel">Background Model:</label>
          <input
            type="text"
            id="backgroundModel"
            value={config.backgroundModel}
            onChange={(e) => handleChange('backgroundModel', e.target.value)}
            placeholder="e.g., claude-3-5-haiku-20241022 or gpt-3.5-turbo"
          />
        </div>

        <div className="form-group">
          <label htmlFor="cwd">Working Directory:</label>
          <input
            type="text"
            id="cwd"
            value={config.cwd}
            onChange={(e) => handleChange('cwd', e.target.value)}
            placeholder="e.g., /workspace or /Users/name/project"
          />
          <small>Optional: Set the working directory for the session</small>
        </div>

        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={config.enableProxy}
              onChange={(e) => handleChange('enableProxy', e.target.checked)}
            />
            Enable Proxy Mode (for non-Claude models)
          </label>
        </div>

        <div className="form-actions">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={connecting}
          >
            {connecting ? 'Connecting...' : 'Connect'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default ConfigPanel
