import { useState } from 'react'
import { FolderOpen, Plus, Folder, X, AlertTriangle, Github } from 'lucide-react'
import GithubProjectSelector from './GithubProjectSelector'

export default function ProjectSwitcher({
  isOpen,
  onClose,
  projects,
  currentProject,
  onProjectChange,
  onCreateProject,
  hasActiveSession,
  serverUrl,
  userId
}) {
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showGithubSelector, setShowGithubSelector] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [creating, setCreating] = useState(false)
  const [selectedProject, setSelectedProject] = useState(null)
  const [showConfirmation, setShowConfirmation] = useState(false)

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!newProjectName.trim()) return

    setCreating(true)
    try {
      await onCreateProject(newProjectName.trim())
      setNewProjectName('')
      setShowCreateForm(false)
      onClose()
    } catch (error) {
      console.error('Failed to create project:', error)
      alert('Failed to create project: ' + error.message)
    } finally {
      setCreating(false)
    }
  }

  const handleProjectSelect = (projectName) => {
    if (projectName === currentProject) {
      onClose()
      return
    }

    setSelectedProject(projectName)
    setShowConfirmation(true)
  }

  const handleConfirmSwitch = () => {
    onProjectChange(selectedProject)
    setShowConfirmation(false)
    setSelectedProject(null)
    onClose()
  }

  const handleCancelSwitch = () => {
    setShowConfirmation(false)
    setSelectedProject(null)
  }

  const handleGithubProjectCreated = (projectInfo) => {
    // GitHub project created successfully
    console.log('GitHub project created:', projectInfo)
    setShowGithubSelector(false)
    // Switch to the new project
    onProjectChange(projectInfo.projectName)
    onClose()
  }

  if (!isOpen) return null

  // Show GitHub selector
  if (showGithubSelector) {
    return (
      <div className="modal-overlay" onClick={() => setShowGithubSelector(false)}>
        <div className="modal-content project-switcher-modal" onClick={(e) => e.stopPropagation()}>
          <GithubProjectSelector
            serverUrl={serverUrl}
            userId={userId}
            onProjectSelect={handleGithubProjectCreated}
            onCancel={() => setShowGithubSelector(false)}
          />
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content project-switcher-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>
              <FolderOpen size={20} />
              Switch Project
            </h2>
            <button onClick={onClose} className="icon-button">
              <X size={20} />
            </button>
          </div>

          <div className="modal-body">
            {!showCreateForm ? (
              <>
                <div className="info-banner">
                  <AlertTriangle size={16} />
                  <span>Switching projects will stop all active tasks in the current project</span>
                </div>

                <div className="current-project-info">
                  <label>Current Project:</label>
                  <div className="current-project-name">
                    <Folder size={16} />
                    <strong>{currentProject || 'Default Workspace'}</strong>
                  </div>
                </div>

                <div className="project-list-section">
                  <div className="section-header">
                    <label>Available Projects</label>
                    <div className="header-actions">
                      <button
                        onClick={() => setShowCreateForm(true)}
                        className="btn-secondary btn-small"
                      >
                        <Plus size={14} />
                        New Project
                      </button>
                      <button
                        onClick={() => setShowGithubSelector(true)}
                        className="btn-secondary btn-small"
                      >
                        <Github size={14} />
                        From GitHub
                      </button>
                    </div>
                  </div>

                  <div className="project-list-modal">
                    <button
                      className={`project-item ${!currentProject ? 'active' : ''}`}
                      onClick={() => handleProjectSelect(null)}
                    >
                      <Folder size={16} />
                      <span>Default Workspace</span>
                      {!currentProject && <span className="badge">Current</span>}
                    </button>

                    {projects.map((project) => (
                      <button
                        key={project}
                        className={`project-item ${currentProject === project ? 'active' : ''}`}
                        onClick={() => handleProjectSelect(project)}
                      >
                        <Folder size={16} />
                        <span>{project}</span>
                        {currentProject === project && <span className="badge">Current</span>}
                      </button>
                    ))}

                    {projects.length === 0 && (
                      <div className="empty-state">
                        <p>No projects yet. Create your first project to get started.</p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="create-project-section">
                <h3>Create New Project</h3>
                <form onSubmit={handleCreate}>
                  <div className="form-group">
                    <label>Project Name</label>
                    <input
                      type="text"
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      placeholder="e.g., my-website, api-server"
                      disabled={creating}
                    />
                    <small>Use lowercase with hyphens (no spaces)</small>
                  </div>
                  <div className="form-actions">
                    <button
                      type="button"
                      onClick={() => {
                        setShowCreateForm(false)
                        setNewProjectName('')
                      }}
                      disabled={creating}
                      className="btn-secondary"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={creating || !newProjectName.trim()}
                      className="btn-primary"
                    >
                      {creating ? 'Creating...' : 'Create Project'}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>

      {showConfirmation && (
        <div className="modal-overlay" onClick={handleCancelSwitch}>
          <div className="modal-content confirmation-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                <AlertTriangle size={20} />
                Confirm Project Switch
              </h2>
            </div>

            <div className="modal-body">
              <p className="confirmation-message">
                Are you sure you want to switch to <strong>{selectedProject || 'Default Workspace'}</strong>?
              </p>
              <p className="confirmation-warning">
                This will:
              </p>
              <ul className="confirmation-list">
                <li>Stop all active tasks in the current project</li>
                <li>Close the current session</li>
                <li>Change working directory to {selectedProject ? `/workspace/${selectedProject}` : '/workspace'}</li>
              </ul>
            </div>

            <div className="modal-footer">
              <button onClick={handleCancelSwitch} className="btn-secondary">
                Cancel
              </button>
              <button onClick={handleConfirmSwitch} className="btn-primary btn-warning">
                Switch Project
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
