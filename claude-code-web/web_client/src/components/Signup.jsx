import { useState } from 'react'
import { useAuth } from '../hooks/useAuth.jsx'
import { Mail, Lock, Loader2, AlertCircle, CheckCircle, User } from 'lucide-react'

function Signup({ onSwitchToLogin }) {
  const [step, setStep] = useState('signup') // 'signup' or 'confirm'
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState('')

  const { signup, confirmSignup, resendCode } = useAuth()

  const handleSignup = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    // Validate passwords match
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    // Validate password strength (Cognito requires minimum 8 characters)
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    // Validate email domain if restriction is enabled
    const allowedDomains = import.meta.env.VITE_ALLOWED_EMAIL_DOMAINS
    if (allowedDomains) {
      const domainList = allowedDomains.split(',').map(d => d.trim().toLowerCase())
      const emailDomain = email.split('@')[1]?.toLowerCase()

      if (!emailDomain || !domainList.includes(emailDomain)) {
        setError(
          `Registration is restricted to specific email domains. ` +
          `Allowed domains: ${domainList.join(', ')}`
        )
        return
      }
    }

    setLoading(true)

    try {
      console.log('🚀 Submitting signup form...')
      const result = await signup(username, email, password)
      console.log('📬 Signup result received:', result)

      if (result.success) {
        console.log('✅ Signup successful, switching to confirm step')
        console.log('Next step details:', result.nextStepDetails)

        // Check if email delivery details are present
        const deliveryDetails = result.nextStepDetails?.codeDeliveryDetails
        if (deliveryDetails && !deliveryDetails.destination && !deliveryDetails.deliveryMedium) {
          // Email delivery details are missing - Cognito configuration issue
          console.warn('⚠️  Email delivery details missing:', deliveryDetails)
          console.error('❌ Cognito is not configured to send verification emails!')
          console.error('To fix: AWS Console → Cognito → User Pool → Sign-up experience')
          console.error('Enable "Email" in "Attribute verification and user account confirmation"')

          setError(
            'Account created but verification email was not sent. ' +
            'Cognito email verification is not properly configured. ' +
            'Please contact the administrator to enable email verification in Cognito User Pool settings.'
          )
          return
        }

        setSuccess('Account created! Check your email for verification code.')
        setStep('confirm')
      } else if (result.canResend) {
        // Username exists but unconfirmed - allow resend
        console.log('⚠️ Username exists, allowing resend verification')
        setError(result.error)
        setStep('confirm')
      } else {
        console.log('❌ Signup failed:', result.error)
        setError(result.error || 'Signup failed. Please try again.')
      }
    } catch (err) {
      console.error('💥 Unexpected error in handleSignup:', err)
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleConfirm = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      const result = await confirmSignup(username, code)

      if (result.success) {
        setSuccess('Email verified! Redirecting to login...')
        setTimeout(() => {
          onSwitchToLogin()
        }, 2000)
      } else {
        setError(result.error || 'Verification failed. Please try again.')
      }
    } catch (err) {
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleResendCode = async () => {
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      const result = await resendCode(username)
      if (result.success) {
        setSuccess('Verification code sent! Check your email.')
      } else {
        setError(result.error || 'Failed to resend code')
      }
    } catch (err) {
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1>🤖 Claude Agent</h1>
          <h2>{step === 'signup' ? 'Create Account' : 'Verify Email'}</h2>
          <p>
            {step === 'signup'
              ? 'Sign up to start using Claude Agent'
              : 'Enter the verification code sent to your email'}
          </p>
        </div>

        {step === 'signup' ? (
          <form onSubmit={handleSignup} className="auth-form">
            {error && (
              <div className="auth-error">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="auth-success">
                <CheckCircle size={16} />
                <span>{success}</span>
              </div>
            )}

            <div className="form-group">
              <label htmlFor="username">
                <User size={16} />
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="username"
                required
                autoComplete="username"
                disabled={loading}
                minLength={3}
              />
              <small>At least 3 characters, letters and numbers only</small>
            </div>

            <div className="form-group">
              <label htmlFor="email">
                <Mail size={16} />
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                disabled={loading}
              />
              {import.meta.env.VITE_ALLOWED_EMAIL_DOMAINS && (
                <small>
                  Only these domains are allowed: {
                    import.meta.env.VITE_ALLOWED_EMAIL_DOMAINS
                      .split(',')
                      .map(d => d.trim())
                      .join(', ')
                  }
                </small>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="password">
                <Lock size={16} />
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="new-password"
                disabled={loading}
                minLength={8}
              />
              <small>Must be at least 8 characters</small>
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">
                <Lock size={16} />
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="new-password"
                disabled={loading}
                minLength={8}
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={loading || !username || !email || !password || !confirmPassword}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="spinning" />
                  Creating account...
                </>
              ) : (
                'Sign Up'
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={handleConfirm} className="auth-form">
            {error && (
              <div className="auth-error">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="auth-success">
                <CheckCircle size={16} />
                <span>{success}</span>
              </div>
            )}

            <div className="form-group">
              <label htmlFor="code">Verification Code</label>
              <input
                id="code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                required
                disabled={loading}
                maxLength={6}
              />
              <small>Check your email for the 6-digit code</small>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={loading || !code}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="spinning" />
                  Verifying...
                </>
              ) : (
                'Verify Email'
              )}
            </button>

            <button
              type="button"
              onClick={handleResendCode}
              className="btn btn-secondary btn-block"
              disabled={loading}
            >
              Resend Code
            </button>
          </form>
        )}

        <div className="auth-footer">
          <p>
            Already have an account?{' '}
            <button
              type="button"
              onClick={onSwitchToLogin}
              className="link-button"
              disabled={loading}
            >
              Sign In
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}

export default Signup
