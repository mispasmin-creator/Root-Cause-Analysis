import { useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { Notice } from '../components/ui.jsx'

export default function Login() {
  const { user, login } = useAuth()
  const location = useLocation()
  // page the user originally asked for (set by RequireAuth); fall back to the dashboard
  const from = location.state?.from
  const target = from?.pathname && from.pathname !== '/login' ? `${from.pathname}${from.search || ''}` : '/'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to={target} replace />

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await login(username, password)
    setBusy(false)
    if (!res.ok) setError(res.error)
  }

  return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={submit}>
        <img src="/logo.png" alt="Passary logo" className="brand-logo lg" />
        <h1>Root Cause Analysis</h1>
        <p className="muted" style={{ margin: '0 0 20px' }}>
          Sign in with your Production-FMS account.
        </p>
        <div className="stack" style={{ gap: 14 }}>
          {error && <Notice kind="err">{error}</Notice>}
          <div className="field">
            <label htmlFor="u">Username</label>
            <input id="u" className="input" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
          </div>
          <div className="field">
            <label htmlFor="p">Password</label>
            <input
              id="p"
              type="password"
              className="input"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" style={{ justifyContent: 'center', padding: '9px 12px' }} disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </div>
      </form>
    </div>
  )
}
