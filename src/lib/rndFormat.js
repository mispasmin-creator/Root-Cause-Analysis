// Small display helpers shared by the R&D pages (kept out of component files so fast refresh works).

export const pct = (v, d = 1) => (v === null || v === undefined ? '—' : `${v.toFixed(d)}%`)
export const orderLink = (o, b) => `/orders/${encodeURIComponent(o.key)}${b ? `?batch=${b.id}` : ''}`

/** Phase 1 remark check → badge */
export const CHECK = {
  match: { tone: 'ok', label: 'Matches' },
  mismatch: { tone: 'major', label: 'Mismatch' },
  missing: { tone: 'minor', label: 'No user remark' },
  unverified: { tone: '', label: 'Check manually' },
}
