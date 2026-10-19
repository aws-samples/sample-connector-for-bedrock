import { useState, useEffect, useRef } from 'react'
import { File, X, FileText, Calendar, HardDrive, AlertCircle, Loader2, Edit3, Save, Download, XCircle, Image as ImageIcon, Trash2 } from 'lucide-react'
import { createAPIClient } from '../api/client'
import { getAgentCoreSessionId } from '../utils/authUtils'
import hljs from 'highlight.js/lib/core'
import 'highlight.js/styles/github.css'

// CodeMirror imports
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'

// Import highlight.js languages (renamed to avoid conflicts with CodeMirror)
import hljsJavascript from 'highlight.js/lib/languages/javascript'
import hljsTypescript from 'highlight.js/lib/languages/typescript'
import hljsPython from 'highlight.js/lib/languages/python'
import hljsJson from 'highlight.js/lib/languages/json'
import hljsXml from 'highlight.js/lib/languages/xml'
import hljsCss from 'highlight.js/lib/languages/css'
import hljsMarkdown from 'highlight.js/lib/languages/markdown'
import hljsBash from 'highlight.js/lib/languages/bash'
import hljsYaml from 'highlight.js/lib/languages/yaml'
import hljsSql from 'highlight.js/lib/languages/sql'
import hljsJava from 'highlight.js/lib/languages/java'
import hljsCpp from 'highlight.js/lib/languages/cpp'
import hljsGo from 'highlight.js/lib/languages/go'
import hljsRust from 'highlight.js/lib/languages/rust'

// Register highlight.js languages
hljs.registerLanguage('javascript', hljsJavascript)
hljs.registerLanguage('typescript', hljsTypescript)
hljs.registerLanguage('python', hljsPython)
hljs.registerLanguage('json', hljsJson)
hljs.registerLanguage('xml', hljsXml)
hljs.registerLanguage('html', hljsXml)
hljs.registerLanguage('css', hljsCss)
hljs.registerLanguage('markdown', hljsMarkdown)
hljs.registerLanguage('bash', hljsBash)
hljs.registerLanguage('shell', hljsBash)
hljs.registerLanguage('yaml', hljsYaml)
hljs.registerLanguage('sql', hljsSql)
hljs.registerLanguage('java', hljsJava)
hljs.registerLanguage('cpp', hljsCpp)
hljs.registerLanguage('c', hljsCpp)
hljs.registerLanguage('go', hljsGo)
hljs.registerLanguage('rust', hljsRust)

function FilePreview({ serverUrl, filePath, onClose, disabled, currentProject }) {
  const [fileInfo, setFileInfo] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editedContent, setEditedContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [imageBlobUrl, setImageBlobUrl] = useState(null)
  const apiClientRef = useRef(null)
  const codeRef = useRef(null)
  const editorContainerRef = useRef(null)
  const editorViewRef = useRef(null)

  // Create API client and load file when ready
  useEffect(() => {
    if (disabled) {
      setFileInfo(null)
      return
    }

    const initAndLoad = async () => {
      // Initialize API client if needed
      if (serverUrl && (!apiClientRef.current || apiClientRef.current.baseUrl !== serverUrl)) {
        const agentCoreSessionId = await getAgentCoreSessionId(currentProject)
        apiClientRef.current = createAPIClient(serverUrl, agentCoreSessionId)
      }

      // Load file info after API client is ready
      if (filePath && apiClientRef.current) {
        loadFileInfo(filePath)
      }
    }
    initAndLoad()
  }, [serverUrl, filePath, disabled, currentProject])

  // Initialize CodeMirror when entering edit mode
  useEffect(() => {
    if (isEditing && editorContainerRef.current && fileInfo) {
      // Clean up previous editor
      if (editorViewRef.current) {
        editorViewRef.current.destroy()
      }

      // Detect language from file extension
      const ext = fileInfo.name.split('.').pop()?.toLowerCase()
      let languageExtension = null

      // Map file extensions to CodeMirror language extensions
      if (['js', 'jsx', 'ts', 'tsx'].includes(ext)) {
        languageExtension = javascript({ jsx: true, typescript: ext === 'ts' || ext === 'tsx' })
      } else if (ext === 'py') {
        languageExtension = python()
      } else if (['html', 'htm'].includes(ext)) {
        languageExtension = html()
      } else if (['css', 'scss'].includes(ext)) {
        languageExtension = css()
      } else if (ext === 'json') {
        languageExtension = json()
      } else if (ext === 'md') {
        languageExtension = markdown()
      }

      // Create editor state
      const extensions = [basicSetup]
      if (languageExtension) {
        extensions.push(languageExtension)
      }

      const state = EditorState.create({
        doc: editedContent,
        extensions
      })

      // Create editor view
      const view = new EditorView({
        state,
        parent: editorContainerRef.current,
        dispatch: (transaction) => {
          view.update([transaction])
          if (transaction.docChanged) {
            setEditedContent(transaction.state.doc.toString())
          }
        }
      })

      editorViewRef.current = view

      // Cleanup on unmount
      return () => {
        if (editorViewRef.current) {
          editorViewRef.current.destroy()
          editorViewRef.current = null
        }
      }
    }
  }, [isEditing, fileInfo])

  // Apply syntax highlighting when fileInfo changes (only in view mode)
  useEffect(() => {
    if (fileInfo && fileInfo.is_text && fileInfo.content && codeRef.current && !isEditing) {
      // Detect language from file extension
      const ext = fileInfo.name.split('.').pop()?.toLowerCase()
      const langMap = {
        'js': 'javascript',
        'jsx': 'javascript',
        'ts': 'typescript',
        'tsx': 'typescript',
        'py': 'python',
        'json': 'json',
        'xml': 'xml',
        'html': 'html',
        'htm': 'html',
        'css': 'css',
        'scss': 'css',
        'md': 'markdown',
        'sh': 'bash',
        'bash': 'bash',
        'yml': 'yaml',
        'yaml': 'yaml',
        'sql': 'sql',
        'java': 'java',
        'c': 'c',
        'cpp': 'cpp',
        'h': 'cpp',
        'hpp': 'cpp',
        'go': 'go',
        'rs': 'rust'
      }

      const language = langMap[ext]

      if (language) {
        try {
          const highlighted = hljs.highlight(fileInfo.content, { language }).value
          codeRef.current.innerHTML = highlighted
        } catch (err) {
          // If highlighting fails, just show plain text
          console.warn('Syntax highlighting failed:', err)
          codeRef.current.textContent = fileInfo.content
        }
      } else {
        // No language mapping, show plain text
        codeRef.current.textContent = fileInfo.content
      }
    }
  }, [fileInfo, isEditing])

  const loadFileInfo = async (path) => {
    if (!apiClientRef.current) return

    setLoading(true)
    setError(null)
    setIsEditing(false)

    try {
      const data = await apiClientRef.current.getFileInfo(path)
      setFileInfo(data)
      setEditedContent(data.content || '')
    } catch (err) {
      console.error('Failed to load file info:', err)
      setError(err.message)
      setFileInfo(null)
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = () => {
    setEditedContent(fileInfo.content || '')
    setIsEditing(true)
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
    setEditedContent(fileInfo.content || '')
  }

  const handleSave = async () => {
    if (!apiClientRef.current || !fileInfo) return

    setSaving(true)
    setError(null)

    try {
      await apiClientRef.current.saveFile(fileInfo.path, editedContent)
      // Reload file info to get updated stats
      await loadFileInfo(fileInfo.path)
      setIsEditing(false)
    } catch (err) {
      console.error('Failed to save file:', err)
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDownload = async () => {
    if (!fileInfo || !apiClientRef.current) return

    // For text files with content, create a blob download
    if (fileInfo.is_text && fileInfo.content) {
      const blob = new Blob([fileInfo.content], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileInfo.name
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } else {
      // For binary files or images, use the API client (supports invocations mode)
      try {
        const response = await apiClientRef.current.getRawFile(fileInfo.path, currentProject)
        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = fileInfo.name
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
      } catch (err) {
        console.error('Failed to download file:', err)
        setError('Failed to download file')
      }
    }
  }

  const handleDelete = async () => {
    if (!apiClientRef.current || !fileInfo) return

    // Confirm deletion
    const confirmDelete = window.confirm(
      `Are you sure you want to delete "${fileInfo.name}"?\n\nThis action cannot be undone.`
    )
    if (!confirmDelete) return

    setDeleting(true)
    setError(null)

    try {
      await apiClientRef.current.deleteFile(fileInfo.path)
      // Close preview after successful deletion
      onClose()
    } catch (err) {
      console.error('Failed to delete file:', err)
      setError(err.message)
    } finally {
      setDeleting(false)
    }
  }

  const formatSize = (bytes) => {
    if (!bytes) return '0 B'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }

  const formatDate = (timestamp) => {
    if (!timestamp) return 'Unknown'
    const date = new Date(timestamp * 1000)
    return date.toLocaleString()
  }

  const isImageFile = (filename, mimeType) => {
    if (!filename) return false
    const ext = filename.split('.').pop()?.toLowerCase()
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico']
    const isImageExt = imageExtensions.includes(ext)
    const isImageMime = mimeType && mimeType.startsWith('image/')
    return isImageExt || isImageMime
  }

  // Load image blob URL when file info changes and it's an image
  useEffect(() => {
    // Cleanup previous blob URL
    if (imageBlobUrl) {
      URL.revokeObjectURL(imageBlobUrl)
      setImageBlobUrl(null)
    }

    const loadImage = async () => {
      if (!fileInfo || !apiClientRef.current) return
      if (fileInfo.is_text) return
      if (!isImageFile(fileInfo.name, fileInfo.mime_type)) return

      try {
        const response = await apiClientRef.current.getRawFile(fileInfo.path, currentProject)
        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        setImageBlobUrl(url)
      } catch (err) {
        console.error('Failed to load image:', err)
      }
    }

    loadImage()

    // Cleanup on unmount
    return () => {
      if (imageBlobUrl) {
        URL.revokeObjectURL(imageBlobUrl)
      }
    }
  }, [fileInfo, currentProject])

  if (!filePath) {
    return (
      <div className="file-preview">
        <div className="file-preview-empty">
          <File size={48} />
          <p>Select a file to preview</p>
        </div>
      </div>
    )
  }

  return (
    <div className="file-preview">
      <div className="file-preview-header">
        <div className="file-preview-title">
          <FileText size={16} />
          <span>File Preview</span>
        </div>
        <div className="file-preview-actions">
          {!loading && !error && fileInfo && (
            <>
              {fileInfo.is_text && fileInfo.content && !isEditing && (
                <button
                  className="btn-icon btn-edit"
                  onClick={handleEdit}
                  title="Edit file"
                >
                  <Edit3 size={16} />
                </button>
              )}
              {fileInfo.is_text && fileInfo.content && isEditing && (
                <>
                  <button
                    className="btn-icon btn-save"
                    onClick={handleSave}
                    disabled={saving}
                    title="Save file"
                  >
                    {saving ? <Loader2 size={16} className="spinning" /> : <Save size={16} />}
                  </button>
                  <button
                    className="btn-icon btn-cancel"
                    onClick={handleCancelEdit}
                    disabled={saving}
                    title="Cancel editing"
                  >
                    <XCircle size={16} />
                  </button>
                </>
              )}
              {!isEditing && (
                <>
                  <button
                    className="btn-icon btn-download"
                    onClick={handleDownload}
                    title="Download file"
                  >
                    <Download size={16} />
                  </button>
                  <button
                    className="btn-icon btn-delete"
                    onClick={handleDelete}
                    disabled={deleting}
                    title="Delete file"
                  >
                    {deleting ? <Loader2 size={16} className="spinning" /> : <Trash2 size={16} />}
                  </button>
                </>
              )}
            </>
          )}
          <button className="btn-icon" onClick={onClose} title="Close preview">
            <X size={18} />
          </button>
        </div>
      </div>

      {loading && (
        <div className="file-preview-loading">
          <Loader2 size={32} className="spinning" />
          <p>Loading file...</p>
        </div>
      )}

      {error && (
        <div className="file-preview-error">
          <AlertCircle size={32} />
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && fileInfo && (
        <div className="file-preview-content">
          <div className="file-info-section">
            <h3>File Information</h3>
            <div className="file-info-grid">
              <div className="file-info-item">
                <File size={16} />
                <div>
                  <div className="file-info-label">Name</div>
                  <div className="file-info-value">{fileInfo.name}</div>
                </div>
              </div>

              <div className="file-info-item">
                <HardDrive size={16} />
                <div>
                  <div className="file-info-label">Size</div>
                  <div className="file-info-value">{formatSize(fileInfo.size)}</div>
                </div>
              </div>

              <div className="file-info-item">
                <Calendar size={16} />
                <div>
                  <div className="file-info-label">Modified</div>
                  <div className="file-info-value">{formatDate(fileInfo.modified)}</div>
                </div>
              </div>

              {fileInfo.mime_type && (
                <div className="file-info-item">
                  <FileText size={16} />
                  <div>
                    <div className="file-info-label">Type</div>
                    <div className="file-info-value">{fileInfo.mime_type}</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {fileInfo.is_text && fileInfo.content && (
            <div className="file-content-section">
              <h3>Content</h3>
              {isEditing ? (
                <div ref={editorContainerRef} className="codemirror-container" />
              ) : (
                <pre className="file-content-text"><code ref={codeRef}></code></pre>
              )}
            </div>
          )}

          {fileInfo.is_text && fileInfo.error && (
            <div className="file-content-section">
              <div className="file-content-error">
                <AlertCircle size={20} />
                <span>{fileInfo.error}</span>
              </div>
            </div>
          )}

          {!fileInfo.is_text && isImageFile(fileInfo.name, fileInfo.mime_type) && (
            <div className="file-content-section">
              <h3>Image Preview</h3>
              <div className="file-image-preview">
                {imageBlobUrl ? (
                  <img
                    src={imageBlobUrl}
                    alt={fileInfo.name}
                    onError={(e) => {
                      e.target.style.display = 'none'
                      e.target.nextSibling.style.display = 'block'
                    }}
                  />
                ) : (
                  <div className="file-image-loading">
                    <Loader2 size={32} className="spin" />
                    <p>Loading image...</p>
                  </div>
                )}
                <div className="file-image-error" style={{ display: imageBlobUrl ? 'none' : undefined }}>
                  <AlertCircle size={32} />
                  <p>Failed to load image</p>
                </div>
              </div>
            </div>
          )}

          {!fileInfo.is_text && !isImageFile(fileInfo.name, fileInfo.mime_type) && (
            <div className="file-content-section">
              <div className="file-content-binary">
                <File size={48} />
                <p>Binary file - preview not available</p>
                <small>This file type cannot be displayed as text</small>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default FilePreview
