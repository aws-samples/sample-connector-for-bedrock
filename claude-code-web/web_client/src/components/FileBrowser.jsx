import { useState, useEffect, useRef } from 'react'
import { Folder, File, ChevronRight, ChevronDown, RefreshCw, FolderOpen, Home, Upload } from 'lucide-react'
import { createAPIClient } from '../api/client'
import { getAgentCoreSessionId } from '../utils/authUtils'

function FileBrowser({ serverUrl, currentPath, workingDirectory, onPathChange, onFileClick, refreshTrigger, disabled, isActive, currentProject }) {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [expandedDirs, setExpandedDirs] = useState(new Set())
  const [uploading, setUploading] = useState(false)
  const [uploadSuccess, setUploadSuccess] = useState(null)
  const apiClientRef = useRef(null)
  const previousActiveRef = useRef(false)
  const fileInputRef = useRef(null)

  // Create API client
  useEffect(() => {
    if (disabled) {
      setFiles([])
      return
    }

    const initApiClient = async () => {
      if (serverUrl && (!apiClientRef.current || apiClientRef.current.baseUrl !== serverUrl)) {
        const agentCoreSessionId = await getAgentCoreSessionId(currentProject)
        apiClientRef.current = createAPIClient(serverUrl, agentCoreSessionId)
      }
    }
    initApiClient()
  }, [serverUrl, disabled])

  // Load files when path changes
  useEffect(() => {
    if (disabled) return
    if (currentPath && apiClientRef.current) {
      loadFiles(currentPath)
    }
  }, [currentPath, disabled])

  // Auto-refresh when refreshTrigger changes (messages update)
  useEffect(() => {
    if (disabled) return
    if (refreshTrigger && currentPath && apiClientRef.current) {
      loadFiles(currentPath)
    }
  }, [refreshTrigger, disabled])

  // Auto-refresh when tab becomes active
  useEffect(() => {
    if (disabled) {
      previousActiveRef.current = isActive
      return
    }

    // Check if tab just became active (transition from false to true)
    if (isActive && !previousActiveRef.current) {
      // Use a small delay to ensure apiClient is initialized
      const timer = setTimeout(() => {
        if (currentPath && apiClientRef.current) {
          loadFiles(currentPath)
        }
      }, 100)

      // Update previous active state immediately
      previousActiveRef.current = isActive

      return () => clearTimeout(timer)
    }

    // Update previous active state
    previousActiveRef.current = isActive
  }, [isActive, disabled])

  const loadFiles = async (path) => {
    if (!apiClientRef.current) return

    setLoading(true)
    setError(null)

    try {
      const data = await apiClientRef.current.listFiles(path, currentProject)
      setFiles(data.items || [])
    } catch (err) {
      console.error('Failed to load files:', err)
      setError(err.message)
      setFiles([])
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = () => {
    if (currentPath) {
      loadFiles(currentPath)
    }
  }

  const handleItemClick = (item) => {
    if (item.is_directory) {
      onPathChange(item.path)
    } else {
      // It's a file, trigger file preview
      if (onFileClick) {
        onFileClick(item.path)
      }
    }
  }

  const handleParentDirectory = () => {
    if (currentPath && currentPath !== '/' && currentPath !== '.') {
      const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/'
      onPathChange(parentPath)
    }
  }

  const handleResetToWorkingDirectory = () => {
    if (workingDirectory) {
      onPathChange(workingDirectory)
    }
  }

  const formatSize = (bytes) => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileSelect = async (event) => {
    const file = event.target.files?.[0]
    if (!file || !currentPath || !apiClientRef.current) return

    setUploading(true)
    setError(null)
    setUploadSuccess(null)

    try {
      const result = await apiClientRef.current.uploadFile(file, currentPath, currentProject)
      setUploadSuccess(`File uploaded: ${result.filename} (${formatSize(result.size)})`)

      // Refresh file list
      await loadFiles(currentPath)

      // Clear success message after 3 seconds
      setTimeout(() => setUploadSuccess(null), 3000)
    } catch (err) {
      console.error('Failed to upload file:', err)
      setError(err.message || 'Failed to upload file')
    } finally {
      setUploading(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  return (
    <div className="file-browser">
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

      <div className="file-browser-header">
        <div className="file-browser-title">
          <Folder size={16} />
          <span className="current-path-display" title={currentPath}>{currentPath || '/'}</span>
        </div>
        <div className="file-browser-actions">
          <button
            className="btn-icon btn-upload"
            onClick={handleUploadClick}
            disabled={loading || uploading || !currentPath}
            title="Upload file"
          >
            <Upload size={14} className={uploading ? 'spinning' : ''} />
          </button>
          <button
            className="btn-icon btn-refresh"
            onClick={handleRefresh}
            disabled={loading}
            title="Refresh"
          >
            <RefreshCw size={14} className={loading ? 'spinning' : ''} />
          </button>
        </div>
      </div>

      <div className="file-browser-path">
        <button
          className="btn-path-segment"
          onClick={handleResetToWorkingDirectory}
          disabled={!workingDirectory || currentPath === workingDirectory}
          title={`Go to working directory: ${workingDirectory || ''}`}
        >
          <Home size={14} />
        </button>
        {currentPath && currentPath !== '/' && currentPath !== '.' && (
          <button
            className="btn-path-segment"
            onClick={handleParentDirectory}
            title="Parent directory"
          >
            ..
          </button>
        )}
      </div>

      <div className="file-browser-content">
        {uploadSuccess && (
          <div className="file-browser-success">
            <span>{uploadSuccess}</span>
          </div>
        )}

        {error && (
          <div className="file-browser-error">
            <span>{error}</span>
          </div>
        )}

        {loading && files.length === 0 && (
          <div className="file-browser-loading">
            <RefreshCw size={16} className="spinning" />
            <span>Loading...</span>
          </div>
        )}

        {!loading && !error && files.length === 0 && (
          <div className="file-browser-empty">
            <Folder size={32} />
            <span>Empty directory</span>
          </div>
        )}

        {files.length > 0 && (
          <div className="file-list">
            {files.map((item, index) => (
              <div
                key={`${item.path}-${index}`}
                className={`file-item ${item.is_directory ? 'directory' : 'file'}`}
                onClick={() => handleItemClick(item)}
                title={item.path}
              >
                <div className="file-item-icon">
                  {item.is_directory ? (
                    <Folder size={16} />
                  ) : (
                    <File size={16} />
                  )}
                </div>
                <div className="file-item-content">
                  <div className="file-item-name">{item.name}</div>
                  {!item.is_directory && item.size !== null && (
                    <div className="file-item-size">{formatSize(item.size)}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default FileBrowser
