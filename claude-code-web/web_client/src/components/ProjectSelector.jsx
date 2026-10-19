import { useState } from 'react'
import { FolderOpen, Plus, Folder, ChevronDown, ChevronRight } from 'lucide-react'

export default function ProjectSelector({
  projects,
  currentProject,
  onProjectChange,
  onCreateProject
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [creating, setCreating] = useState(false)

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!newProjectName.trim()) return

    setCreating(true)
    try {
      await onCreateProject(newProjectName.trim())
      setNewProjectName('')
      setShowCreateForm(false)
    } catch (error) {
      console.error('Failed to create project:', error)
      alert('Failed to create project: ' + error.message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="project-selector">
      <div className="project-selector-header">
        <FolderOpen size={16} />
        <span>Project</span>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="icon-button"
          title="Create new project"
        >
          <Plus size={16} />
        </button>
      </div>

      {showCreateForm && (
        <form className="project-create-form" onSubmit={handleCreate}>
          <input
            type="text"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            placeholder="Project name"
            autoFocus
            disabled={creating}
          />
          <div className="form-actions">
            <button type="submit" disabled={creating || !newProjectName.trim()}>
              {creating ? 'Creating...' : 'Create'}
            </button>
            <button
              type="button"
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
      )}

      <div className="project-list">
        <button
          className={`project-item ${!currentProject ? 'active' : ''}`}
          onClick={() => onProjectChange(null)}
        >
          <Folder size={16} />
          <span>Default Workspace</span>
        </button>

        {projects.map((project) => (
          <button
            key={project}
            className={`project-item ${currentProject === project ? 'active' : ''}`}
            onClick={() => onProjectChange(project)}
          >
            <Folder size={16} />
            <span>{project}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
