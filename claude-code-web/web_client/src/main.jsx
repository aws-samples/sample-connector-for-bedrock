import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.jsx'
import OAuthCallback from './components/OAuthCallback.jsx'
import { AuthProvider } from './hooks/useAuth.jsx'
import './style.css'

// Temporarily disable StrictMode to avoid double-mounting effects
// which causes issues with terminal PTY session management
ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AuthProvider>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/oauth/callback" element={<OAuthCallback />} />
      </Routes>
    </AuthProvider>
  </BrowserRouter>
)
