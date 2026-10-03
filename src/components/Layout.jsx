import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useData } from '../context/DataContext.jsx'
import { Loader, Notice } from './ui.jsx'
import {
  IconCompare,
  IconDashboard,
  IconLayers,
  IconLogout,
  IconMenu,
  IconOrders,
  IconRefresh,
} from './Icons.jsx'

const NAV = [
  { to: '/', label: 'Dashboard', icon: IconDashboard, end: true },
  { to: '/orders', label: 'Orders & Batches', icon: IconOrders },
  { to: '/compare', label: 'Compare Batches', icon: IconCompare },
  { to: '/materials', label: 'Raw Materials', icon: IconLayers },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const { status, reload, model } = useData()
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const [lastPath, setLastPath] = useState(location.pathname)
  // close the mobile menu on navigation
  if (lastPath !== location.pathname) {
    setLastPath(location.pathname)
    setOpen(false)
  }

  return (
    <div className="shell">
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <img src="/logo.png" alt="Passary logo" className="brand-logo" />
          <div>
            <div className="brand-title">Root Cause Analysis</div>
            <div className="brand-sub">Passary · Batch composition</div>
          </div>
        </div>
        <nav className="nav">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}>
              <Icon />
              {label}
            </NavLink>
          ))}
        </nav>
        <div style={{ padding: '0 12px 10px' }}>
          <button className="btn btn-sm" style={{ width: '100%', justifyContent: 'center' }} onClick={reload} disabled={status.loading}>
            <IconRefresh /> {status.loading ? 'Refreshing…' : 'Refresh data'}
          </button>
          {status.loadedAt && (
            <div className="faint" style={{ fontSize: 11, textAlign: 'center', marginTop: 6 }}>
              Synced {status.loadedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
        </div>
        <div className="sidebar-foot">
          <div className="avatar">{(user?.username || '?').slice(0, 1).toUpperCase()}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="truncate" style={{ fontWeight: 600 }}>
              {user?.username}
            </div>
            <div className="faint truncate" style={{ fontSize: 11 }}>
              {user?.role === 'admin' ? 'Admin · all firms' : user?.firm || 'User'}
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={logout} title="Log out" aria-label="Log out">
            <IconLogout />
          </button>
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)} aria-label="Open menu">
            <IconMenu />
          </button>
          <img src="/logo.png" alt="" className="brand-logo sm" />
          <b>Root Cause Analysis</b>
        </div>
        <main className="content">
          {status.error && (
            <div style={{ marginBottom: 16 }}>
              <Notice kind="err">
                Could not load data: {status.error}{' '}
                <button className="btn btn-sm" onClick={reload}>
                  Retry
                </button>
              </Notice>
            </div>
          )}
          {!model && status.loading ? <Loader /> : model ? <Outlet /> : null}
        </main>
      </div>
    </div>
  )
}
