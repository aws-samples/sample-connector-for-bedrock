import { Wrench, CheckCircle, XCircle, ShieldAlert, Zap } from 'lucide-react'
import QuestionCard from './QuestionCard'
import TodoList from './TodoList'

function Message({ message, onPermissionRespond, onQuestionAnswer }) {
  const { type, role, content, toolName, toolInput, toolUseId, isError, permission } = message

  const formatContent = (text) => {
    if (!text) return ''
    return text
      .replace(/\n/g, '<br>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  }

  const formatToolContent = (text) => {
    if (!text) return ''
    // Handle object content (e.g., {type, source} from tool results)
    if (typeof text === 'object') {
      text = JSON.stringify(text, null, 2)
    }
    // Limit tool result display length for readability
    const maxLength = 1000
    if (text.length > maxLength) {
      return text.substring(0, maxLength) + '\n... (truncated)'
    }
    return text
  }

  if (type === 'system') {
    return (
      <div className="message system">
        <div className="message-content">{content}</div>
      </div>
    )
  }

  if (type === 'error') {
    return (
      <div className="message error">
        <div className="message-content">
          <XCircle size={16} style={{ display: 'inline', marginRight: '6px' }} />
          Error: {content}
        </div>
      </div>
    )
  }

  if (type === 'tool') {
    // Special handling for AskUserQuestion tool
    if (toolName === 'AskUserQuestion' && toolInput && toolInput.questions) {
      return (
        <div className="message tool-use tool-question">
          <QuestionCard
            questions={toolInput.questions}
            onSubmitAnswers={(answers) => onQuestionAnswer(toolUseId, answers, toolInput.questions)}
          />
        </div>
      )
    }

    // Special handling for TodoWrite tool
    if (toolName === 'TodoWrite' && toolInput && toolInput.todos) {
      return (
        <div className="message tool-use tool-todo">
          <TodoList todos={toolInput.todos} />
        </div>
      )
    }

    // Default tool display
    return (
      <div className="message tool-use">
        <div className="message-header">
          <Wrench size={16} className="message-icon" />
          <span className="message-label">Tool: {toolName}</span>
        </div>
        <div className="message-content tool-input">
          <pre>{JSON.stringify(toolInput, null, 2)}</pre>
        </div>
      </div>
    )
  }

  if (type === 'permission') {
    return (
      <div className="message permission-request">
        <div className="message-header">
          <ShieldAlert size={16} className="message-icon" />
          <span className="message-label">Permission Required</span>
        </div>
        <div className="message-content permission-content">
          <div className="permission-details">
            <div className="permission-field">
              <strong>Tool:</strong> {permission.tool_name}
            </div>
            <div className="permission-field">
              <strong>Input:</strong>
              <pre>{JSON.stringify(permission.tool_input, null, 2)}</pre>
            </div>
            {permission.suggestions && permission.suggestions.length > 0 && (
              <div className="permission-field">
                <strong>Suggestions:</strong>
                <ul>
                  {permission.suggestions.map((s, i) => (
                    <li key={i}>{s.message || JSON.stringify(s)}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="permission-actions">
            <button
              className="btn-permission btn-allow"
              onClick={() => onPermissionRespond(permission.request_id, true, false)}
            >
              ✓ Allow
            </button>
            {permission.suggestions && permission.suggestions.length > 0 && (
              <button
                className="btn-permission btn-apply-suggestions"
                onClick={() => onPermissionRespond(permission.request_id, true, true)}
              >
                <Zap size={16} /> Apply Suggestions
              </button>
            )}
            <button
              className="btn-permission btn-deny"
              onClick={() => onPermissionRespond(permission.request_id, false, false)}
            >
              ✗ Deny
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (type === 'tool_result') {
    return (
      <div className={`message tool-result ${isError ? 'error' : 'success'}`}>
        <div className="message-header">
          {isError ? (
            <XCircle size={16} className="message-icon" />
          ) : (
            <CheckCircle size={16} className="message-icon" />
          )}
          <span className="message-label">{isError ? 'Tool Error' : 'Tool Result'}</span>
        </div>
        <div className="message-content tool-output">
          <pre>{formatToolContent(content)}</pre>
        </div>
      </div>
    )
  }

  const icon = role === 'user' ? '👤' : '🤖'
  const label = role === 'user' ? 'You' : 'Claude'

  return (
    <div className={`message ${role}`}>
      <div className="message-header">
        <span className="message-icon">{icon}</span>
        <span className="message-label">{label}</span>
      </div>
      <div
        className="message-content"
        dangerouslySetInnerHTML={{ __html: formatContent(content) }}
      />
    </div>
  )
}

export default Message
