// R&D insights — read-only analysis of one product across all its orders and batches.
// Pure functions over the built model (no React, no Supabase) so they can be checked from Node.
//
// Lab score  = % of the batch's judged lab tests that are inside the composition target (null when none judged).
//              Very few batches meet every target, so "good" / "weak" are relative to the product:
//              good = top 25 % of its batches by lab score, weak = bottom 25 %.
// RM cost/MT = kg-corrected actual RM cost ÷ FG qty; cost-error batches (isCostError) are left out.

import { LAB_SPECS, isCostError } from './rca.js'
import { materialKey, firmLabel } from './normalize.js'

export const labScore = (b) => (b.labCheck?.checked ? ((b.labCheck.checked - b.labCheck.out) / b.labCheck.checked) * 100 : null)

export function rmCostPerMt(b) {
  const a = b.cost.actualCorrected ?? b.cost.actual
  if (!(a > 0) || !(b.fgQty > 0) || isCostError(b)) return null
  return a / b.fgQty
}

const avg = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null)

function quantile(sorted, q) {
  if (!sorted.length) return null
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

function pearson(xs, ys) {
  const n = xs.length
  const mx = avg(xs)
  const my = avg(ys)
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx
    const dy = ys[i] - my
    sxy += dx * dy
    sxx += dx * dx
    syy += dy * dy
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null
}

/** Products that have batches, most batches first — the R&D product picker. */
export function rndProducts(orders, firm = '') {
  const m = new Map()
  for (const o of orders) {
    if (!o.batches.length) continue
    if (firm && firmLabel(o.firm) !== firm) continue
    const k = materialKey(o.product)
    const e = m.get(k) || { key: k, name: o.product, orders: 0, batches: 0 }
    e.orders += 1
    e.batches += o.batches.length
    m.set(k, e)
  }
  return [...m.values()].sort((a, b) => b.batches - a.batches)
}

/** Everything the R&D page shows for one product. */
export function analyseProduct(orders, productKey, firm = '') {
  const pOrders = orders.filter((o) => o.batches.length && materialKey(o.product) === productKey && (!firm || firmLabel(o.firm) === firm))
  const names = {}
  for (const o of pOrders) for (const [k, v] of Object.entries(o.names)) names[k] ??= v

  const batches = pOrders
    .flatMap((o) => o.batches.map((b) => ({ b, o, score: labScore(b), costMt: rmCostPerMt(b) })))
    .sort((x, y) => (x.b.sortKey || 0) - (y.b.sortKey || 0))
  const scored = batches.filter((x) => x.score !== null)
  const scores = scored.map((x) => x.score).sort((a, b) => a - b)
  const hiCut = quantile(scores, 0.75)
  const loCut = quantile(scores, 0.25)
  // no spread (every batch scored the same) → no good / weak split
  const split = scored.length >= 4 && hiCut > loCut
  const pass = split ? scored.filter((x) => x.score >= hiCut) : []
  const fail = split ? scored.filter((x) => x.score <= loCut) : []
  pass.forEach((x) => (x.verdict = 'good'))
  fail.forEach((x) => (x.verdict = 'weak'))
  const testsJudged = scored.reduce((s, x) => s + x.b.labCheck.checked, 0)
  const testsMet = scored.reduce((s, x) => s + x.b.labCheck.checked - x.b.labCheck.out, 0)
  const costs = batches.map((x) => x.costMt).filter((v) => v !== null)

  // latest approved composition for the product = the reference recipe
  const comps = pOrders.flatMap((o) => o.compositions.map((c) => ({ c, o })))
  const latest = comps.reduce((m, x) => (!m || x.c.sortKey > m.c.sortKey ? x : m), null)

  // ---- good vs bad batches: average mix share per material + the range seen in passing batches
  const keys = new Set()
  batches.forEach((x) => Object.keys(x.b.percents || {}).forEach((k) => keys.add(k)))
  latest?.c.items.forEach((it) => keys.add(it.key))
  const recipe = [...keys]
    .map((k) => {
      const pv = pass.map((x) => x.b.percents?.[k] || 0)
      const fv = fail.map((x) => x.b.percents?.[k] || 0)
      // range over the good batches that actually used the material (10th–90th percentile once there are 5+)
      const sorted = pv.filter((v) => v > 0).sort((a, b) => a - b)
      const passAvg = avg(pv)
      const failAvg = avg(fv)
      return {
        key: k,
        name: names[k] || k,
        approved: latest ? latest.c.percents?.[k] || 0 : null,
        passAvg,
        failAvg,
        delta: passAvg !== null && failAvg !== null ? failAvg - passAvg : null,
        passUsed: sorted.length,
        passLo: sorted.length >= 5 ? quantile(sorted, 0.1) : sorted[0] ?? null,
        passHi: sorted.length >= 5 ? quantile(sorted, 0.9) : sorted[sorted.length - 1] ?? null,
        usedIn: batches.filter((x) => (x.b.percents?.[k] || 0) > 0).length,
      }
    })
    .filter((r) => r.usedIn > 0 || r.approved > 0)
    .sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0) || (b.passAvg ?? 0) - (a.passAvg ?? 0))

  // ---- lab tests: how often each property meets its target, and which way it misses
  const lab = LAB_SPECS.map((spec) => {
    const rows = batches.map((x) => x.b.labCheck?.items.find((i) => i.key === spec.key)).filter(Boolean)
    const judgedRows = rows.filter((r) => ['ok', 'minor', 'major'].includes(r.status))
    const nums = rows.map((r) => r.actual).filter((v) => v !== null && v !== undefined)
    const targets = {}
    rows.forEach((r) => r.targetText && (targets[r.targetText] = (targets[r.targetText] || 0) + 1))
    const target = Object.entries(targets).sort((a, b) => b[1] - a[1])[0]?.[0] || null
    return {
      key: spec.key,
      label: spec.label,
      kind: spec.kind,
      tested: rows.filter((r) => r.status !== 'na').length,
      judged: judgedRows.length,
      ok: judgedRows.filter((r) => r.status === 'ok').length,
      below: judgedRows.filter((r) => r.diff < 0).length,
      above: judgedRows.filter((r) => r.diff > 0).length,
      avg: avg(nums),
      min: nums.length ? Math.min(...nums) : null,
      max: nums.length ? Math.max(...nums) : null,
      target,
    }
  }).filter((l) => l.tested > 0)

  // ---- per approved composition (recipe version): how its batches performed
  const byComp = new Map()
  for (const x of batches) {
    const c = x.b.standard
    const k = c ? c.id : 'none'
    const e = byComp.get(k) || { id: k, no: c ? c.no : 'No composition', date: c?.date || null, doNo: x.o.doNo, batches: [], qty: 0 }
    e.batches.push(x)
    e.qty += x.b.fgQty
    byComp.set(k, e)
  }
  const recipes = [...byComp.values()]
    .map((e) => {
      const sc = e.batches.map((x) => x.score).filter((v) => v !== null)
      const cm = e.batches.map((x) => x.costMt).filter((v) => v !== null)
      const shifts = e.batches.map((x) => x.b.vsStandard?.shift).filter((v) => v !== undefined && v !== null)
      return {
        ...e,
        count: e.batches.length,
        judged: sc.length,
        score: avg(sc),
        costMt: avg(cm),
        avgShift: avg(shifts),
      }
    })
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || (a.costMt ?? Infinity) - (b.costMt ?? Infinity))

  // ---- best batches: highest lab score, then the most tests judged, then the cheapest
  const best = [...scored]
    .sort(
      (x, y) =>
        y.score - x.score ||
        y.b.labCheck.checked - x.b.labCheck.checked ||
        (x.costMt ?? Infinity) - (y.costMt ?? Infinity),
    )
    .slice(0, 10)

  return {
    orders: pOrders,
    names,
    batches,
    scored: scored.length,
    split,
    hiCut,
    loCut,
    pass: pass.length,
    fail: fail.length,
    avgScore: avg(scores),
    testsJudged,
    testsMet,
    costMt: avg(costs),
    costMin: costs.length ? Math.min(...costs) : null,
    costMax: costs.length ? Math.max(...costs) : null,
    producedQty: batches.reduce((s, x) => s + x.b.fgQty, 0),
    latest: latest?.c || null,
    compositions: new Set(comps.map((x) => x.c.no)).size,
    recipe,
    lab,
    recipes,
    best,
  }
}

/**
 * Which materials move a lab result: Pearson r between each material's mix share and the lab value,
 * over batches that have that lab value. Needs ≥ 8 batches and some variation in the material.
 */
export function materialEffects(analysis, labKey) {
  const spec = LAB_SPECS.find((s) => s.key === labKey)
  if (!spec || spec.kind === 'text') return { spec, n: 0, rows: [] }
  const pts = analysis.batches
    .map((x) => ({ x, v: x.b.labCheck?.items.find((i) => i.key === labKey)?.actual }))
    .filter((p) => p.v !== null && p.v !== undefined && Number.isFinite(p.v))
  const rows = analysis.recipe
    .map((m) => {
      const xs = pts.map((p) => p.x.b.percents?.[m.key] || 0)
      const ys = pts.map((p) => p.v)
      const used = xs.filter((v) => v > 0).length
      const r = pts.length >= 8 && used >= 3 ? pearson(xs, ys) : null
      return { key: m.key, name: m.name, r, n: pts.length, used }
    })
    .filter((m) => m.r !== null)
    .sort((a, b) => Math.abs(b.r) - Math.abs(a.r))
  return { spec, n: pts.length, rows }
}

export const strength = (r) => {
  const a = Math.abs(r)
  return a >= 0.6 ? 'Strong' : a >= 0.4 ? 'Moderate' : a >= 0.2 ? 'Weak' : 'None'
}
