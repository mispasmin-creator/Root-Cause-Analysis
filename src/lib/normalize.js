// Matching helpers — same rules as Production-FMS lib/matching-utils.ts so records link identically.

/** "DO-306", "do 306", "DO306" → "do306" */
export const normalizeKey = (v) => String(v ?? '').toLowerCase().replace(/[\s-]/g, '')

/** "D0-306" (zero typo) → 306 */
export const numericDo = (v) => {
  const n = String(v ?? '').replace(/\D/g, '')
  return n ? Number(n) : null
}

/** Display + grouping key for a raw material: trims and collapses inner spaces, keeps case of first spelling. */
export const materialKey = (name) => String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase()

export const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

export const FIRM_MAP = {
  Purab: 'PURAB ORDER',
  Pmmpl: 'PMMPL ORDER',
  Rkl: 'RKL ORDER',
}

/** Short label for a firm column value: "PMMPL ORDER" → "PMMPL" */
export const firmLabel = (firm) => String(firm ?? '').replace(/\s*order\s*$/i, '').trim() || '—'

/** login.Firm ("Pmmpl,Rkl") → lowercase match values incl. mapped names */
export const firmMatchValues = (firm) =>
  String(firm ?? '')
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean)
    .flatMap((raw) => {
      const mapped =
        Object.entries(FIRM_MAP).find(
          ([k, v]) => k.toLowerCase() === raw.toLowerCase() || v.toLowerCase() === raw.toLowerCase(),
        )?.[1] || ''
      return [raw, mapped].map((s) => s.toLowerCase().trim()).filter(Boolean)
    })

/** Admins see everything; others see rows whose firm loosely matches their login firm(s). */
export const userCanSeeFirm = (user, firmName) => {
  if (!user || String(user.role).toLowerCase() === 'admin' || !user.firm) return true
  const f = String(firmName ?? '').toLowerCase().trim()
  if (!f) return false
  return firmMatchValues(user.firm).some((m) => f.includes(m) || m.includes(f))
}
