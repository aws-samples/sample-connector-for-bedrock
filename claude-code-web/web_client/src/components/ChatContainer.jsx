import { useState, useRef, useEffect } from 'react'
import { Send, X, Loader2, AlertTriangle, RefreshCw, Square } from 'lucide-react'
import Message from './Message'
import { useAuth } from '../hooks/useAuth.jsx'
import { INPUT_AREA_DEFAULT_HEIGHT, clampInputHeight, inputAreaHeight } from '../utils/inputHeight.js'
import {
  MAX_IMAGES_PER_MESSAGE,
  SESSION_BUDGET_ERROR,
  browserImageCodec,
  buildUserMessage,
  fitSessionBudget,
  hasDraggedFiles,
  imagesBase64,
  pickDroppedImages,
  pickPastedImages,
  prepareImage,
  sessionBudgetError,
  sessionImageBase64,
  takeImageSlots,
  totalSizeError
} from '../utils/imageAttachments.js'

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
  const [inputHeight, setInputHeight] = useState(INPUT_AREA_DEFAULT_HEIGHT)
  const [isResizingInput, setIsResizingInput] = useState(false)
  const [isRunning, setIsRunning] = useState(false) // Track if assistant is currently responding
  const [availableMcpServers, setAvailableMcpServers] = useState({})
  const [showMcpSelector, setShowMcpSelector] = useState(false)
  const [images, setImages] = useState([]) // Pending pasted/dropped images: { id, name, mediaType, data, dataUrl }
  const [preparingImages, setPreparingImages] = useState(0) // Images still being downscaled/encoded
  const [attachmentError, setAttachmentError] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)
  const imageCountRef = useRef(0) // Listed + preparing images, for the per-message limit
  const nextImageIdRef = useRef(0)
  const latestRef = useRef({ messages, images }) // Current values for addImageFiles after its await
  const messagesEndRef = useRef(null)

  // Models the signed-in BRConnector key can use
  const { models: availableModels } = useAuth()

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

  useEffect(() => {
    latestRef.current = { messages, images }
  }, [messages, images])

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
    if ((!input.trim() && images.length === 0) || sending || isRunning || preparingImages > 0) return

    const sizeError = sessionBudgetError(messages, images) || totalSizeError(images, input)
    if (sizeError) {
      setAttachmentError(sizeError)
      return
    }

    setSending(true)
    setIsRunning(true)
    try {
      await onSendMessage(buildUserMessage(input, images))
      setInput('')
      setImages([])
      imageCountRef.current = 0
      setAttachmentError('')
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

  // Downscale/encode new images and add them to the pending list (max 5 per message)
  const addImageFiles = async (files, errors = []) => {
    const { accepted, dropped } = takeImageSlots(imageCountRef.current, files)
    if (dropped > 0) {
      errors.push(`Up to ${MAX_IMAGES_PER_MESSAGE} images per message; ${dropped} not added`)
    }
    if (accepted.length === 0) {
      setAttachmentError(errors.join('. '))
      return
    }

    imageCountRef.current += accepted.length
    setPreparingImages(n => n + accepted.length)
    const results = await Promise.all(accepted.map(file => prepareImage(file, browserImageCodec)))
    setPreparingImages(n => n - accepted.length)

    const prepared = []
    for (const result of results) {
      if (result.image) {
        prepared.push({ ...result.image, id: nextImageIdRef.current++ })
      } else {
        imageCountRef.current -= 1
        errors.push(result.error)
      }
    }

    // Images already in this session plus pending ones share the session budget
    const { messages: sessionMessages, images: pending } = latestRef.current
    const used = sessionImageBase64(sessionMessages) + imagesBase64(pending)
    const { accepted: ready, refused } = fitSessionBudget(used, prepared)
    if (refused.length > 0) {
      imageCountRef.current -= refused.length
      errors.push(SESSION_BUDGET_ERROR)
    }

    if (ready.length > 0) {
      setImages(prev => [...prev, ...ready])
    }
    setAttachmentError(errors.join('. '))
  }

  const removeImage = (id) => {
    setImages(prev => prev.filter(image => image.id !== id))
    imageCountRef.current -= 1
    setAttachmentError('')
  }

  // Paste: images become attachments; a paste with plain text is left to the textarea
  const handlePaste = (e) => {
    const files = pickPastedImages(e.clipboardData)
    if (files.length === 0) return
    e.preventDefault()
    addImageFiles(files)
  }

  // Drag and drop of image files onto the input area (a text drag is left to the textarea)
  const handleDragOver = (e) => {
    if (!hasDraggedFiles(e.dataTransfer)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = sending || isRunning ? 'none' : 'copy'
    setIsDragOver(true)
  }

  const handleDragLeave = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsDragOver(false)
    }
  }

  const handleDrop = (e) => {
    if (!hasDraggedFiles(e.dataTransfer)) return
    e.preventDefault() // keep the browser from opening the file
    setIsDragOver(false)
    if (sending || isRunning) return

    const { files, rejected } = pickDroppedImages(e.dataTransfer)
    const errors = rejected > 0 ? ['Only PNG, JPEG, GIF and WebP images can be attached'] : []
    addImageFiles(files, errors)
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

  const showAttachmentRow = images.length > 0 || preparingImages > 0 || attachmentError !== ''

  // Handle input area resize
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizingInput) return

      // Calculate new height based on mouse Y position
      // Note: We're resizing from the top, so we need to calculate from bottom of viewport
      const inputArea = document.querySelector('.input-area')
      if (!inputArea) return

      const inputAreaRect = inputArea.getBoundingClientRect()
      // The attachment row is added on top of the stored height, so leave it out here
      const newHeight = inputAreaRect.bottom - e.clientY - inputAreaHeight(0, showAttachmentRow)

      // Constrain so the textarea's minimum height always fits inside the box
      const clamped = clampInputHeight(newHeight)
      if (clamped !== null) {
        setInputHeight(clamped)
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
  }, [isResizingInput, showAttachmentRow])

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
      <div
        className={`input-area${isDragOver ? ' drag-over' : ''}`}
        style={{ height: `${inputAreaHeight(inputHeight, showAttachmentRow)}px` }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
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

        {/* Pending image attachments */}
        {showAttachmentRow && (
          <div className="input-attachments">
            {images.map(image => (
              <div key={image.id} className="input-attachment" title={image.name}>
                <img src={image.dataUrl} alt={image.name} />
                <button
                  type="button"
                  className="input-attachment-remove"
                  onClick={() => removeImage(image.id)}
                  disabled={sending}
                  title="Remove image"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            {preparingImages > 0 && (
              <span className="input-attachment-status">
                <Loader2 size={14} className="spinning" />
                Preparing image...
              </span>
            )}
            {attachmentError && (
              <>
                <span className="input-attachment-error" title={attachmentError}>
                  {attachmentError}
                </span>
                <button
                  type="button"
                  className="input-attachment-error-dismiss"
                  onClick={() => setAttachmentError('')}
                  title="Dismiss"
                >
                  <X size={14} />
                </button>
              </>
            )}
          </div>
        )}

        {/* Message input and send/stop button */}
        <div className="input-controls">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
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
              disabled={sending || preparingImages > 0 || (!input.trim() && images.length === 0)}
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
