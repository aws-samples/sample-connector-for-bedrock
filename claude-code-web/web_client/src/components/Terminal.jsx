import { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'
import { Maximize2, Minimize2, X } from 'lucide-react'
import { createAPIClient } from '../api/client'

function Terminal({ serverUrl, initialCwd, onClose }) {
  const terminalRef = useRef(null)
  const xtermRef = useRef(null)
  const fitAddonRef = useRef(null)
  const apiClientRef = useRef(null)
  const [cwd, setCwd] = useState(initialCwd || '/workspace')
  const cwdRef = useRef(initialCwd || '/workspace')
  const [commandHistory, setCommandHistory] = useState([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const currentLineRef = useRef('')

  // Initialize API client
  useEffect(() => {
    apiClientRef.current = createAPIClient(serverUrl)
  }, [serverUrl])

  // Initialize terminal
  useEffect(() => {
    if (!terminalRef.current) return

    // Create terminal instance
    const xterm = new XTerm({
      cursorBlink: false,
      cursorStyle: 'block',
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#ffffff',
        cursorAccent: '#1e1e1e',
        selection: '#264f78',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightRed: '#f14c4c',
        brightGreen: '#23d18b',
        brightYellow: '#f5f543',
        brightBlue: '#3b8eea',
        brightMagenta: '#d670d6',
        brightCyan: '#29b8db',
        brightWhite: '#ffffff',
      },
      fontSize: 14,
      fontFamily: 'Monaco, Menlo, "Courier New", monospace',
      rows: 24,
      cols: 80,
    })

    // Create fit addon
    const fitAddon = new FitAddon()
    xterm.loadAddon(fitAddon)

    // Open terminal
    xterm.open(terminalRef.current)
    fitAddon.fit()

    xtermRef.current = xterm
    fitAddonRef.current = fitAddon

    // Welcome message
    xterm.writeln('\x1b[1;32mWeb Terminal\x1b[0m')
    xterm.writeln('Type commands and press Enter to execute.')
    xterm.writeln('')

    // Show prompt
    showPrompt()

    // Handle input
    let currentLine = ''
    xterm.onData((data) => {
      const code = data.charCodeAt(0)

      if (code === 13) { // Enter
        xterm.writeln('')
        if (currentLine.trim()) {
          executeCommand(currentLine.trim())
          setCommandHistory(prev => [...prev, currentLine.trim()])
          setHistoryIndex(-1)
        } else {
          showPrompt()
        }
        currentLine = ''
        currentLineRef.current = ''
      } else if (code === 127) { // Backspace
        if (currentLine.length > 0) {
          currentLine = currentLine.slice(0, -1)
          currentLineRef.current = currentLine
          xterm.write('\b \b')
        }
      } else if (code === 27) { // Escape sequence (arrow keys)
        // Handle arrow keys for history
        if (data === '\x1b[A') { // Up arrow
          if (commandHistory.length > 0 && historyIndex < commandHistory.length - 1) {
            const newIndex = historyIndex + 1
            setHistoryIndex(newIndex)
            const cmd = commandHistory[commandHistory.length - 1 - newIndex]
            // Clear current line
            xterm.write('\r\x1b[K')
            showPrompt(false)
            xterm.write(cmd)
            currentLine = cmd
            currentLineRef.current = cmd
          }
        } else if (data === '\x1b[B') { // Down arrow
          if (historyIndex > 0) {
            const newIndex = historyIndex - 1
            setHistoryIndex(newIndex)
            const cmd = commandHistory[commandHistory.length - 1 - newIndex]
            // Clear current line
            xterm.write('\r\x1b[K')
            showPrompt(false)
            xterm.write(cmd)
            currentLine = cmd
            currentLineRef.current = cmd
          } else if (historyIndex === 0) {
            setHistoryIndex(-1)
            // Clear current line
            xterm.write('\r\x1b[K')
            showPrompt(false)
            currentLine = ''
            currentLineRef.current = ''
          }
        }
      } else if (code >= 32) { // Printable characters
        currentLine += data
        currentLineRef.current = currentLine
        xterm.write(data)
      }
    })

    // Handle resize
    const handleResize = () => {
      fitAddon.fit()
    }
    window.addEventListener('resize', handleResize)

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize)
      xterm.dispose()
    }
  }, [])

  // Sync cwdRef with cwd state
  useEffect(() => {
    cwdRef.current = cwd
  }, [cwd])

  // Auto focus terminal when it's shown
  useEffect(() => {
    if (xtermRef.current) {
      // Small delay to ensure terminal is rendered
      setTimeout(() => {
        xtermRef.current?.focus()
      }, 150)
    }
  }, [])

  // Fit terminal on mount and when container size changes
  useEffect(() => {
    if (!fitAddonRef.current) return

    const fitTerminal = () => {
      try {
        fitAddonRef.current?.fit()
      } catch (e) {
        // Ignore fit errors
      }
    }

    // Initial fit
    const timer = setTimeout(fitTerminal, 100)

    // Observe container size changes
    const resizeObserver = new ResizeObserver(() => {
      fitTerminal()
    })

    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current)
    }

    // Also listen to window resize
    window.addEventListener('resize', fitTerminal)

    return () => {
      clearTimeout(timer)
      resizeObserver.disconnect()
      window.removeEventListener('resize', fitTerminal)
    }
  }, [fitAddonRef.current])

  const showPrompt = (newline = true) => {
    if (newline) {
      xtermRef.current.write('\r\n')
    }
    xtermRef.current.write(`\x1b[1;36m${cwdRef.current}\x1b[0m $ `)
  }

  const executeCommand = async (command) => {
    const xterm = xtermRef.current

    try {
      const response = await apiClientRef.current.executeShellCommand(
        command,
        cwdRef.current
      )

      if (!response.ok) {
        xterm.writeln(`\x1b[1;31mError: ${response.statusText}\x1b[0m`)
        showPrompt()
        return
      }

      // Stream the output
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          if (buffer) {
            xterm.write(buffer)
          }
          break
        }

        buffer += decoder.decode(value, { stream: true })

        // Process complete lines
        const lines = buffer.split('\n')
        buffer = lines.pop() // Keep the last incomplete line in buffer

        for (const line of lines) {
          xterm.write(line + '\r\n')
        }
      }

      // Update cwd if it was a cd command
      if (command.trim().startsWith('cd ')) {
        try {
          const data = await apiClientRef.current.getShellCwd()
          setCwd(data.cwd)
          cwdRef.current = data.cwd
        } catch (error) {
          // Ignore errors
        }
      }

      showPrompt()
    } catch (error) {
      xterm.writeln(`\x1b[1;31mError: ${error.message}\x1b[0m`)
      showPrompt()
    }
  }

  return (
    <>
      <div className="terminal-header">
        <span className="terminal-title">Terminal - {cwd}</span>
        <div className="terminal-actions">
          <button
            className="btn-icon btn-terminal-action"
            onClick={onClose}
            title="Close terminal"
          >
            <X size={16} />
          </button>
        </div>
      </div>
      <div ref={terminalRef} className="terminal-content" />
    </>
  )
}

export default Terminal
