export const fmtNum = (v, digits = 2) =>
  v === null || v === undefined || !Number.isFinite(v)
    ? '—'
    : v.toLocaleString('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: 0 })

export const fmtPct = (v, digits = 1) => (Number.isFinite(v) ? `${v.toFixed(digits)}%` : '—')

/** signed percentage-point delta: +2.5 pp */
export const fmtPp = (v, digits = 1) => {
  if (!Number.isFinite(v)) return '—'
  const s = v.toFixed(digits)
  return `${v > 0 ? '+' : ''}${s} pp`
}

export const fmtMt = (v) => (Number.isFinite(v) ? `${fmtNum(v, 2)} MT` : '—')

export const fmtDate = (v) => {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return String(v)
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export const fmtInr = (v) =>
  Number.isFinite(v) ? `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—'
