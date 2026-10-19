import { useState, useEffect } from 'react'
import { Github, Loader2, AlertCircle, Search, Lock, Globe } from 'lucide-react'

function GithubProjectSelector({ serverUrl, userId, onProjectSelect, onCancel }) {
  const [repositories, setRepositories] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedRepo, setSelectedRepo] = useState(null)
  const [projectName, setProjectName] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    loadRepositories()
  }, [])

  const loadRepositories = async () => {
    setLoading(true)
    setError(null)

    try {
      const { createAPIClient } = await import('../api/client')
      const { getAgentCoreSessionId } = await import('../utils/authUtils')

      const agentCoreSessionId = await getAgentCoreSessionId()
      const apiClient = createAPIClient(serverUrl, agentCoreSessionId)

      const response = await apiClient.listGithubRepositories()
      setRepositories(response.repositories || [])
    } catch (err) {
      console.error('Failed to load GitHub repositories:', err)
      setError(err.message || 'Failed to load repositories')
    } finally {
      setLoading(false)
    }
  }

  const handleRepoSelect = (repo) => {
    setSelectedRepo(repo)
    // Set default project name to repo name
    setProjectName(repo.name)
  }

  const handleCreateProject = async () => {
    if (!selectedRepo || !projectName) return

    setCreating(true)
    setError(null)

    try {
      const { createAPIClient } = await import('../api/client')
      const { getAgentCoreSessionId } = await import('../utils/authUtils')

      const agentCoreSessionId = await getAgentCoreSessionId()
      const apiClient = createAPIClient(serverUrl, agentCoreSessionId)

      const result = await apiClient.createProjectFromGithub(
        userId,
        selectedRepo.url,
        projectName,
        null // branch - use default
      )

      // Notify parent component of success
      if (onProjectSelect) {
        onProjectSelect({
          projectName: result.project_name,
          localPath: result.local_path,
          repositoryUrl: result.repository_url
        })
      }
    } catch (err) {
      console.error('Failed to create project from GitHub:', err)
      setError(err.message || 'Failed to create project')
      setCreating(false)
    }
  }

  const filteredRepos = repositories.filter(repo =>
    repo.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    repo.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (repo.description && repo.description.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  return (
    <div className="github-project-selector">
      <div className="modal-header">
        <h2>
          <Github size={24} />
          Select GitHub Repository
        </h2>
      </div>

      {error && (
        <div className="error-message">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {!selectedRepo ? (
        <>
          <div className="search-box">
            <Search size={16} />
            <input
              type="text"
              placeholder="Search repositories..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="repo-list">
            {loading ? (
              <div className="loading-state">
                <Loader2 size={32} className="spinning" />
                <p>Loading repositories...</p>
              </div>
            ) : filteredRepos.length === 0 ? (
              <div className="empty-state">
                <Github size={48} />
                <p>No repositories found</p>
                {searchTerm && <small>Try a different search term</small>}
              </div>
            ) : (
              filteredRepos.map(repo => (
                <div
                  key={repo.full_name}
                  className="repo-item"
                  onClick={() => handleRepoSelect(repo)}
                >
                  <div className="repo-header">
                    <span className="repo-name">{repo.name}</span>
                    {repo.private ? (
                      <Lock size={14} className="private-icon" />
                    ) : (
                      <Globe size={14} className="public-icon" />
                    )}
                  </div>
                  <div className="repo-fullname">{repo.full_name}</div>
                  {repo.description && (
                    <div className="repo-description">{repo.description}</div>
                  )}
                  {repo.updated_at && (
                    <div className="repo-updated">
                      Updated {new Date(repo.updated_at).toLocaleDateString()}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      ) : (
        <div className="project-config">
          <div className="selected-repo-info">
            <h3>Selected Repository</h3>
            <div className="repo-details">
              <span className="repo-name">{selectedRepo.full_name}</span>
              {selectedRepo.private ? (
                <Lock size={14} className="private-icon" />
              ) : (
                <Globe size={14} className="public-icon" />
              )}
            </div>
            {selectedRepo.description && (
              <p className="repo-description">{selectedRepo.description}</p>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="projectName">Project Name</label>
            <input
              id="projectName"
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Enter project name"
              disabled={creating}
            />
            <small>This will be the folder name in your workspace</small>
          </div>

          <div className="modal-actions">
            <button
              className="btn btn-secondary"
              onClick={() => setSelectedRepo(null)}
              disabled={creating}
            >
              Back
            </button>
            <button
              className="btn btn-primary"
              onClick={handleCreateProject}
              disabled={!projectName || creating}
            >
              {creating ? (
                <>
                  <Loader2 size={16} className="spinning" />
                  Cloning Repository...
                </>
              ) : (
                'Create Project'
              )}
            </button>
          </div>
        </div>
      )}

      {!selectedRepo && (
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

export default GithubProjectSelector
