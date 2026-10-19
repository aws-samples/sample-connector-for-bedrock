/**
 * API Client abstraction layer
 *
 * Supports two modes:
 * 1. Direct mode: Calls REST endpoints directly
 * 2. Invocations mode: Routes all calls through /invocations endpoint
 *
 * Control via environment variable: VITE_USE_INVOCATIONS=true/false
 */

import { getAuthHeaders, isAuthError, handleAuthError } from '../utils/authUtils'

const USE_INVOCATIONS = import.meta.env.VITE_USE_INVOCATIONS === 'true'

/**
 * Helper to handle authentication errors in fetch responses
 */
function handleFetchResponse(response) {
  if (response.status === 401) {
    console.error('🔐 Authentication failed - triggering logout')
    handleAuthError()
    const error = new Error('Authentication required')
    error.status = 401
    throw error
  }
  return response
}

/**
 * Direct API client - calls REST endpoints directly
 */
class DirectAPIClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl
  }

  async healthCheck() {
    const authHeaders = await getAuthHeaders()
    const response = await fetch(`${this.baseUrl}/health`, {
      headers: authHeaders
    })
    return response.json()
  }

  async createSession(payload) {
    const authHeaders = await getAuthHeaders()
    const response = await fetch(`${this.baseUrl}/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      },
      body: JSON.stringify(payload)
    })
    handleFetchResponse(response)
    if (!response.ok) {
      throw new Error('Failed to create session')
    }
    return response.json()
  }

  async getSessionStatus(sessionId) {
    const authHeaders = await getAuthHeaders()
    const response = await fetch(`${this.baseUrl}/sessions/${sessionId}/status`, {
      headers: authHeaders
    })
    return { response, data: response.ok ? await response.json() : null }
  }

  async getSessionHistory(sessionId, cwd = null) {
    const authHeaders = await getAuthHeaders()
    const url = cwd
      ? `${this.baseUrl}/sessions/${sessionId}/history?cwd=${encodeURIComponent(cwd)}`
      : `${this.baseUrl}/sessions/${sessionId}/history`
    const response = await fetch(url, {
      headers: authHeaders
    })
    return { response, data: response.ok ? await response.json() : null }
  }

  async sendMessage(sessionId, message) {
    const authHeaders = await getAuthHeaders()
    const response = await fetch(`${this.baseUrl}/sessions/${sessionId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      },
      body: JSON.stringify({ message })
    })
    handleFetchResponse(response)
    if (!response.ok) {
      throw new Error('Failed to send message')
    }
    return response.json()
  }

  async sendMessageStream(sessionId, message, model = null, mcpServerIds = null) {
    const authHeaders = await getAuthHeaders()
    const agentCoreSessionId = authHeaders['X-Amzn-Bedrock-AgentCore-Runtime-Session-Id']

    // Append session ID as query parameter for SSE (EventSource doesn't support custom headers)
    const url = `${this.baseUrl}/sessions/${sessionId}/messages/stream${agentCoreSessionId ? `?agentcore_session_id=${encodeURIComponent(agentCoreSessionId)}` : ''}`

    // Build request payload with optional model and mcp_server_ids
    const payload = { message }
    if (model) payload.model = model
    if (mcpServerIds !== null) payload.mcp_server_ids = mcpServerIds

    // EventSource doesn't support POST, so we need to use fetch for the initial request
    // Then create EventSource for subsequent streaming
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      },
      body: JSON.stringify(payload)
    })

    handleFetchResponse(response)

    if (!response.ok) {
      throw new Error('Failed to send message')
    }

    // For SSE, we need to return the response body as EventSource-like object
    // But since EventSource doesn't support POST, we'll parse the response body manually
    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    // Create an object that mimics EventSource API
    const eventSource = {
      onmessage: null,
      onerror: null,
      close: () => reader.cancel(),
      _buffer: '',

      async _processStream() {
        try {
          while (true) {
            const { done, value } = await reader.read()

            if (done) break

            this._buffer += decoder.decode(value, { stream: true })
            const lines = this._buffer.split('\n')
            this._buffer = lines.pop() || ''

            for (const line of lines) {
              const trimmed = line.trim()
              if (trimmed.startsWith('data: ')) {
                const jsonStr = trimmed.substring(6)
                if (this.onmessage) {
                  this.onmessage({ data: jsonStr })
                }
              }
            }
          }
        } catch (error) {
          if (this.onerror) {
            this.onerror(error)
          }
        }
      }
    }

    // Start processing the stream
    eventSource._processStream()

    return eventSource
  }

  async respondToPermission(sessionId, requestId, allowed, applySuggestions = false) {
    const authHeaders = await getAuthHeaders()
    const response = await fetch(`${this.baseUrl}/sessions/${sessionId}/permissions/respond`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      },
      body: JSON.stringify({
        request_id: requestId,
        allowed: allowed,
        apply_suggestions: applySuggestions
      })
    })
    if (!response.ok) {
      throw new Error('Failed to respond to permission')
    }
    return response.json()
  }

  async sendToolResult(sessionId, toolResultMessage) {
    const authHeaders = await getAuthHeaders()
    const response = await fetch(`${this.baseUrl}/sessions/${sessionId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      },
      body: JSON.stringify({
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: toolResultMessage.tool_use_id,
              content: toolResultMessage.content
            }
          ]
        }
      })
    })
    handleFetchResponse(response)
    if (!response.ok) {
      throw new Error('Failed to send tool result')
    }
    return response.json()
  }

  async deleteSession(sessionId) {
    const authHeaders = await getAuthHeaders()
    const response = await fetch(`${this.baseUrl}/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: authHeaders
    })
    return response.ok
  }

  async closeAllSessions(cwd = null) {
    const authHeaders = await getAuthHeaders()
    const response = await fetch(`${this.baseUrl}/sessions/close_all`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      },
      body: JSON.stringify(cwd ? { cwd } : {})
    })
    handleFetchResponse(response)
    if (!response.ok) {
      throw new Error('Failed to close all sessions')
    }
    return response.json()
  }

  async interruptSession(sessionId) {
    const authHeaders = await getAuthHeaders()
    const response = await fetch(`${this.baseUrl}/sessions/${sessionId}/interrupt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      }
    })
    handleFetchResponse(response)
    if (!response.ok) {
      throw new Error('Failed to interrupt session')
    }
    return response.json()
  }

  async listSessions(cwd = null) {
    const authHeaders = await getAuthHeaders()
    const url = cwd
      ? `${this.baseUrl}/sessions?cwd=${encodeURIComponent(cwd)}`
      : `${this.baseUrl}/sessions`
    const response = await fetch(url, {
      headers: authHeaders
    })
    if (!response.ok) {
      throw new Error('Failed to list sessions')
    }
    return response.json()
  }

  async listAvailableSessions(cwd = null) {
    const authHeaders = await getAuthHeaders()
    const url = cwd
      ? `${this.baseUrl}/sessions/available?cwd=${encodeURIComponent(cwd)}`
      : `${this.baseUrl}/sessions/available`
    const response = await fetch(url, {
      headers: authHeaders
    })
    if (!response.ok) {
      throw new Error('Failed to list available sessions')
    }
    return response.json()
  }

  async listFiles(path = '.') {
    const authHeaders = await getAuthHeaders()
    const url = `${this.baseUrl}/files?path=${encodeURIComponent(path)}`
    const response = await fetch(url, {
      headers: authHeaders
    })
    if (!response.ok) {
      throw new Error('Failed to list files')
    }
    return response.json()
  }

  async getFileInfo(path) {
    const authHeaders = await getAuthHeaders()
    const url = `${this.baseUrl}/files/info?path=${encodeURIComponent(path)}`
    const response = await fetch(url, {
      headers: authHeaders
    })
    if (!response.ok) {
      throw new Error('Failed to get file info')
    }
    return response.json()
  }

  async saveFile(path, content) {
    const authHeaders = await getAuthHeaders()
    const response = await fetch(`${this.baseUrl}/files/save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      },
      body: JSON.stringify({ path, content })
    })
    if (!response.ok) {
      throw new Error('Failed to save file')
    }
    return response.json()
  }

  async deleteFile(path) {
    const authHeaders = await getAuthHeaders()
    const response = await fetch(`${this.baseUrl}/files/delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      },
      body: JSON.stringify({ path })
    })
    if (!response.ok) {
      throw new Error('Failed to delete file')
    }
    return response.json()
  }

  async getRawFile(path) {
    const authHeaders = await getAuthHeaders()
    const url = `${this.baseUrl}/files/raw?path=${encodeURIComponent(path)}`
    const response = await fetch(url, {
      headers: authHeaders
    })
    if (!response.ok) {
      throw new Error('Failed to get raw file')
    }
    return response
  }

  async uploadFile(file, directory) {
    const authHeaders = await getAuthHeaders()
    const formData = new FormData()
    formData.append('file', file)
    formData.append('directory', directory)

    const response = await fetch(`${this.baseUrl}/files/upload`, {
      method: 'POST',
      headers: {
        ...authHeaders
        // Don't set Content-Type - browser will set it with boundary
      },
      body: formData
    })
    handleFetchResponse(response)
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.detail || 'Failed to upload file')
    }
    return response.json()
  }

  async executeShellCommand(command, cwd) {
    const authHeaders = await getAuthHeaders()
    const response = await fetch(`${this.baseUrl}/shell/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      },
      body: JSON.stringify({ command, cwd })
    })
    if (!response.ok) {
      throw new Error('Failed to execute command')
    }
    return response // Return response for streaming
  }

  async getShellCwd() {
    const authHeaders = await getAuthHeaders()
    const response = await fetch(`${this.baseUrl}/shell/cwd`, {
      headers: authHeaders
    })
    if (!response.ok) {
      throw new Error('Failed to get current directory')
    }
    return response.json()
  }

  async setShellCwd(cwd) {
    const authHeaders = await getAuthHeaders()
    const response = await fetch(`${this.baseUrl}/shell/cwd`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      },
      body: JSON.stringify({ cwd })
    })
    if (!response.ok) {
      throw new Error('Failed to set current directory')
    }
    return response.json()
  }

  async createTerminalSession(payload) {
    const authHeaders = await getAuthHeaders(true) // Include session ID
    const response = await fetch(`${this.baseUrl}/terminal/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      },
      body: JSON.stringify(payload)
    })
    handleFetchResponse(response)
    if (!response.ok) {
      throw new Error('Failed to create terminal session')
    }
    return response.json()
  }

  async getTerminalOutput(sessionId, seq) {
    const authHeaders = await getAuthHeaders(true) // Include session ID
    const response = await fetch(`${this.baseUrl}/terminal/sessions/${sessionId}/output?seq=${seq}`, {
      headers: authHeaders
    })
    if (!response.ok) {
      throw new Error('Failed to get terminal output')
    }
    return response.json()
  }

  async sendTerminalInput(sessionId, data) {
    const authHeaders = await getAuthHeaders(true) // Include session ID
    const response = await fetch(`${this.baseUrl}/terminal/sessions/${sessionId}/input`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      },
      body: JSON.stringify({ data })
    })
    if (!response.ok) {
      throw new Error('Failed to send terminal input')
    }
    return response.json()
  }

  async resizeTerminal(sessionId, rows, cols) {
    const authHeaders = await getAuthHeaders(true) // Include session ID
    const response = await fetch(`${this.baseUrl}/terminal/sessions/${sessionId}/resize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      },
      body: JSON.stringify({ rows, cols })
    })
    if (!response.ok) {
      throw new Error('Failed to resize terminal')
    }
    return response.json()
  }

  async closeTerminalSession(sessionId) {
    const authHeaders = await getAuthHeaders(true) // Include session ID
    const response = await fetch(`${this.baseUrl}/terminal/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: authHeaders
    })
    if (!response.ok) {
      throw new Error('Failed to close terminal session')
    }
    return response.json()
  }

  async getTerminalStatus(sessionId) {
    const authHeaders = await getAuthHeaders(true) // Include session ID
    const response = await fetch(`${this.baseUrl}/terminal/sessions/${sessionId}/status`, {
      headers: authHeaders
    })
    if (!response.ok) {
      throw new Error('Failed to get terminal status')
    }
    return response.json()
  }

  async listTerminalSessions() {
    const authHeaders = await getAuthHeaders(true) // Include session ID
    const response = await fetch(`${this.baseUrl}/terminal/sessions`, {
      headers: authHeaders
    })
    if (!response.ok) {
      throw new Error('Failed to list terminal sessions')
    }
    return response.json()
  }

  async createTerminalStream(sessionId, onData, onError, onEnd) {
    // For SSE, we need to include auth headers in the URL or use a POST request
    // EventSource doesn't support custom headers, so we need to handle this differently
    // Note: This may need server-side changes to accept session ID from query params
    const authHeaders = await getAuthHeaders(true) // Get headers to extract session ID
    const agentCoreSessionId = authHeaders['X-Amzn-Bedrock-AgentCore-Runtime-Session-Id']

    // Append session ID as query parameter for SSE (EventSource doesn't support custom headers)
    const url = `${this.baseUrl}/terminal/sessions/${sessionId}/stream${agentCoreSessionId ? `?agentcore_session_id=${encodeURIComponent(agentCoreSessionId)}` : ''}`
    const eventSource = new EventSource(url)

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.error) {
          onError(new Error(data.error))
          eventSource.close()
        } else {
          onData(data)
          if (data.exit_code !== null) {
            eventSource.close()
            if (onEnd) onEnd(data.exit_code)
          }
        }
      } catch (error) {
        onError(error)
        eventSource.close()
      }
    }

    eventSource.onerror = (error) => {
      onError(error)
      eventSource.close()
    }

    return eventSource
  }

  async listProjects(userId) {
    const authHeaders = await getAuthHeaders()
    const response = await fetch(`${this.baseUrl}/workspace/projects/${userId}`, {
      headers: authHeaders
    })
    if (!response.ok) {
      throw new Error('Failed to list projects')
    }
    return response.json()
  }

  async createProject(userId, projectName) {
    const authHeaders = await getAuthHeaders()
    const response = await fetch(`${this.baseUrl}/workspace/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      },
      body: JSON.stringify({
        user_id: userId,
        project_name: projectName
      })
    })
    if (!response.ok) {
      throw new Error('Failed to create project')
    }
    return response.json()
  }

  async backupProject(userId, projectName) {
    const authHeaders = await getAuthHeaders()
    const response = await fetch(`${this.baseUrl}/workspace/projects/backup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      },
      body: JSON.stringify({
        user_id: userId,
        project_name: projectName
      })
    })
    if (!response.ok) {
      throw new Error('Failed to backup project')
    }
    return response.json()
  }

  async getGithubToken() {
    const authHeaders = await getAuthHeaders()
    const response = await fetch(`${this.baseUrl}/oauth/github/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      }
    })
    if (!response.ok) {
      throw new Error('Failed to get GitHub token')
    }
    return response.json()
  }

  async listMCPServers() {
    const authHeaders = await getAuthHeaders()
    const response = await fetch(`${this.baseUrl}/mcp-servers`, {
      headers: authHeaders
    })
    if (!response.ok) {
      throw new Error('Failed to list MCP servers')
    }
    return response.json()
  }

  async addMCPServer(name, type, command, args, env, url) {
    const authHeaders = await getAuthHeaders()
    const response = await fetch(`${this.baseUrl}/mcp-servers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      },
      body: JSON.stringify({
        name,
        type,
        command,
        args,
        env,
        url
      })
    })
    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.detail || 'Failed to add MCP server')
    }
    return response.json()
  }

  async deleteMCPServer(serverName) {
    const authHeaders = await getAuthHeaders()
    const response = await fetch(`${this.baseUrl}/mcp-servers/${encodeURIComponent(serverName)}`, {
      method: 'DELETE',
      headers: authHeaders
    })
    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.detail || 'Failed to delete MCP server')
    }
    return response.json()
  }

  async completeGithubOAuthCallback(sessionId) {
    const authHeaders = await getAuthHeaders()
    const response = await fetch(`${this.baseUrl}/oauth/github/callback?session_id=${encodeURIComponent(sessionId)}`, {
      method: 'GET',
      headers: authHeaders
    })
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to complete OAuth callback: ${response.status} ${errorText}`)
    }
    return response.text() // Returns HTML
  }

  async stopAgentCoreSession(qualifier = 'DEFAULT') {
    const authHeaders = await getAuthHeaders(true) // Include session ID and bearer token
    const sessionId = authHeaders['X-Amzn-Bedrock-AgentCore-Runtime-Session-Id']

    if (!sessionId) {
      console.warn('No active AgentCore session found')
      return { status: 'no_session', message: 'No active AgentCore session found' }
    }

    // Construct stopruntimesession endpoint URL directly from baseUrl
    const url = `${this.baseUrl}/stopruntimesession?qualifier=${encodeURIComponent(qualifier)}`

    console.log(`Stopping AgentCore session ${sessionId} at ${url}`)

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': authHeaders['Authorization'],
        'Content-Type': 'application/json',
        'X-Amzn-Bedrock-AgentCore-Runtime-Session-Id': sessionId
      }
    })

    // Handle 404 as success (session already terminated or not found)
    if (response.status === 404) {
      console.log('Session not found or already terminated')
      return { status: 'not_found', message: 'Session not found or already terminated' }
    }

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to stop AgentCore session: ${response.status} ${errorText}`)
    }

    // Try to parse JSON response, fallback to success message
    try {
      return await response.json()
    } catch {
      return { status: 'success', message: 'Session stopped' }
    }
  }

  async listGithubRepositories() {
    const authHeaders = await getAuthHeaders()
    const response = await fetch(`${this.baseUrl}/github/repositories`, {
      headers: authHeaders
    })
    handleFetchResponse(response)
    return response.json()
  }

  async createProjectFromGithub(userId, repositoryUrl, projectName = null, branch = null) {
    const authHeaders = await getAuthHeaders()
    const params = new URLSearchParams({
      user_id: userId,
      repository_url: repositoryUrl
    })
    if (projectName) params.append('project_name', projectName)
    if (branch) params.append('branch', branch)

    const response = await fetch(`${this.baseUrl}/github/create-project?${params}`, {
      method: 'POST',
      headers: authHeaders
    })
    handleFetchResponse(response)
    return response.json()
  }

  // Git operations
  async getGitLog(cwd, limit = 10) {
    const authHeaders = await getAuthHeaders()
    const response = await fetch(`${this.baseUrl}/git/log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      },
      body: JSON.stringify({ cwd, limit })
    })
    handleFetchResponse(response)
    if (!response.ok) {
      throw new Error('Failed to get git log')
    }
    return response.json()
  }

  async getGitStatus(cwd) {
    const authHeaders = await getAuthHeaders()
    const response = await fetch(`${this.baseUrl}/git/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      },
      body: JSON.stringify({ cwd })
    })
    handleFetchResponse(response)
    if (!response.ok) {
      throw new Error('Failed to get git status')
    }
    return response.json()
  }

  async createGitCommit(cwd, message, files = null) {
    const authHeaders = await getAuthHeaders()
    const response = await fetch(`${this.baseUrl}/git/commit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      },
      body: JSON.stringify({ cwd, message, files })
    })
    handleFetchResponse(response)
    if (!response.ok) {
      throw new Error('Failed to create git commit')
    }
    return response.json()
  }

  async pushGitCommits(cwd, remote = 'origin', branch = null) {
    const authHeaders = await getAuthHeaders()
    const response = await fetch(`${this.baseUrl}/git/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      },
      body: JSON.stringify({ cwd, remote, branch })
    })
    handleFetchResponse(response)
    if (!response.ok) {
      throw new Error('Failed to push git commits')
    }
    return response.json()
  }

  async getGitDiff(cwd, commitHash) {
    const authHeaders = await getAuthHeaders()
    const response = await fetch(`${this.baseUrl}/git/diff`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      },
      body: JSON.stringify({ cwd, commit_hash: commitHash })
    })
    handleFetchResponse(response)
    if (!response.ok) {
      throw new Error('Failed to get git diff')
    }
    return response.json()
  }

  // Plugin management
  async listPlugins() {
    const authHeaders = await getAuthHeaders()
    const response = await fetch(`${this.baseUrl}/plugins`, {
      headers: authHeaders
    })
    if (!response.ok) {
      throw new Error('Failed to list plugins')
    }
    return response.json()
  }

  async addMarketplace(name, gitUrl) {
    const authHeaders = await getAuthHeaders()
    const response = await fetch(`${this.baseUrl}/plugins/marketplaces`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      },
      body: JSON.stringify({ name, git_url: gitUrl })
    })
    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.detail || 'Failed to add marketplace')
    }
    return response.json()
  }

  async deleteMarketplace(marketplaceName) {
    const authHeaders = await getAuthHeaders()
    const response = await fetch(`${this.baseUrl}/plugins/marketplaces/${encodeURIComponent(marketplaceName)}`, {
      method: 'DELETE',
      headers: authHeaders
    })
    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.detail || 'Failed to delete marketplace')
    }
    return response.json()
  }

  async updateMarketplace(marketplaceName) {
    const authHeaders = await getAuthHeaders()
    const response = await fetch(`${this.baseUrl}/plugins/marketplaces/${encodeURIComponent(marketplaceName)}/update`, {
      method: 'POST',
      headers: authHeaders
    })
    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.detail || 'Failed to update marketplace')
    }
    return response.json()
  }

  async installPlugin(pluginName, marketplaceName) {
    const authHeaders = await getAuthHeaders()
    const response = await fetch(`${this.baseUrl}/plugins/install`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      },
      body: JSON.stringify({ plugin_name: pluginName, marketplace_name: marketplaceName })
    })
    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.detail || 'Failed to install plugin')
    }
    return response.json()
  }

  async uninstallPlugin(pluginKey) {
    const authHeaders = await getAuthHeaders()
    const response = await fetch(`${this.baseUrl}/plugins/install/${encodeURIComponent(pluginKey)}`, {
      method: 'DELETE',
      headers: authHeaders
    })
    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.detail || 'Failed to uninstall plugin')
    }
    return response.json()
  }

  async getPluginDetail(marketplaceName, pluginName) {
    const authHeaders = await getAuthHeaders()
    const response = await fetch(`${this.baseUrl}/plugins/${encodeURIComponent(marketplaceName)}/${encodeURIComponent(pluginName)}`, {
      headers: authHeaders
    })
    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.detail || 'Failed to get plugin details')
    }
    return response.json()
  }

  // Environment variables management
  async listEnvVars() {
    const authHeaders = await getAuthHeaders()
    const response = await fetch(`${this.baseUrl}/env-vars`, {
      headers: authHeaders
    })
    if (!response.ok) {
      throw new Error('Failed to list environment variables')
    }
    return response.json()
  }

  async setEnvVar(key, value) {
    const authHeaders = await getAuthHeaders()
    const response = await fetch(`${this.baseUrl}/env-vars`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      },
      body: JSON.stringify({ key, value })
    })
    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.detail || 'Failed to set environment variable')
    }
    return response.json()
  }

  async deleteEnvVar(key) {
    const authHeaders = await getAuthHeaders()
    const response = await fetch(`${this.baseUrl}/env-vars/${encodeURIComponent(key)}`, {
      method: 'DELETE',
      headers: authHeaders
    })
    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.detail || 'Failed to delete environment variable')
    }
    return response.json()
  }

  async setAllEnvVars(envVars) {
    const authHeaders = await getAuthHeaders()
    const response = await fetch(`${this.baseUrl}/env-vars`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      },
      body: JSON.stringify({ env_vars: envVars })
    })
    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.detail || 'Failed to set environment variables')
    }
    return response.json()
  }
}

/**
 * Invocations API client - routes all calls through /invocations
 */
class InvocationsAPIClient {
  constructor(baseUrl, agentCoreSessionId = null) {
    this.baseUrl = baseUrl
    this.agentCoreSessionId = agentCoreSessionId
  }

  /**
   * Set the agent core session ID for all subsequent requests
   * @param {string} sessionId - Agent core session ID
   */
  setAgentCoreSessionId(sessionId) {
    this.agentCoreSessionId = sessionId
  }

  async _invoke(path, method = 'GET', payload = null, pathParams = null, queryParams = null) {
    const authHeaders = await getAuthHeaders()
    const body = {
      path,
      method,
    }

    if (payload) {
      body.payload = payload
    }

    if (pathParams) {
      body.path_params = pathParams
    }

    if (queryParams) {
      body.query_params = queryParams
    }

    // Build headers with agent core session ID if available
    const headers = {
      'Content-Type': 'application/json',
      ...authHeaders
    }

    if (this.agentCoreSessionId) {
      headers['X-Amzn-Bedrock-AgentCore-Runtime-Session-Id'] = this.agentCoreSessionId
    }

    const response = await fetch(`${this.baseUrl}/invocations`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    })

    handleFetchResponse(response)

    if (!response.ok) {
      const error = new Error(`Invocation failed: ${path}`)
      error.status = response.status
      error.statusText = response.statusText

      // Try to get error details from response
      try {
        const errorData = await response.json()
        error.detail = errorData.detail || errorData.message
      } catch {
        // Ignore JSON parse errors
      }

      throw error
    }

    return response.json()
  }

  async listProjects(userId) {
    return this._invoke('/workspace/projects/{user_id}', 'GET', null, { user_id: userId })
  }

  async createProject(userId, projectName) {
    return this._invoke('/workspace/projects', 'POST', {
      user_id: userId,
      project_name: projectName
    })
  }

  async backupProject(userId, projectName) {
    return this._invoke('/workspace/projects/backup', 'POST', {
      user_id: userId,
      project_name: projectName
    })
  }

  async getGithubToken() {
    return this._invoke('/oauth/github/token', 'POST')
  }

  async listMCPServers() {
    return this._invoke('/mcp-servers', 'GET')
  }

  async addMCPServer(name, type, command, args, env, url) {
    return this._invoke('/mcp-servers', 'POST', {
      name,
      type,
      command,
      args,
      env,
      url
    })
  }

  async deleteMCPServer(serverName) {
    return this._invoke('/mcp-servers/{server_name}', 'DELETE', null, { server_name: serverName })
  }

  async completeGithubOAuthCallback(sessionId) {
    // This endpoint returns HTML, not JSON, so we need to handle it differently
    const authHeaders = await getAuthHeaders()
    const url = `${this.baseUrl}/invocations`
    const body = {
      path: '/oauth/github/callback',
      method: 'GET',
      query_params: { session_id: sessionId }
    }

    const headers = {
      'Content-Type': 'application/json',
      ...authHeaders
    }

    if (this.agentCoreSessionId) {
      headers['X-Amzn-Bedrock-AgentCore-Runtime-Session-Id'] = this.agentCoreSessionId
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    })

    handleFetchResponse(response)

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to complete OAuth callback: ${response.status} ${errorText}`)
    }

    // Return HTML text instead of JSON
    return response.text()
  }

  async stopAgentCoreSession(qualifier = 'DEFAULT') {
    const authHeaders = await getAuthHeaders(true) // Include session ID and bearer token
    const sessionId = authHeaders['X-Amzn-Bedrock-AgentCore-Runtime-Session-Id']

    if (!sessionId) {
      console.warn('No active AgentCore session found')
      return { status: 'no_session', message: 'No active AgentCore session found' }
    }

    // Construct stopruntimesession endpoint URL directly from baseUrl
    const url = `${this.baseUrl}/stopruntimesession?qualifier=${encodeURIComponent(qualifier)}`

    console.log(`Stopping AgentCore session ${sessionId} at ${url}`)

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': authHeaders['Authorization'],
        'Content-Type': 'application/json',
        'X-Amzn-Bedrock-AgentCore-Runtime-Session-Id': sessionId
      }
    })

    // Handle 404 as success (session already terminated or not found)
    if (response.status === 404) {
      console.log('Session not found or already terminated')
      return { status: 'not_found', message: 'Session not found or already terminated' }
    }

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to stop AgentCore session: ${response.status} ${errorText}`)
    }

    // Try to parse JSON response, fallback to success message
    try {
      return await response.json()
    } catch {
      return { status: 'success', message: 'Session stopped' }
    }
  }

  async healthCheck() {
    return this._invoke('/health', 'GET')
  }

  async createSession(payload) {
    return this._invoke('/sessions', 'POST', payload)
  }

  async getSessionStatus(sessionId) {
    try {
      const data = await this._invoke(
        '/sessions/{session_id}/status',
        'GET',
        null,
        { session_id: sessionId }
      )
      return { response: { ok: true, status: 200 }, data }
    } catch (error) {
      // Handle 404 and 424 (Failed Dependency from AgentCore) - both mean session not found
      if (error.status === 404 ||
          error.status === 424 ||
          error.message.includes('404') ||
          error.detail?.includes('not found')) {
        return { response: { ok: false, status: 404 }, data: null }
      }
      throw error
    }
  }

  async getSessionHistory(sessionId, cwd = null) {
    try {
      const queryParams = cwd ? { cwd } : null
      const data = await this._invoke(
        '/sessions/{session_id}/history',
        'GET',
        null,
        { session_id: sessionId },
        queryParams
      )
      return { response: { ok: true, status: 200 }, data }
    } catch (error) {
      // Return appropriate status code
      const status = error.status || 500
      return { response: { ok: false, status }, data: null }
    }
  }

  async sendMessage(sessionId, message) {
    return this._invoke(
      '/sessions/{session_id}/messages',
      'POST',
      { message },
      { session_id: sessionId }
    )
  }

  async sendMessageStream(sessionId, message, model = null, mcpServerIds = null) {
    const authHeaders = await getAuthHeaders()

    // Build payload with optional model and mcp_server_ids
    const payload = { message }
    if (model) payload.model = model
    if (mcpServerIds !== null) payload.mcp_server_ids = mcpServerIds

    const body = {
      path: '/sessions/{session_id}/messages/stream',
      method: 'POST',
      payload,
      path_params: { session_id: sessionId }
    }

    const headers = {
      'Content-Type': 'application/json',
      ...authHeaders
    }

    if (this.agentCoreSessionId) {
      headers['X-Amzn-Bedrock-AgentCore-Runtime-Session-Id'] = this.agentCoreSessionId
    }

    try {
      const response = await fetch(`${this.baseUrl}/invocations`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      })

      handleFetchResponse(response)

      if (!response.ok || !response.body) {
        throw new Error(`Failed to create stream: ${response.status}`)
      }

      // Parse SSE from response body
      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      // Create an object that mimics EventSource API
      const eventSource = {
        onmessage: null,
        onerror: null,
        close: () => reader.cancel(),
        _buffer: '',

        async _processStream() {
          try {
            while (true) {
              const { done, value } = await reader.read()

              if (done) break

              this._buffer += decoder.decode(value, { stream: true })
              const lines = this._buffer.split('\n')
              this._buffer = lines.pop() || ''

              for (const line of lines) {
                const trimmed = line.trim()
                if (trimmed.startsWith('data: ')) {
                  const jsonStr = trimmed.substring(6)
                  if (this.onmessage) {
                    this.onmessage({ data: jsonStr })
                  }
                }
              }
            }
          } catch (error) {
            if (this.onerror) {
              this.onerror(error)
            }
          }
        }
      }

      // Start processing the stream
      eventSource._processStream()

      return eventSource
    } catch (error) {
      throw error
    }
  }

  async respondToPermission(sessionId, requestId, allowed, applySuggestions = false) {
    return this._invoke(
      '/sessions/{session_id}/permissions/respond',
      'POST',
      {
        request_id: requestId,
        allowed: allowed,
        apply_suggestions: applySuggestions
      },
      { session_id: sessionId }
    )
  }

  async sendToolResult(sessionId, toolResultMessage) {
    return this._invoke(
      '/sessions/{session_id}/messages',
      'POST',
      {
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: toolResultMessage.tool_use_id,
              content: toolResultMessage.content
            }
          ]
        }
      },
      { session_id: sessionId }
    )
  }

  async deleteSession(sessionId) {
    try {
      await this._invoke(
        '/sessions/{session_id}',
        'DELETE',
        null,
        { session_id: sessionId }
      )
      return true
    } catch (error) {
      return false
    }
  }

  async closeAllSessions(cwd = null) {
    const payload = cwd ? { cwd } : {}
    return this._invoke('/sessions/close_all', 'POST', payload)
  }

  async interruptSession(sessionId) {
    return this._invoke(
      '/sessions/{session_id}/interrupt',
      'POST',
      null,
      { session_id: sessionId }
    )
  }

  async listSessions(cwd = null) {
    const payload = cwd ? { cwd } : null
    return this._invoke('/sessions', 'GET', payload)
  }

  async listAvailableSessions(cwd = null) {
    const payload = cwd ? { cwd } : null
    return this._invoke('/sessions/available', 'GET', payload)
  }

  async listFiles(path = '.', projectName = null) {
    const payload = { path }
    if (projectName) payload.project_name = projectName
    return this._invoke('/files', 'GET', payload)
  }

  async getFileInfo(path, projectName = null) {
    const payload = { path }
    if (projectName) payload.project_name = projectName
    return this._invoke('/files/info', 'GET', payload)
  }

  async saveFile(path, content, projectName = null) {
    const payload = { path, content }
    if (projectName) payload.project_name = projectName
    return this._invoke('/files/save', 'POST', payload)
  }

  async deleteFile(path, projectName = null) {
    const payload = { path }
    if (projectName) payload.project_name = projectName
    return this._invoke('/files/delete', 'POST', payload)
  }

  async getRawFile(path, projectName = null) {
    // For raw file download, we need to handle the response specially
    // since it returns binary data, not JSON
    const authHeaders = await getAuthHeaders()
    const payload = { path }
    if (projectName) payload.project_name = projectName

    const body = {
      path: '/files/raw',
      method: 'GET',
      payload
    }

    const headers = {
      'Content-Type': 'application/json',
      ...authHeaders
    }

    if (this.agentCoreSessionId) {
      headers['X-Amzn-Bedrock-AgentCore-Runtime-Session-Id'] = this.agentCoreSessionId
    }

    const response = await fetch(`${this.baseUrl}/invocations`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    })

    handleFetchResponse(response)

    if (!response.ok) {
      throw new Error('Failed to get raw file')
    }

    return response
  }

  async uploadFile(file, directory, projectName = null) {
    // Convert file to base64 for invocations mode (JSON only)
    const arrayBuffer = await file.arrayBuffer()
    const base64Content = btoa(
      new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    )

    const payload = {
      directory,
      filename: file.name,
      content_base64: base64Content
    }
    if (projectName) payload.project_name = projectName

    return this._invoke('/files/upload', 'POST', payload)
  }

  async executeShellCommand(command, cwd) {
    // For streaming response, we need to handle it specially
    const authHeaders = await getAuthHeaders()
    const body = {
      path: '/shell/execute',
      method: 'POST',
      payload: { command, cwd }
    }

    // Build headers with agent core session ID if available
    const headers = {
      'Content-Type': 'application/json',
      ...authHeaders
    }

    if (this.agentCoreSessionId) {
      headers['X-Amzn-Bedrock-AgentCore-Runtime-Session-Id'] = this.agentCoreSessionId
    }

    const response = await fetch(`${this.baseUrl}/invocations`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      throw new Error('Failed to execute command')
    }

    return response // Return response for streaming
  }

  async getShellCwd() {
    return this._invoke('/shell/cwd', 'GET')
  }

  async setShellCwd(cwd) {
    return this._invoke('/shell/cwd', 'POST', { cwd })
  }

  async createTerminalSession(payload) {
    return this._invoke('/terminal/sessions', 'POST', payload)
  }

  async getTerminalOutput(sessionId, seq) {
    return this._invoke(`/terminal/sessions/{session_id}/output`, 'GET', { seq }, { session_id: sessionId })
  }

  async sendTerminalInput(sessionId, data) {
    return this._invoke('/terminal/sessions/{session_id}/input', 'POST', { data }, { session_id: sessionId })
  }

  async resizeTerminal(sessionId, rows, cols) {
    return this._invoke('/terminal/sessions/{session_id}/resize', 'POST', { rows, cols }, { session_id: sessionId })
  }

  async closeTerminalSession(sessionId) {
    return this._invoke('/terminal/sessions/{session_id}', 'DELETE', null, { session_id: sessionId })
  }

  async getTerminalStatus(sessionId) {
    return this._invoke('/terminal/sessions/{session_id}/status', 'GET', null, { session_id: sessionId })
  }

  async listTerminalSessions() {
    return this._invoke('/terminal/sessions', 'GET')
  }

  async createTerminalStream(sessionId, onData, onError, onEnd) {
    // For invocations mode, we need to POST to /invocations with stream path
    const authHeaders = await getAuthHeaders()
    const body = {
      path: '/terminal/sessions/{session_id}/stream',
      method: 'GET',
      path_params: { session_id: sessionId }
    }

    const headers = {
      'Content-Type': 'application/json',
      ...authHeaders
    }

    if (this.agentCoreSessionId) {
      headers['X-Amzn-Bedrock-AgentCore-Runtime-Session-Id'] = this.agentCoreSessionId
    }

    try {
      const response = await fetch(`${this.baseUrl}/invocations`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      })

      if (!response.ok || !response.body) {
        onError(new Error(`Failed to create stream: ${response.status}`))
        return null
      }

      // Parse SSE from response body
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      const processStream = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read()

            if (done) {
              if (onEnd) onEnd(null)
              break
            }

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
              const trimmed = line.trim()
              if (trimmed.startsWith('data: ')) {
                try {
                  const jsonStr = trimmed.substring(6)
                  const data = JSON.parse(jsonStr)

                  if (data.error) {
                    onError(new Error(data.error))
                    reader.cancel()
                    return
                  }

                  onData(data)

                  if (data.exit_code !== null) {
                    if (onEnd) onEnd(data.exit_code)
                    reader.cancel()
                    return
                  }
                } catch (err) {
                  // Ignore JSON parse errors for individual events
                }
              }
            }
          }
        } catch (error) {
          onError(error)
        }
      }

      processStream()

      // Return an object with close method for cleanup
      return {
        close: () => {
          reader.cancel()
        }
      }
    } catch (error) {
      onError(error)
      return null
    }
  }

  async listGithubRepositories() {
    return this._invoke('/github/repositories', 'GET')
  }

  async createProjectFromGithub(userId, repositoryUrl, projectName = null, branch = null) {
    const params = {
      user_id: userId,
      repository_url: repositoryUrl
    }
    if (projectName) params.project_name = projectName
    if (branch) params.branch = branch

    return this._invoke('/github/create-project', 'POST', null, params)
  }

  // Git operations
  async getGitLog(cwd, limit = 10) {
    return this._invoke('/git/log', 'POST', { cwd, limit })
  }

  async getGitStatus(cwd) {
    return this._invoke('/git/status', 'POST', { cwd })
  }

  async createGitCommit(cwd, message, files = null) {
    return this._invoke('/git/commit', 'POST', { cwd, message, files })
  }

  async pushGitCommits(cwd, remote = 'origin', branch = null) {
    return this._invoke('/git/push', 'POST', { cwd, remote, branch })
  }

  async getGitDiff(cwd, commitHash) {
    return this._invoke('/git/diff', 'POST', { cwd, commit_hash: commitHash })
  }

  // Plugin management
  async listPlugins() {
    return this._invoke('/plugins', 'GET')
  }

  async addMarketplace(name, gitUrl) {
    return this._invoke('/plugins/marketplaces', 'POST', { name, git_url: gitUrl })
  }

  async deleteMarketplace(marketplaceName) {
    return this._invoke('/plugins/marketplaces/{marketplace_name}', 'DELETE', null, { marketplace_name: marketplaceName })
  }

  async updateMarketplace(marketplaceName) {
    return this._invoke('/plugins/marketplaces/{marketplace_name}/update', 'POST', null, { marketplace_name: marketplaceName })
  }

  async installPlugin(pluginName, marketplaceName) {
    return this._invoke('/plugins/install', 'POST', { plugin_name: pluginName, marketplace_name: marketplaceName })
  }

  async uninstallPlugin(pluginKey) {
    return this._invoke('/plugins/install/{plugin_key}', 'DELETE', null, { plugin_key: pluginKey })
  }

  async getPluginDetail(marketplaceName, pluginName) {
    return this._invoke('/plugins/{marketplace_name}/{plugin_name}', 'GET', null, { marketplace_name: marketplaceName, plugin_name: pluginName })
  }

  // Environment variables management
  async listEnvVars() {
    return this._invoke('/env-vars', 'GET')
  }

  async setEnvVar(key, value) {
    return this._invoke('/env-vars', 'POST', { key, value })
  }

  async deleteEnvVar(key) {
    return this._invoke('/env-vars/{key}', 'DELETE', null, { key })
  }

  async setAllEnvVars(envVars) {
    return this._invoke('/env-vars', 'PUT', { env_vars: envVars })
  }
}

/**
 * Create API client based on configuration
 * @param {string} baseUrl - Base URL for API server
 * @param {string|null} agentCoreSessionId - Optional agent core session ID for invocations mode
 * @returns {DirectAPIClient|InvocationsAPIClient}
 */
export function createAPIClient(baseUrl, agentCoreSessionId = null) {
  if (USE_INVOCATIONS) {
    console.log('🔀 Using Invocations API mode')
    if (agentCoreSessionId) {
      console.log(`🆔 Agent Core Session ID: ${agentCoreSessionId}`)
    }
    return new InvocationsAPIClient(baseUrl, agentCoreSessionId)
  } else {
    console.log('📡 Using Direct API mode')
    return new DirectAPIClient(baseUrl)
  }
}

export { USE_INVOCATIONS }
