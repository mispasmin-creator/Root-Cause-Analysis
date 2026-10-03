// Small presentational primitives. Keep them dumb — no data fetching here.
import { IconAlert, IconInfo, IconSearch } from './Icons.jsx'
import { SEVERITY_LABEL } from '../lib/constants.js'

export function Badge({ tone = '', children, dot = false, title }) {
  return (
    <span className={`badge ${tone ? `b-${tone}` : ''}`} title={title}>
      {dot && <span className="dot" />}
      {children}
    </span>
  )
}

export function SeverityBadge({ severity, label }) {
  if (severity === 'none') return <Badge>{label || 'No batches'}</Badge>
  return (
    <Badge tone={severity} dot>
      {label || SEVERITY_LABEL[severity] || severity}
    </Badge>
  )
}

export function Kpi({ label, value, sub, tone }) {
  return (
    <div className={`card kpi ${tone ? `tone-${tone}` : ''}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  )
}

export function Loader({ text = 'Loading production data…' }) {
  return (
    <div className="loader">
      <div className="spin" />
      <div>{text}</div>
    </div>
  )
}

export function Empty({ title = 'Nothing here', children, icon: Icon = IconSearch }) {
  return (
    <div className="empty">
      <Icon />
      <div style={{ fontWeight: 600, color: 'var(--text)' }}>{title}</div>
      {children && <div style={{ marginTop: 4 }}>{children}</div>}
    </div>
  )
}

export function Notice({ kind = 'info', children }) {
  const Icon = kind === 'info' ? IconInfo : IconAlert
  return (
    <div className={`notice ${kind}`}>
      <Icon />
      <div>{children}</div>
    </div>
  )
}

/** OK / Minor / Major proportions as a thin bar */
export function SevBar({ counts }) {
  const total = (counts.ok || 0) + (counts.minor || 0) + (counts.major || 0)
  if (!total) return <span className="faint">—</span>
  return (
    <div
      className="sevbar"
      title={`OK ${counts.ok} · Minor ${counts.minor} · Major ${counts.major}`}
      role="img"
      aria-label={`OK ${counts.ok}, Minor ${counts.minor}, Major ${counts.major}`}
    >
      {['ok', 'minor', 'major'].map((k) =>
        counts[k] ? <span key={k} style={{ flex: counts[k], background: `var(--${k})` }} /> : null,
      )}
    </div>
  )
}

export function Progress({ value, max }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="progress" title={`${pct.toFixed(0)}%`}>
      <span style={{ width: `${pct}%` }} />
    </div>
  )
}

export function Segmented({ value, onChange, options }) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button key={o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)} type="button">
          {o.label}
        </button>
      ))}
    </div>
  )
}
