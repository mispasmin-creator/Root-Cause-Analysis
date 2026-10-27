// R&D — pure functions over the built model (no React, no Supabase) so they can be checked from Node.
// Input is { batches: [{ b, o }] } — b = batch, o = its order.

import { autoRemarks } from './rca.js'

// ---------------------------------------------------------------------------------------------
// Phase 1 — data quality check: does the remark the user wrote (root cause) agree with what the
// system itself found for the batch (auto remark from the mix comparison + lab)?
// ---------------------------------------------------------------------------------------------

/** What each root-cause category needs the system to have seen, to be believable. */
const CAUSE_NEEDS = {
  'Raw material shortage / substitution': { sub: true, text: 'a material replaced / added / skipped' },
  'Planned composition change': { mix: true, text: 'a change in the mix' },
  'Raw material quality (lot variation)': { mix: true, lab: true, text: 'a quantity change or a lab failure' },
  'Weighing / measurement error': { qty: true, text: 'a quantity off the composition' },
  'Operator / process error': { mix: true, lab: true, text: 'a mix change or a lab failure' },
  'Data entry error (unit / qty)': { kg: true, qty: true, text: 'a kg entry or a quantity off the composition' },
  'Lab instruction': { mix: true, text: 'a change in the mix' },
}

function systemSignals(b) {
  const lines = b.vsStandard?.lines || []
  const sub = lines.some((l) => l.status === 'added' || l.status === 'missing')
  const qty = lines.some((l) => l.status === 'major' || l.status === 'minor')
  return { sub, qty, mix: sub || qty, kg: Boolean(b.unitFixes?.length), lab: (b.labCheck?.out || 0) > 0 }
}

/**
 * One row per batch that has either a system finding or a user remark.
 * check: 'match' | 'mismatch' | 'missing' (system found something, user wrote nothing) | 'unverified' (category "Other")
 */
export function remarkCheck(a) {
  const rows = []
  for (const x of a.batches) {
    const b = x.b
    const sig = systemSignals(b)
    const system = [
      ...autoRemarks(b.vsStandard, x.o.names),
      ...(sig.kg ? [`${b.unitFixes.map((u) => x.o.names[u.key] || u.name).join(', ')} entered in kg`] : []),
      ...(b.labCheck?.items || []).filter((i) => i.status === 'major' || i.status === 'minor').map((i) => `${i.label} ${String(i.actualText).trim()} (target ${i.targetText})`),
    ]
    const typed = [String(b.remarks ?? '').trim(), String(b.jobCardRow?.Notes ?? '').trim()].filter((t) => t && !/^0+$/.test(t))
    const reviews = b.reviews || []
    if (!system.length && !reviews.length) continue

    let check
    let reason
    if (!reviews.length) {
      check = 'missing'
      reason = 'System found a difference but no root cause is written'
    } else {
      const r = reviews[0] // latest
      const need = CAUSE_NEEDS[r.root_cause_category]
      if (!need) {
        check = 'unverified'
        reason = '“Other” — cannot be checked automatically'
      } else if (!system.length) {
        check = 'mismatch'
        reason = 'User gave a cause, but the system found the batch as per composition and lab'
      } else {
        const ok = (need.sub && sig.sub) || (need.qty && sig.qty) || (need.mix && sig.mix) || (need.kg && sig.kg) || (need.lab && sig.lab)
        check = ok ? 'match' : 'mismatch'
        reason = ok ? 'User cause agrees with the system finding' : `“${r.root_cause_category}” expects ${need.text}, the system did not see that`
      }
    }
    // does the user's text name a material the system flagged? (extra confidence, shown only)
    const flagged = (b.vsStandard?.lines || []).filter((l) => l.status !== 'ok').map((l) => x.o.names[l.key] || l.key)
    const userText = reviews.map((r) => [r.root_cause_detail, r.analytics_report, r.remarks].join(' ')).join(' ').toLowerCase()
    const mentions = flagged.filter((n) => userText.includes(String(n).toLowerCase().replace(/\s*\(.*$/, '').trim()))
    rows.push({ ...x, system, typed, reviews, check, reason, mentions: [...new Set(mentions)] })
  }
  rows.sort((p, q) => (q.b.sortKey || 0) - (p.b.sortKey || 0))
  const count = (c) => rows.filter((r) => r.check === c).length
  const withUser = rows.filter((r) => r.reviews.length && r.check !== 'unverified').length
  const score = withUser ? (count('match') / withUser) * 100 : null
  return {
    rows,
    match: count('match'),
    mismatch: count('mismatch'),
    missing: count('missing'),
    unverified: count('unverified'),
    score, // % of checkable user remarks that agree with the system
    coverage: rows.length ? ((rows.length - count('missing')) / rows.length) * 100 : null, // % of flagged batches that have a user remark
  }
}

// ---------------------------------------------------------------------------------------------
// Phase 2 — lab failure: lab results outside target, and lab data that is not proper in the report
// (value typed but unreadable, test not filled, no target in the composition).
// ---------------------------------------------------------------------------------------------

export function labFailures(a) {
  const rows = []
  for (const x of a.batches) {
    const items = x.b.labCheck?.items || []
    if (!x.b.labCheck?.tested) continue
    const failed = items.filter((i) => i.status === 'major' || i.status === 'minor')
    const issues = []
    // only problems in the lab report itself; Al₂O₃ / Fe₂O₃ are optional (rarely tested) and a missing target is a
    // composition gap, so neither is counted here (both still show in the batch's lab table)
    items.forEach((i) => {
      const t = i.actualText === null || i.actualText === undefined ? '' : String(i.actualText).trim()
      if (i.status === 'na' && t && !/^n\.?a\.?$/i.test(t)) issues.push(`${i.label}: “${t}” cannot be read as a value`)
      else if (i.status === 'na' && i.kind !== 'chem' && i.targetText) issues.push(`${i.label}: target ${i.targetText} but ${t ? 'marked NA' : 'no result entered'}`)
    })
    if (!failed.length && !issues.length) continue
    rows.push({ ...x, items, failed, issues })
  }
  return rows.sort((p, q) => (q.b.sortKey || 0) - (p.b.sortKey || 0))
}
