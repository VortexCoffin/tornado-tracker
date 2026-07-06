import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import TornadoLogo from '../components/TornadoLogo'
import '../auth.css'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      await login(email, password)
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <TornadoLogo size={52} />
          <h1>Log in</h1>
          <p>Access your Canada Tornado Tracker account</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {error && <div className="auth-error">{error}</div>}
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Log in'}
          </button>
        </form>

        <p className="auth-switch">
          No account? <Link to="/signup">Sign up</Link>
        </p>
        <p className="auth-switch">
          <Link to="/">Back to live alerts</Link>
        </p>
      </div>
    </div>
  )
}