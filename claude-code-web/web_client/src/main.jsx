import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.jsx'
import { AuthProvider } from './hooks/useAuth.jsx'
import './style.css'

// Temporarily disable StrictMode to avoid double-mounting effects
// which causes issues with terminal PTY session management
ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter basename="/cc">
    <AuthProvider>
      <Routes>
        <Route path="/" element={<App />} />
      </Routes>
    </AuthProvider>
  </BrowserRouter>
)
