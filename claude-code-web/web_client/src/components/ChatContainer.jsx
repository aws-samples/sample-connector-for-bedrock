import { useState, useRef, useEffect } from 'react'
import { Send, X, Loader2, AlertTriangle, RefreshCw, Square } from 'lucide-react'
import Message from './Message'

function ChatContainer({
  sessionInfo,
  messages,
  onSendMessage,
  onDisconnect,
  onClearSession,
  onPermissionRespond,
  onQuestionAnswer,
  sessionError,
  onRetrySession,
  currentModel,
  onModelChange,
  onInterrupt,
  serverUrl,
  currentProject,
  selectedMcpServers,
  onMcpServersChange,
  sessionId
}) {
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [selectedModel, setSelectedModel] = useState(currentModel || '')
  const [isComposing, setIsComposing] = useState(false) // Track IME composition state
  const [inputHeight, setInputHeight] = useState(120) // Default 120px (3 rows * ~40px)
  const [isResizingInput, setIsResizingInput] = useState(false)
  const [isRunning, setIsRunning] = useState(false) // Track if assistant is currently responding
  const [availableMcpServers, setAvailableMcpServers] = useState({})
  const [showMcpSelector, setShowMcpSelector] = useState(false)
  const messagesEndRef = useRef(null)

  // Get available models from environment or use defaults
  const availableModels = import.meta.env.VITE_AVAILABLE_MODELS
    ? import.meta.env.VITE_AVAILABLE_MODELS.split(',')
    : [
        'global.anthropic.claude-sonnet-4-5-20250929-v1:0',
        'global.anthropic.claude-haiku-4-5-20251001-v1:0',
        'qwen.qwen3-coder-480b-a35b-v1:0'
      ]

  // Update selected model when currentModel prop changes
  useEffect(() => {
    if (currentModel) {
      setSelectedModel(currentModel)
    }
  }, [currentModel])

  // Load available MCP servers
  useEffect(() => {
    const loadMcpServers = async () => {
      if (!serverUrl) return

      try {
        const { createAPIClient } = await import('../api/client')
        const { getAgentCoreSessionId } = await import('../utils/authUtils')
        const agentCoreSessionId = await getAgentCoreSessionId(currentProject)
        const apiClient = createAPIClient(serverUrl, agentCoreSessionId)

        const data = await apiClient.listMCPServers()
        setAvailableMcpServers(data.servers || {})
      } catch (err) {
        console.error('Failed to load MCP servers:', err)
      }
    }

    loadMcpServers()
  }, [serverUrl, currentProject])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Detect if assistant is currently responding (streaming message)
  useEffect(() => {
    const lastMessage = messages[messages.length - 1]
    if (lastMessage && lastMessage.role === 'assistant' && lastMessage.streaming) {
      setIsRunning(true)
    } else {
      setIsRunning(false)
    }
  }, [messages])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!input.trim() || sending || isRunning) return

    setSending(true)
    setIsRunning(true)
    try {
      await onSendMessage(input)
      setInput('')
    } catch (error) {
      console.error('Failed to send message:', error)
    } finally {
      setSending(false)
    }
  }

  const handleStop = async () => {
    if (!isRunning) return

    try {
      await onInterrupt()
      setIsRunning(false)
    } catch (error) {
      console.error('Failed to stop:', error)
    }
  }

  const handleKeyDown = (e) => {
    // Don't send message if user is composing with IME (e.g., Chinese, Japanese input)
    if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  // Handle IME composition start (e.g., when user starts typing Chinese)
  const handleCompositionStart = () => {
    setIsComposing(true)
  }

  // Handle IME composition end (e.g., when user confirms the Chinese input)
  const handleCompositionEnd = () => {
    setIsComposing(false)
  }

  const handleModelChange = (e) => {
    const newModel = e.target.value
    if (newModel !== currentModel && onModelChange) {
      setSelectedModel(newModel)
      onModelChange(newModel)
    }
  }

  const handleMcpServersChange = (newSelected) => {
    // Update local state only - MCP servers will be sent with next message
    onMcpServersChange(newSelected)
    console.log(`✅ MCP servers selection updated: ${newSelected.join(', ')}`)
  }

  const handleMcpSelectorToggle = async () => {
    const newShowState = !showMcpSelector
    setShowMcpSelector(newShowState)

    // Refresh MCP servers list when opening the selector
    if (newShowState && serverUrl) {
      try {
        const { createAPIClient } = await import('../api/client')
        const { getAgentCoreSessionId } = await import('../utils/authUtils')
        const agentCoreSessionId = await getAgentCoreSessionId(currentProject)
        const apiClient = createAPIClient(serverUrl, agentCoreSessionId)

        const data = await apiClient.listMCPServers()
        setAvailableMcpServers(data.servers || {})
        console.log('🔄 Refreshed MCP servers list')
      } catch (err) {
        console.error('Failed to refresh MCP servers:', err)
      }
    }
  }

  // Handle input area resize
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizingInput) return

      // Calculate new height based on mouse Y position
      // Note: We're resizing from the top, so we need to calculate from bottom of viewport
      const inputArea = document.querySelector('.input-area')
      if (!inputArea) return

      const inputAreaRect = inputArea.getBoundingClientRect()
      const newHeight = inputAreaRect.bottom - e.clientY

      // Constrain height between 60px and 400px
      if (newHeight >= 60 && newHeight <= 400) {
        setInputHeight(newHeight)
      }
    }

    const handleMouseUp = () => {
      setIsResizingInput(false)
    }

    if (isResizingInput) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'ns-resize'
      document.body.style.userSelect = 'none'
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizingInput])

  const handleResizeStart = (e) => {
    e.preventDefault()
    setIsResizingInput(true)
  }

  return (
    <div className="chat-container">
      {/* Header with Session Info and Close Button */}
      <div className="chat-header">
        <div className="session-info">{sessionInfo}</div>
        <button
          onClick={onDisconnect}
          className="btn-icon btn-close-session"
          title="Close Session"
        >
          <X size={18} />
        </button>
      </div>

      {/* Error Banner */}
      {sessionError && (
        <div className="session-error-banner">
          <div className="error-banner-icon">
            <AlertTriangle size={20} />
          </div>
          <div className="error-banner-content">
            <div className="error-banner-title">Session Error</div>
            <div className="error-banner-message">{sessionError.message}</div>
            <div className="error-banner-details">
              Attempted {sessionError.attemptCount} times without success.
            </div>
          </div>
          <button
            onClick={onRetrySession}
            className="btn btn-primary error-banner-retry"
            title="Retry connecting to session"
          >
            <RefreshCw size={16} />
            Retry
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="messages">
        {messages.map((msg, index) => (
          <Message
            key={index}
            message={msg}
            onPermissionRespond={onPermissionRespond}
            onQuestionAnswer={onQuestionAnswer}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="input-area" style={{ height: `${inputHeight}px` }}>
        {/* Resize Handle */}
        <div
          className="input-resize-handle"
          onMouseDown={handleResizeStart}
          title="Drag to resize input area"
        >
          <div className="resize-handle-bar-horizontal" />
        </div>

        {/* Model Selector and MCP Selector */}
        <div className="session-selectors">
          <div className="model-selector-compact">
            <label htmlFor="model-select" className="model-selector-label">
              Model:
            </label>
            <select
              id="model-select"
              value={selectedModel}
              onChange={handleModelChange}
              className="model-selector-dropdown"
              disabled={sending || isRunning}
            >
              {availableModels.map(model => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
            {isRunning && (
              <span className="running-indicator">
                <Loader2 size={14} className="spinning" />
                Running...
              </span>
            )}
          </div>

          {/* MCP Server Selector */}
          {Object.keys(availableMcpServers).length > 0 && (
            <div className="mcp-selector-compact">
              <button
                className="mcp-selector-toggle"
                onClick={handleMcpSelectorToggle}
                disabled={sending || isRunning}
                title="Select MCP Servers"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
                  <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
                  <line x1="6" y1="6" x2="6.01" y2="6"></line>
                  <line x1="6" y1="18" x2="6.01" y2="18"></line>
                </svg>
                MCP ({selectedMcpServers?.length || 0})
              </button>

              {showMcpSelector && (
                <div className="mcp-selector-dropdown">
                  <div className="mcp-selector-header">
                    <span>Select MCP Servers</span>
                    <button
                      className="mcp-selector-close"
                      onClick={() => setShowMcpSelector(false)}
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <div className="mcp-selector-list">
                    {Object.entries(availableMcpServers).map(([name, config]) => (
                      <label key={name} className="mcp-selector-item">
                        <input
                          type="checkbox"
                          checked={selectedMcpServers?.includes(name) || false}
                          onChange={(e) => {
                            const newSelected = e.target.checked
                              ? [...(selectedMcpServers || []), name]
                              : (selectedMcpServers || []).filter(id => id !== name)
                            handleMcpServersChange(newSelected)
                          }}
                          disabled={sending || isRunning}
                        />
                        <span className="mcp-server-name">{name}</span>
                        <span className="mcp-server-type-badge">{config.type}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Message input and send/stop button */}
        <div className="input-controls">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            placeholder={isRunning ? "Agent is running..." : "Type your message here... (Press Enter to send, Shift+Enter for new line)"}
            disabled={sending || isRunning}
            style={{ height: '100%', resize: 'none' }}
          />
          {isRunning ? (
            <button
              onClick={handleStop}
              className="btn-icon btn-stop"
              title="Stop current operation"
            >
              <Square size={20} />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              className="btn-icon btn-send"
              disabled={sending || !input.trim()}
              title={sending ? 'Sending...' : 'Send message'}
            >
              {sending ? <Loader2 size={20} className="spinning" /> : <Send size={20} />}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default ChatContainer
