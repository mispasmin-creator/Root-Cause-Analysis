import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { productionDb, TABLES } from '../lib/supabase.js'
import { ACCESS_PAGE_IDS } from '../lib/constants.js'

// Login uses the same `login` table as Production-FMS (no Supabase Auth). See RULES.md §Auth.
// Session is kept in localStorage so the user stays logged in across tabs, refreshes and browser restarts
// until they click Log out. Only id/username/role/firm/pages are stored — never the password.
const SESSION_KEY = 'rca_user'

const AuthContext = createContext(null)

function readSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY) // old sessions
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readSession)

  const login = useCallback(async (username, password) => {
    const name = username.trim()
    if (!name || !password) return { ok: false, error: 'Enter username and password' }
    const { data, error } = await productionDb
      .from(TABLES.login)
      .select('*')
      .ilike('User name', name)
      .limit(5)
    if (error) return { ok: false, error: error.message }
    const row = (data || []).find((r) => String(r.Pass ?? '') === password)
    if (!row) return { ok: false, error: 'Invalid username or password' }

    const role = String(row.Role || 'user').toLowerCase()
    const pages = String(row.Pages || '')
      .split(',')
      .map((p) => p.split(':')[0].trim().toLowerCase())
      .filter(Boolean)
    if (role !== 'admin' && !pages.some((p) => ACCESS_PAGE_IDS.includes(p)))
      return {
        ok: false,
        error: `No access. Ask admin to add "rca" (or "composition-qc") to your Pages in Production-FMS settings.`,
      }

    const u = { id: row.ID, username: row['User name'], role, firm: row.Firm || '', pages }
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(u))
    } catch {
      // storage blocked (private window) — user stays logged in until this page is closed
    }
    setUser(u)
    return { ok: true }
  }, [])

  const logout = useCallback(() => {
    try {
      localStorage.removeItem(SESSION_KEY)
      sessionStorage.removeItem(SESSION_KEY)
    } catch {
      // ignore
    }
    setUser(null)
  }, [])

  const value = useMemo(() => ({ user, login, logout, isAdmin: user?.role === 'admin' }), [user, login, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react/only-export-components
export const useAuth = () => useContext(AuthContext)
