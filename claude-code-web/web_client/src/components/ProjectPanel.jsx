import { useState } from 'react'
import { Plus, RefreshCw, CheckCircle, FolderOpen } from 'lucide-react'

function ProjectPanel({
  projects,
  currentProject,
  onProjectChange,
  onCreateProject,
  onRefresh,
  hasActiveSession,
  loading
}) {
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [creating, setCreating] = useState(false)

  const handleCreateProject = async (e) => {
    e.preventDefault()
    if (!newProjectName.trim()) return

    setCreating(true)
    try {
      await onCreateProject(newProjectName.trim())
      setNewProjectName('')
      setShowCreateForm(false)
    } catch (error) {
      console.error('Failed to create project:', error)
      alert(`Failed to create project: ${error.message}`)
    } finally {
      setCreating(false)
    }
  }

  const handleProjectSelect = (projectName) => {
    if (hasActiveSession) {
      if (!confirm('Switching projects will close the current session. Continue?')) {
        return
      }
    }
    onProjectChange(projectName)
  }

  return (
    <div className="project-panel">
      <div className="project-panel-header">
        <h2>Projects</h2>
        <div className="project-panel-actions">
          <button
            className="btn-icon btn-small"
            onClick={onRefresh}
            disabled={loading}
            title="Refresh projects"
          >
            <RefreshCw size={14} className={loading ? 'spinning' : ''} />
          </button>
          <button
            className="btn-icon btn-small"
            onClick={() => setShowCreateForm(!showCreateForm)}
            title="Create new project"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {showCreateForm && (
        <div className="project-create-form">
          <form onSubmit={handleCreateProject}>
            <input
              type="text"
              placeholder="Project name..."
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              disabled={creating}
              autoFocus
            />
            <div className="form-actions">
              <button
                type="submit"
                className="btn-primary btn-small"
                disabled={!newProjectName.trim() || creating}
              >
                Create
              </button>
              <button
                type="button"
                className="btn-secondary btn-small"
                onClick={() => {
                  setShowCreateForm(false)
                  setNewProjectName('')
                }}
                disabled={creating}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="project-list-container">
        {loading && projects.length === 0 ? (
          <div className="project-loading">
            <RefreshCw size={24} className="spinning" />
            <p>Loading projects...</p>
          </div>
        ) : projects.length === 0 ? (
          <div className="project-empty">
            <FolderOpen size={48} style={{ opacity: 0.3 }} />
            <p>No projects yet</p>
            <small>Click + to create your first project</small>
          </div>
        ) : (
          <div className="project-list">
            <button
              className={`project-item ${!currentProject ? 'active' : ''}`}
              onClick={() => handleProjectSelect(null)}
            >
              <FolderOpen size={16} />
              <span>Default Workspace</span>
              {!currentProject && <CheckCircle size={14} />}
            </button>

            {projects.map((project) => (
              <button
                key={project}
                className={`project-item ${currentProject === project ? 'active' : ''}`}
                onClick={() => handleProjectSelect(project)}
              >
                <FolderOpen size={16} />
                <span>{project}</span>
                {currentProject === project && <CheckCircle size={14} />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default ProjectPanel
