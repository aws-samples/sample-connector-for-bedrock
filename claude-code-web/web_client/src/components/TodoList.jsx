import { CheckCircle2, Circle, Loader2 } from 'lucide-react'

/**
 * TodoList component for displaying Claude's task list
 * Shows todos with their status (pending, in_progress, completed)
 */
function TodoList({ todos }) {
  if (!todos || todos.length === 0) {
    return null
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="status-icon completed" size={18} />
      case 'in_progress':
        return <Loader2 className="status-icon in-progress" size={18} />
      case 'pending':
        return <Circle className="status-icon pending" size={18} />
      default:
        return <Circle className="status-icon pending" size={18} />
    }
  }

  const getStatusClass = (status) => {
    switch (status) {
      case 'completed':
        return 'todo-item completed'
      case 'in_progress':
        return 'todo-item in-progress'
      case 'pending':
        return 'todo-item pending'
      default:
        return 'todo-item pending'
    }
  }

  const getStatusText = (status) => {
    switch (status) {
      case 'completed':
        return '已完成'
      case 'in_progress':
        return '进行中'
      case 'pending':
        return '待处理'
      default:
        return '待处理'
    }
  }

  return (
    <div className="todo-list-container">
      <div className="todo-list-header">
        <h4>📋 任务列表</h4>
      </div>
      <div className="todo-list">
        {todos.map((todo, index) => (
          <div key={index} className={getStatusClass(todo.status)}>
            <div className="todo-icon">
              {getStatusIcon(todo.status)}
            </div>
            <div className="todo-content">
              <div className="todo-text">
                {todo.status === 'in_progress' ? todo.activeForm : todo.content}
              </div>
              <div className="todo-status">
                {getStatusText(todo.status)}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="todo-list-footer">
        <span className="todo-count">
          共 {todos.length} 项任务 •
          已完成 {todos.filter(t => t.status === 'completed').length} •
          进行中 {todos.filter(t => t.status === 'in_progress').length} •
          待处理 {todos.filter(t => t.status === 'pending').length}
        </span>
      </div>
    </div>
  )
}

export default TodoList
