// Root Cause Analysis engine — pure functions only (no React, no Supabase).
// Input: raw rows from Production-FMS + ORDER RECEIPT. Output: an order → compositions → batches model
// with per-material deviations and auto-generated findings. See ARCHITECTURE.md §4 for the formulas.

import { normalizeKey, numericDo, materialKey, num } from './normalize.js'

const MAX_RM = 20

export const SEVERITY_RANK = { ok: 0, minor: 1, major: 2 }
export const LINE_RANK = { ok: 0, minor: 1, major: 2, added: 2, missing: 2 }

export const LAB_FIELDS = [
  { key: 'WCPercentage', label: 'WC %' },
  { key: 'InitialSettingTime', label: 'IST' },
  { key: 'FinalSettingTime', label: 'FST' },
  { key: 'BDAt110C', label: 'BD 110°C' },
  { key: 'CCSAt100C', label: 'CCS 110°C' },
  { key: 'BDAt1100C', label: 'BD 1100°C' },
  { key: 'CCSAt1100C', label: 'CCS 1100°C' },
  { key: 'PLCAt1100C', label: 'PLC 1100°C' },
  { key: 'AluminaPct', label: 'Al₂O₃ %' },
  { key: 'IronPct', label: 'Fe₂O₃ %' },
  { key: 'SilicaPct', label: 'SiO₂ %' },
]

const numOrNull = (v) => {
  if (v === null || v === undefined || String(v).trim() === '') return null
  const n = parseFloat(String(v).replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

const isPackaging = (name, keywords) => {
  const n = String(name || '').toLowerCase()
  return keywords.some((k) => k && n.includes(String(k).toLowerCase().trim()))
}

const dateValue = (...vals) => {
  for (const v of vals) {
    if (!v) continue
    const t = new Date(v).getTime()
    if (Number.isFinite(t)) return t
  }
  return 0
}

/** Merge duplicate material names within one composition / batch (same RM entered twice). */
function mergeItems(items) {
  const map = new Map()
  for (const it of items) {
    const prev = map.get(it.key)
    if (prev) prev.value += it.value
    else map.set(it.key, { ...it })
  }
  return [...map.values()]
}

// ---------------------------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------------------------

/** costing_response row → composition (standard recipe). QTYi is a percentage. */
export function parseComposition(row) {
  const items = []
  for (let i = 1; i <= MAX_RM; i++) {
    const name = String(row[`RM${i}`] ?? '').trim()
    const pct = num(row[`QTY${i}`])
    if (!name || pct <= 0) continue
    items.push({ key: materialKey(name), name, value: pct, cost: num(row[`COST${i}`]) })
  }
  const merged = mergeItems(items)
  return {
    id: row.id,
    no: row['Composition No.'] || `#${row.id}`,
    status: row.Status || '',
    date: row['Planned 1'] || row.Timestamp || null,
    sortKey: dateValue(row.Timestamp, row['Planned 1']) || row.id,
    orderNo: row['Order No.'],
    product: row['product name'],
    firm: row['Firm Name'],
    party: row['Party Name'],
    orderReceiptId: row['Order Receipt Id'],
    items: merged,
    totalPct: merged.reduce((s, x) => s + x.value, 0),
    alumina: numOrNull(row.alumina),
    iron: numOrNull(row.iron),
    variableCost: numOrNull(row['VARIABLE COST']),
    raw: row,
  }
}

/** actual_production row → batch. Quantity Of Raw Material i is in MT (packaging rows are counts). */
export function parseBatch(row, settings) {
  const items = []
  const packaging = []
  for (let i = 1; i <= MAX_RM; i++) {
    const name = String(row[`Raw Material Name ${i}`] ?? '').trim()
    const qty = num(row[`Quantity Of Raw Material ${i}`])
    if (!name || qty <= 0) continue
    if (isPackaging(name, settings.packagingKeywords)) packaging.push({ name, qty })
    else items.push({ key: materialKey(name), name, value: qty })
  }
  const merged = mergeItems(items)
  const fgQty = num(row['Quantity Of FG'])
  const rmTotal = merged.reduce((s, x) => s + x.value, 0)
  const lab = {}
  for (const f of LAB_FIELDS) lab[f.key] = numOrNull(row[f.key])
  return {
    id: row.id,
    jobCard: row['Job Card No.'] || '—',
    firm: row['FIRM Name'],
    orderNo: row['Order No.'],
    product: row['Product Name'],
    party: row['Party Name'],
    date: row['Date Of Production'] || row.Timestamp,
    sortKey: dateValue(row['Date Of Production'], row.Timestamp),
    supervisor: row['Name Of Supervisor'] || '—',
    machineHours: numOrNull(row['Machine Running hour']),
    remarks: row.Remarks1,
    fgQty,
    rmTotal,
    coverage: fgQty > 0 ? (rmTotal / fgQty) * 100 : null,
    items: merged,
    packaging,
    lab,
    labStatus: row.Status2 || row.Status3 || null,
    cost: {
      expected: numOrNull(row.expected_cost),
      actual: numOrNull(row.actual_cost),
      variance: numOrNull(row.profit_variance),
      // Costing stage (/costing): final ₹ per MT, set when Actual8 is filled
      costingPerMt: numOrNull(row['Costing Amount']),
      costingDone: Boolean(row.Actual8),
    },
    raw: row,
  }
}

// ---------------------------------------------------------------------------------------------
// Percentages & comparison
// ---------------------------------------------------------------------------------------------

/** composition → { key: pct } on the chosen basis */
export function compositionPercents(comp, basis) {
  const out = {}
  if (!comp) return out
  const total = comp.totalPct || 0
  for (const it of comp.items) {
    out[it.key] = basis === 'mix' ? (total > 0 ? (it.value / total) * 100 : 0) : it.value
  }
  return out
}

/** batch → { key: pct } on the chosen basis */
export function batchPercents(batch, basis) {
  const out = {}
  const denom = basis === 'mix' ? batch.rmTotal : batch.fgQty
  for (const it of batch.items) out[it.key] = denom > 0 ? (it.value / denom) * 100 : 0
  return out
}

export function classify(base, actual, settings) {
  const hasBase = base > 0.0001
  const hasActual = actual > 0.0001
  if (!hasBase && hasActual) return 'added'
  if (hasBase && !hasActual) return 'missing'
  const d = Math.abs(actual - base)
  if (d <= settings.minorTolerance) return 'ok'
  if (d <= settings.majorTolerance) return 'minor'
  return 'major'
}

/**
 * Compare two percent maps (base = expected/previous, actual = current).
 * Returns lines sorted by |deviation| desc and the overall "mix shift" (Σ|dev| / 2).
 */
export function comparePercents(basePct, actualPct, settings, names = {}) {
  const keys = new Set([...Object.keys(basePct), ...Object.keys(actualPct)])
  const lines = []
  for (const key of keys) {
    const base = basePct[key] || 0
    const actual = actualPct[key] || 0
    const dev = actual - base
    lines.push({
      key,
      name: names[key] || key,
      base,
      actual,
      dev,
      relDev: base > 0 ? (dev / base) * 100 : null,
      status: classify(base, actual, settings),
    })
  }
  lines.sort((a, b) => Math.abs(b.dev) - Math.abs(a.dev))
  const shift = lines.reduce((s, l) => s + Math.abs(l.dev), 0) / 2
  const worst = lines.reduce((m, l) => Math.max(m, LINE_RANK[l.status]), 0)
  const severity = worst >= 2 ? 'major' : worst === 1 ? 'minor' : 'ok'
  return { lines, shift, severity }
}

// ---------------------------------------------------------------------------------------------
// Linking (same fallbacks as Production-FMS findMatchingRow)
// ---------------------------------------------------------------------------------------------

function indexProduction(production) {
  const byId = new Map()
  const byDoProdFirm = new Map()
  const byDoProd = new Map()
  const byNumDoProd = new Map()
  for (const p of production) {
    byId.set(p.id, p)
    const d = normalizeKey(p['Delivery Order No.'])
    const pr = normalizeKey(p['Product Name'])
    const f = normalizeKey(p['Firm Name'])
    const push = (m, k) => (m.has(k) ? m.get(k).push(p) : m.set(k, [p]))
    push(byDoProdFirm, `${d}|${pr}|${f}`)
    push(byDoProd, `${d}|${pr}`)
    push(byNumDoProd, `${numericDo(p['Delivery Order No.'])}|${pr}`)
  }
  return { byId, byDoProdFirm, byDoProd, byNumDoProd }
}

function findProduction(idx, doNo, product, firm) {
  const d = normalizeKey(doNo)
  const pr = normalizeKey(product)
  return (
    idx.byDoProdFirm.get(`${d}|${pr}|${normalizeKey(firm)}`)?.[0] ||
    idx.byDoProd.get(`${d}|${pr}`)?.[0] ||
    idx.byNumDoProd.get(`${numericDo(doNo)}|${pr}`)?.[0] ||
    null
  )
}

// ---------------------------------------------------------------------------------------------
// Model building
// ---------------------------------------------------------------------------------------------

/**
 * Build the full RCA model.
 * @param raw { production, compositions, jobcards, actuals, orderReceipts, reviews, kyc }
 */
export function buildModel(raw, settings) {
  const prodIdx = indexProduction(raw.production)
  const orderReceiptById = new Map((raw.orderReceipts || []).map((r) => [r.id, r]))
  const reviewsByBatch = new Map()
  for (const r of raw.reviews || []) {
    const list = reviewsByBatch.get(r.actual_production_id) || []
    list.push(r)
    reviewsByBatch.set(r.actual_production_id, list)
  }

  // job card lookup: JC + firm (+ DO + product when available)
  const jcFull = new Map()
  const jcFirm = new Map()
  for (const jc of raw.jobcards) {
    const jn = normalizeKey(jc['JC-Job Card Number'])
    const f = normalizeKey(jc['Firm Name'])
    jcFull.set(`${jn}|${f}|${normalizeKey(jc['Delivery Order No.'])}|${normalizeKey(jc['Product Name'])}`, jc)
    if (!jcFirm.has(`${jn}|${f}`)) jcFirm.set(`${jn}|${f}`, jc)
  }

  const orders = new Map()
  const ensureOrder = (key, seed) => {
    if (!orders.has(key)) orders.set(key, { key, compositions: [], batches: [], jobcards: [], ...seed })
    return orders.get(key)
  }
  const seedFromProduction = (p) => {
    const or = orderReceiptById.get(p['Order Receipt Id'])
    return {
      productionId: p.id,
      orderReceiptId: p['Order Receipt Id'] ?? null,
      doNo: p['Delivery Order No.'] || or?.['DO-Delivery Order No.'] || '—',
      firm: p['Firm Name'] || or?.['Firm Name'] || '',
      party: p['Party Name'] || or?.['Party Names'] || '',
      product: p['Product Name'] || or?.['Product Name'] || '',
      orderQty: num(p['Order Quantity'] ?? or?.Quantity),
      expectedDelivery: p['Expected Delivery Date'] || or?.['Expected Delivery Date'] || null,
      cancelled: p['Order Cancel'] === true,
      productionStatus: p.Status || '',
      priority: p.Priority || '',
      orderReceipt: or || null,
    }
  }

  for (const p of raw.production) ensureOrder(`p${p.id}`, seedFromProduction(p))

  // job cards → order
  for (const jc of raw.jobcards) {
    let p = jc['Production Id'] ? prodIdx.byId.get(jc['Production Id']) : null
    if (!p) p = findProduction(prodIdx, jc['Delivery Order No.'], jc['Product Name'], jc['Firm Name'])
    if (p) orders.get(`p${p.id}`).jobcards.push(jc)
  }

  // batches → order
  for (const row of raw.actuals) {
    const batch = parseBatch(row, settings)
    if (!batch.items.length && !batch.fgQty) continue
    const jn = normalizeKey(batch.jobCard)
    const f = normalizeKey(batch.firm)
    const jc =
      jcFull.get(`${jn}|${f}|${normalizeKey(batch.orderNo)}|${normalizeKey(batch.product)}`) ||
      jcFirm.get(`${jn}|${f}`)
    batch.jobCardRow = jc || null
    let p = jc?.['Production Id'] ? prodIdx.byId.get(jc['Production Id']) : null
    if (!p) p = findProduction(prodIdx, batch.orderNo, batch.product, batch.firm)
    const order = p
      ? orders.get(`p${p.id}`)
      : ensureOrder(`x${normalizeKey(batch.orderNo)}|${normalizeKey(batch.product)}|${normalizeKey(batch.firm)}`, {
          productionId: null,
          orderReceiptId: null,
          doNo: batch.orderNo || '—',
          firm: batch.firm || '',
          party: batch.party || '',
          product: batch.product || '',
          orderQty: 0,
          expectedDelivery: null,
          cancelled: false,
          productionStatus: 'Not linked to production',
          priority: '',
          orderReceipt: null,
        })
    batch.reviews = reviewsByBatch.get(batch.id) || []
    order.batches.push(batch)
  }

  // compositions → order (Order Receipt Id first, then DO + product (+ party))
  const ordersList = [...orders.values()]
  const byReceipt = new Map()
  const byDoProd = new Map()
  for (const o of ordersList) {
    if (o.orderReceiptId) {
      const l = byReceipt.get(o.orderReceiptId) || []
      l.push(o)
      byReceipt.set(o.orderReceiptId, l)
    }
    const k = `${normalizeKey(o.doNo)}|${normalizeKey(o.product)}`
    const l = byDoProd.get(k) || []
    l.push(o)
    byDoProd.set(k, l)
  }
  for (const row of raw.compositions) {
    if (String(row.Status || '').toLowerCase() === 'cancelled') continue
    const comp = parseComposition(row)
    if (!comp.items.length) continue
    let targets = comp.orderReceiptId ? byReceipt.get(comp.orderReceiptId) : null
    if (!targets?.length) {
      const cands = byDoProd.get(`${normalizeKey(comp.orderNo)}|${normalizeKey(comp.product)}`) || []
      const withParty = cands.filter((o) => comp.party && normalizeKey(o.party) === normalizeKey(comp.party))
      targets = withParty.length ? withParty : cands
    }
    for (const o of targets || []) o.compositions.push(comp)
  }

  const priceMap = buildPriceMap(raw.kyc || [])
  const built = ordersList.map((o) => analyseOrder(o, settings, priceMap))
  built.sort((a, b) => (b.lastBatchAt || 0) - (a.lastBatchAt || 0) || String(b.doNo).localeCompare(String(a.doNo)))
  return { orders: built, materials: aggregateMaterials(built), totals: aggregateTotals(built) }
}

/**
 * Floor staff often enter small additives in kg while everything else is MT (e.g. FFB Flow 0.2% of 10 MT
 * is 0.02 MT but entered as "20"). Detect and convert so one additive does not wreck the whole mix:
 *  - qty ÷ expected MT between 50× and 5000×  → kg
 *  - no expectation, but a single RM qty > FG qty → kg
 * Converted items keep `unitFixed: true` + `enteredQty` so the UI can show it (it is itself a data root cause).
 */
function applyUnitFix(batch, standard) {
  if (!batch.fgQty) return
  const stdTotal = standard?.totalPct || 0
  let changed = false
  for (const it of batch.items) {
    const stdPct = standard?.items.find((s) => s.key === it.key)?.value || 0
    const expectedMt = stdTotal > 0 ? ((stdPct / stdTotal) * batch.fgQty) : 0
    const ratio = expectedMt > 0 ? it.value / expectedMt : null
    const looksKg = ratio !== null ? ratio >= 50 && ratio <= 5000 : it.value > batch.fgQty
    if (looksKg) {
      it.enteredQty = it.value
      it.value = it.value / 1000
      it.unitFixed = true
      changed = true
    }
  }
  if (changed) {
    batch.rmTotal = batch.items.reduce((s, x) => s + x.value, 0)
    batch.coverage = (batch.rmTotal / batch.fgQty) * 100
  }
  batch.unitFixes = batch.items.filter((x) => x.unitFixed)
}

/** kyc rows → { exact product name: price } — same keying as Production-FMS production page (last row wins). */
export function buildPriceMap(kycRows) {
  const map = {}
  for (const r of kycRows) {
    const name = String(r['Product name'] ?? '').trim()
    if (name) map[name] = num(r.Price)
  }
  return map
}

/**
 * Production-FMS saves actual_cost = Σ entered qty × kyc.Price. When an additive was entered in kg (e.g. SHMP "30")
 * it is priced as 30 MT, inflating the cost many times. Remove only that error:
 *   actualCorrected = actual_cost − Σ (entered qty − MT qty) × price   for unit-fixed items
 * Everything else (rates, packaging, materials) stays exactly as Production-FMS calculated it.
 */
function correctActualCost(batch, priceMap) {
  const { actual } = batch.cost
  let excess = 0
  for (const it of batch.unitFixes || []) {
    const price = priceMap[String(it.name).trim()] || 0
    excess += (it.enteredQty - it.value) * price
  }
  batch.cost.kgExcess = excess
  batch.cost.actualCorrected = actual === null ? null : actual - excess
}

/** Standard for a batch = latest composition created on/before the batch date, else the first one. */
function pickStandard(compositions, batch) {
  if (!compositions.length) return null
  let chosen = null
  for (const c of compositions) if (!batch.sortKey || c.sortKey <= batch.sortKey + 86400000) chosen = c
  return chosen || compositions[0]
}

export function analyseOrder(order, settings, priceMap = {}) {
  const compositions = [...order.compositions].sort((a, b) => a.sortKey - b.sortKey || a.id - b.id)
  const batches = [...order.batches].sort((a, b) => a.sortKey - b.sortKey || a.id - b.id)

  // display names: first spelling seen wins
  const names = {}
  for (const c of compositions) for (const it of c.items) names[it.key] ??= it.name
  for (const b of batches) for (const it of b.items) names[it.key] ??= it.name

  // composition revisions
  compositions.forEach((c, i) => {
    c.revision = i + 1
    c.percents = compositionPercents(c, settings.basis)
    c.vsPrev = i > 0 ? comparePercents(compositions[i - 1].percents, c.percents, settings, names) : null
  })

  let prev = null
  batches.forEach((b, i) => {
    b.seq = i + 1
    b.standard = pickStandard(compositions, b)
    if (settings.autoUnitFix) applyUnitFix(b, b.standard)
    else b.unitFixes = []
    b.percents = batchPercents(b, settings.basis)
    b.vsStandard = b.standard ? comparePercents(b.standard.percents, b.percents, settings, names) : null
    b.vsPrev = prev ? comparePercents(prev.percents, b.percents, settings, names) : null
    b.severity = b.vsStandard ? b.vsStandard.severity : 'ok'
    b.reviewed = b.reviews.length > 0
    b.labCheck = compareLab(b.standard, b.raw)
    correctActualCost(b, priceMap)
    prev = b
  })

  // material universe in a stable order: composition order first, then extras by first use
  const materialKeys = []
  const seen = new Set()
  const add = (k) => !seen.has(k) && (seen.add(k), materialKeys.push(k))
  const latestComp = compositions[compositions.length - 1]
  latestComp?.items.forEach((it) => add(it.key))
  compositions.forEach((c) => c.items.forEach((it) => add(it.key)))
  batches.forEach((b) => b.items.forEach((it) => add(it.key)))

  const producedQty = batches.reduce((s, b) => s + b.fgQty, 0)
  const counts = { ok: 0, minor: 0, major: 0 }
  batches.forEach((b) => b.vsStandard && counts[b.severity]++)
  const severity = counts.major ? 'major' : counts.minor ? 'minor' : 'ok'
  const avgShift = batches.filter((b) => b.vsStandard).reduce((s, b, _, arr) => s + b.vsStandard.shift / arr.length, 0)

  const result = {
    ...order,
    compositions,
    batches,
    names,
    materialKeys,
    producedQty,
    batchCounts: counts,
    severity: batches.length ? severity : 'none',
    avgShift,
    hasStandard: compositions.length > 0,
    unreviewedMajor: batches.filter((b) => b.severity === 'major' && !b.reviewed).length,
    lastBatchAt: batches.length ? batches[batches.length - 1].sortKey : 0,
  }
  result.findings = buildFindings(result, settings)
  return result
}

// ---------------------------------------------------------------------------------------------
// Lab — composition target vs Lab Test result
// ---------------------------------------------------------------------------------------------
// When the lab creates a composition (Full Kitting) it types expected test values as free text
// ("5.5 -6.0", "700-800", "-0.2-0.35%", "ok"). Lab Test 1/2 later store the actual results, also as
// text ("11.5", "3 HRS", "150 MINT", "NA"). We parse both and judge each property per batch.

export const LAB_SPECS = [
  { key: 'wc', label: 'WC %', unit: '%', kind: 'range', expected: 'Expected WC %', actual: 'WCPercentage' },
  { key: 'flow', label: 'Flow', kind: 'text', expected: 'Expected Sticky Flow', actual: 'FlowOfMaterial' },
  { key: 'ist', label: 'IST', unit: 'min', kind: 'time', expected: 'Expected IST', actual: 'InitialSettingTime' },
  { key: 'fst', label: 'FST', unit: 'min', kind: 'time', expected: 'Expected FST', actual: 'FinalSettingTime' },
  { key: 'bd110', label: 'BD 110°C', kind: 'range', expected: 'Expected BD 110C', actual: 'BDAt110C' },
  { key: 'bd1100', label: 'BD 1100°C', kind: 'range', expected: 'Expected BD 1100C', actual: 'BDAt1100C' },
  { key: 'ccs110', label: 'CCS 110°C', kind: 'range', expected: 'Expected CCS 110C', actual: 'CCSAt100C' },
  { key: 'ccs1100', label: 'CCS 1100°C', kind: 'range', expected: 'Expected CCS 1100C', actual: 'CCSAt1100C' },
  { key: 'plc', label: 'PLC 1100°C', unit: '%', kind: 'range', expected: 'Expected PLC 1100C', actual: 'PLCAt1100C' },
  // chemistry target = composition's calculated Al/Fe (normalised to 100 %), ± tol percentage points
  { key: 'al', label: 'Al₂O₃ %', unit: '%', kind: 'chem', expectedFrom: 'alumina', tol: 2, actual: 'AluminaPct' },
  { key: 'fe', label: 'Fe₂O₃ %', unit: '%', kind: 'chem', expectedFrom: 'iron', tol: 0.5, actual: 'IronPct' },
]

const NUM = '(-?\\d*\\.?\\d+)'
const RANGE_RE = new RegExp(`^${NUM}(?:-|–|to)${NUM}$`)
const SINGLE_RE = new RegExp(`^${NUM}$`)
const MAX_RE = new RegExp(`^(?:<=|<|≤|max|upto)${NUM}$`)
const MIN_RE = new RegExp(`^(?:>=|>|≥|min)${NUM}$`)

/** "5.5 -6.0" → {min 5.5, max 6}; "-0.2-0.35%" → {min -0.2, max 0.35}; "<0.3" → {max 0.3}; "ok" → null */
export function parseRangeText(text) {
  if (text === null || text === undefined) return null
  const s = String(text)
    .replace(/%/g, '')
    .replace(/\s+/g, '')
    .toLowerCase()
    .replace(/(\d)-\.(\d)/g, '$1-$2') // typo seen in live data: "2.65-.2.7" → "2.65-2.7"
  if (!s) return null
  let m = s.match(RANGE_RE)
  if (m) {
    const a = parseFloat(m[1])
    const b = parseFloat(m[2])
    return { min: Math.min(a, b), max: Math.max(a, b) }
  }
  if ((m = s.match(SINGLE_RE))) return { min: parseFloat(m[1]), max: parseFloat(m[1]) }
  if ((m = s.match(MAX_RE))) return { min: -Infinity, max: parseFloat(m[1]) }
  if ((m = s.match(MIN_RE))) return { min: parseFloat(m[1]), max: Infinity }
  return null
}

const isHours = (s) => /\bh(ou)?rs?\b|\bhr|hrs/.test(s)

/** Expected IST/FST text → minutes range ("15-25" → 15–25, "2-3 hrs" → 120–180) */
function parseTimeRange(text) {
  if (text === null || text === undefined) return null
  const s = String(text).toLowerCase()
  const r = parseRangeText(s.replace(/[a-z.]+$/g, '').replace(/[a-z]/g, ''))
  if (!r) return null
  return isHours(s) ? { min: r.min * 60, max: r.max * 60 } : r
}

/** Actual IST/FST text → minutes ("3 HRS" → 180, "150 MINT" → 150, "NA" → null) */
export function parseMinutes(text) {
  if (text === null || text === undefined) return null
  const s = String(text).toLowerCase().trim()
  if (!s || /^n\.?a\.?$|^-+$|nil/.test(s)) return null
  const hm = s.match(/^(\d+)\s*[:.]\s*(\d{2})\s*(hrs?|hours?)?$/) // "2:10" / "2.10 hrs" = 2 h 10 min (seen in live data)
  if (hm && s.includes(':')) return parseInt(hm[1], 10) * 60 + parseInt(hm[2], 10)
  const n = s.match(/\d*\.?\d+/)
  if (!n) return null
  const v = parseFloat(n[0])
  return isHours(s) ? v * 60 : v
}

/** First number in a free-text result ("2.40", "11.5 %") */
function parseNumber(text) {
  if (text === null || text === undefined) return null
  if (typeof text === 'number') return Number.isFinite(text) ? text : null
  const s = String(text).trim()
  if (!s || /^n\.?a\.?$/i.test(s)) return null
  const m = s.replace(/,/g, '').match(/-?\d*\.?\d+/)
  return m ? parseFloat(m[0]) : null
}

/** Flow text → pass / fail / null */
function judgeText(actualText) {
  const s = String(actualText ?? '').toLowerCase().trim()
  if (!s) return null
  if (/\bnot\b|\bbad\b|\bpoor\b|\bno\b|sticky|fail/.test(s)) return 'fail'
  if (/\bok\b|good|fine|pass/.test(s)) return 'pass'
  return null
}

const fmtTarget = (r, unit) => {
  const u = unit === '%' ? '%' : unit ? ` ${unit}` : ''
  if (r.min === -Infinity) return `≤ ${r.max}${u}`
  if (r.max === Infinity) return `≥ ${r.min}${u}`
  return r.min === r.max ? `${r.min}${u}` : `${r.min} – ${r.max}${u}`
}

/**
 * One batch: every lab property → target (from the batch's composition) vs actual (Lab Test).
 * status: ok (inside target) | minor (outside by ≤ 10 % of target) | major | na (not tested / unreadable) | notarget
 * diff: signed distance outside the target range (below → negative, above → positive), 0 when inside.
 */
export function compareLab(standard, raw) {
  const comp = standard?.raw || {}
  const items = LAB_SPECS.map((spec) => {
    const actualText = raw?.[spec.actual] ?? null
    const out = { ...spec, actualText, targetText: null, target: null, actual: null, status: 'na', diff: null }

    if (spec.kind === 'chem') {
      const v = numOrNull(comp[spec.expectedFrom])
      if (v !== null && standard?.totalPct > 0) {
        const mid = (v / standard.totalPct) * 100
        out.target = { min: mid - spec.tol, max: mid + spec.tol, mid }
        out.targetText = `${mid.toFixed(1)} ± ${spec.tol}%`
      }
    } else {
      out.targetText = comp[spec.expected] ? String(comp[spec.expected]).trim() : null
      out.target = spec.kind === 'time' ? parseTimeRange(out.targetText) : spec.kind === 'range' ? parseRangeText(out.targetText) : null
    }

    if (spec.kind === 'text') {
      const verdict = judgeText(actualText)
      if (!actualText || !String(actualText).trim()) out.status = 'na'
      else if (!out.targetText) out.status = 'notarget'
      else out.status = verdict === 'fail' ? 'major' : verdict === 'pass' ? 'ok' : 'na'
      return out
    }

    out.actual = spec.kind === 'time' ? parseMinutes(actualText) : parseNumber(actualText)
    if (out.actual === null) out.status = 'na'
    else if (!out.target) out.status = 'notarget'
    else {
      const { min, max } = out.target
      const v = out.actual
      out.diff = v < min ? v - min : v > max ? v - max : 0
      if (out.diff === 0) out.status = 'ok'
      else {
        const ref = Math.abs(Number.isFinite(min) && Number.isFinite(max) ? (min + max) / 2 : Number.isFinite(min) ? min : max) || 1
        out.status = Math.abs(out.diff) <= ref * 0.1 ? 'minor' : 'major'
      }
    }
    if (out.target && !out.targetText?.match(/\d/)) out.targetText = fmtTarget(out.target, spec.unit)
    return out
  })
  const judged = items.filter((i) => ['ok', 'minor', 'major'].includes(i.status))
  return {
    items,
    tested: items.some((i) => i.actualText !== null && String(i.actualText).trim() !== ''),
    checked: judged.length,
    out: judged.filter((i) => i.status !== 'ok').length,
  }
}

/** Per lab property across an order's batches: how many tested, how many outside the composition target. */
export function summarizeLab(batches) {
  return LAB_SPECS.map((spec) => {
    const rows = batches.map((b) => b.labCheck?.items.find((i) => i.key === spec.key)).filter(Boolean)
    const judged = rows.filter((r) => ['ok', 'minor', 'major'].includes(r.status))
    const nums = judged.map((r) => r.actual).filter((v) => v !== null)
    return {
      ...spec,
      tested: rows.filter((r) => r.status !== 'na').length,
      judged: judged.length,
      ok: judged.filter((r) => r.status === 'ok').length,
      out: judged.filter((r) => r.status !== 'ok').length,
      avg: nums.length ? nums.reduce((s, v) => s + v, 0) / nums.length : null,
    }
  })
}

/** Cost per order: expected (composition × RM rate) vs actual (RM used × rate), and Costing-stage ₹/MT. */
export function summarizeCost(batches) {
  const withCost = batches.filter((b) => b.cost.expected !== null || b.cost.actual !== null)
  const sum = (f) => withCost.reduce((s, b) => s + (f(b) ?? 0), 0)
  const fg = withCost.reduce((s, b) => s + b.fgQty, 0)
  const expected = sum((b) => b.cost.expected)
  // kg-entry error removed (see correctActualCost); falls back to the saved value
  const actual = sum((b) => b.cost.actualCorrected ?? b.cost.actual)
  const costed = batches.filter((b) => b.cost.costingPerMt !== null)
  const costedFg = costed.reduce((s, b) => s + b.fgQty, 0)
  return {
    batches: withCost.length,
    fg,
    expected,
    actual,
    diff: actual - expected,
    diffPct: expected ? ((actual - expected) / expected) * 100 : null,
    expectedPerMt: fg ? expected / fg : null,
    actualPerMt: fg ? actual / fg : null,
    costedBatches: costed.length,
    kgFixedBatches: withCost.filter((b) => b.cost.kgExcess > 0).length,
    kgExcess: sum((b) => b.cost.kgExcess),
    costingPerMt: costedFg ? costed.reduce((s, b) => s + b.cost.costingPerMt * b.fgQty, 0) / costedFg : null,
  }
}

// ---------------------------------------------------------------------------------------------
// Findings — the "why" layer
// ---------------------------------------------------------------------------------------------

const list = (arr) => arr.join(', ')
const batchLabel = (b) => `Batch ${b.seq} (${b.jobCard})`

export function buildFindings(order, settings) {
  const out = []
  const { batches, compositions, names } = order
  const nm = (k) => names[k] || k

  if (batches.length && !compositions.length) {
    out.push({
      severity: 'warning',
      type: 'no-standard',
      title: 'No approved composition linked',
      detail:
        'Batches were produced but no composition (costing_response) could be matched to this order, so deviation cannot be judged. Check Order Receipt Id / DO / product spelling.',
      batches: [],
    })
  }

  // 1. composition revisions
  compositions.forEach((c, i) => {
    if (i === 0 || !c.vsPrev) return
    const changed = c.vsPrev.lines.filter((l) => l.status !== 'ok')
    if (!changed.length) return
    const affected = batches.filter((b) => b.standard?.id === c.id).map((b) => b.seq)
    out.push({
      severity: 'info',
      type: 'composition-revised',
      title: `Composition revised: ${compositions[i - 1].no} → ${c.no}`,
      detail: changed.map((l) => describeLine(l, nm)).join('; '),
      batches: affected,
    })
  })

  // 2. material changes between consecutive batches
  batches.forEach((b) => {
    if (!b.vsPrev) return
    const removed = b.vsPrev.lines.filter((l) => l.status === 'missing')
    const added = b.vsPrev.lines.filter((l) => l.status === 'added')
    const shifted = b.vsPrev.lines.filter((l) => l.status === 'major')
    if (!removed.length && !added.length && !shifted.length) return
    const prevB = batches[b.seq - 2]
    const revisedHere = prevB && prevB.standard?.id !== b.standard?.id
    const notInStandard = added.filter((l) => b.standard && !(b.standard.percents[l.key] > 0))
    const parts = []
    if (removed.length) parts.push(`removed ${list(removed.map((l) => nm(l.key)))}`)
    if (added.length) parts.push(`added ${list(added.map((l) => nm(l.key)))}`)
    if (shifted.length) parts.push(shifted.map((l) => `${nm(l.key)} ${signed(l.dev)}`).join(', '))
    out.push({
      severity: revisedHere ? 'info' : notInStandard.length ? 'critical' : 'warning',
      type: removed.length && added.length ? 'substitution' : 'batch-change',
      title:
        removed.length && added.length
          ? `Material substitution at ${batchLabel(b)}`
          : `Mix changed at ${batchLabel(b)} vs Batch ${b.seq - 1}`,
      detail:
        parts.join('; ') +
        (revisedHere
          ? ` — explained by composition revision ${b.standard.no}.`
          : notInStandard.length
            ? ` — ${list(notInStandard.map((l) => nm(l.key)))} not in approved composition ${b.standard.no}.`
            : ' — no composition revision recorded for this change.'),
      batches: [b.seq],
    })
  })

  // 3. persistent deviation per material (standard not being followed, or standard needs revising)
  const withStd = batches.filter((b) => b.vsStandard)
  if (withStd.length >= 2) {
    const per = new Map()
    for (const b of withStd)
      for (const l of b.vsStandard.lines) {
        if (l.status === 'ok') continue
        const e = per.get(l.key) || { n: 0, sum: 0, statuses: new Set(), seqs: [] }
        e.n++
        e.sum += l.dev
        e.statuses.add(l.status)
        e.seqs.push(b.seq)
        per.set(l.key, e)
      }
    const persistent = []
    for (const [key, e] of per) {
      if (e.n < Math.max(2, Math.ceil(withStd.length * 0.5))) continue
      const avg = e.sum / e.n
      const kind = e.statuses.has('added')
        ? 'used although not in composition'
        : e.statuses.has('missing')
          ? 'skipped although in composition'
          : avg > 0
            ? 'consistently above standard'
            : 'consistently below standard'
      persistent.push({ key, e, avg, kind })
    }
    persistent.sort((a, b) => Math.abs(b.avg) - Math.abs(a.avg))
    const advice =
      'Either the floor is not following the composition, or the composition should be revised to match practice.'
    if (persistent.length > 3) {
      // many materials off in most batches = the floor runs a different recipe; one finding, not a wall of cards
      out.push({
        severity: 'critical',
        type: 'persistent',
        title: `Floor mix differs from approved composition (${persistent.length} materials, most batches)`,
        detail:
          persistent
            .slice(0, 8)
            .map((p) => `${nm(p.key)} ${signed(p.avg)} in ${p.e.n}/${withStd.length}`)
            .join('; ') + (persistent.length > 8 ? ' …' : '') + `. ${advice}`,
        batches: [...new Set(persistent.flatMap((p) => p.e.seqs))].sort((a, b) => a - b),
      })
    } else {
      for (const { key, e, avg, kind } of persistent)
        out.push({
          severity: 'warning',
          type: 'persistent',
          title: `${nm(key)} ${kind}`,
          detail: `Deviated in ${e.n} of ${withStd.length} batches (avg ${signed(avg)}). ${advice}`,
          batches: e.seqs,
        })
    }
  }

  // 3b. unit mismatches (kg entered where MT expected)
  const fixed = batches.filter((b) => b.unitFixes?.length)
  if (fixed.length) {
    const mats = [...new Set(fixed.flatMap((b) => b.unitFixes.map((x) => x.name)))]
    out.push({
      severity: 'info',
      type: 'unit',
      title: `Quantity entered in kg instead of MT (${fixed.length} batch${fixed.length > 1 ? 'es' : ''})`,
      detail: `${list(mats)} — auto-converted ÷1000 for comparison. Ask production to enter all RM in MT.`,
      batches: fixed.map((b) => b.seq),
    })
  }

  // 4. one-off major deviations (neighbours fine)
  withStd.forEach((b, i) => {
    if (b.severity !== 'major') return
    const before = withStd[i - 1]
    const after = withStd[i + 1]
    if ((before && before.severity === 'major') || (after && after.severity === 'major')) return
    if (!before && !after) return
    const top = b.vsStandard.lines.filter((l) => l.status !== 'ok').slice(0, 3)
    out.push({
      severity: 'critical',
      type: 'one-off',
      title: `One-off deviation in ${batchLabel(b)}`,
      detail: `${top.map((l) => describeLine(l, nm)).join('; ')}. Mix shift ${b.vsStandard.shift.toFixed(1)}% while neighbouring batches were within tolerance — check RM lot, weighing or operator (${b.supervisor}).`,
      batches: [b.seq],
    })
  })

  // 5. yield / entry gap
  const gaps = batches.filter(
    (b) => b.coverage !== null && Math.abs(b.coverage - 100) > settings.yieldTolerance,
  )
  if (gaps.length) {
    out.push({
      severity: 'info',
      type: 'yield',
      title: `RM total vs FG outside ±${settings.yieldTolerance}% in ${gaps.length} batch${gaps.length > 1 ? 'es' : ''}`,
      detail: gaps
        .slice(0, 6)
        .map((b) => `B${b.seq}: ${b.rmTotal.toFixed(2)} MT RM → ${b.fgQty} MT FG (${b.coverage.toFixed(0)}%)`)
        .join('; ') + (gaps.length > 6 ? ' …' : '') + '. Either RM entry is incomplete or there is a real yield/moisture gap.',
      batches: gaps.map((b) => b.seq),
    })
  }

  // 6. lab results that move together with composition deviation
  const labOutliers = labCorrelation(batches)
  if (labOutliers.length) {
    out.push({
      severity: 'warning',
      type: 'lab',
      title: 'Lab results shifted in deviating batches',
      detail: labOutliers
        .slice(0, 5)
        .map((o) => `B${o.seq}: ${o.label} ${o.value} vs median ${o.median} (${signedPct(o.pct)})`)
        .join('; '),
      batches: [...new Set(labOutliers.map((o) => o.seq))],
    })
  }

  const order_ = { critical: 0, warning: 1, info: 2 }
  return out.sort((a, b) => order_[a.severity] - order_[b.severity])
}

function labCorrelation(batches) {
  const out = []
  for (const f of [
    { key: 'WCPercentage', label: 'WC %' },
    { key: 'BDAt110C', label: 'BD 110°C' },
    { key: 'CCSAt100C', label: 'CCS 110°C' },
    { key: 'BDAt1100C', label: 'BD 1100°C' },
    { key: 'CCSAt1100C', label: 'CCS 1100°C' },
    { key: 'PLCAt1100C', label: 'PLC 1100°C' },
  ]) {
    const vals = batches.map((b) => b.lab[f.key]).filter((v) => v !== null)
    if (vals.length < 3) continue
    const sorted = [...vals].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]
    if (!median) continue
    for (const b of batches) {
      const v = b.lab[f.key]
      if (v === null || b.severity === 'ok') continue
      const pct = ((v - median) / Math.abs(median)) * 100
      if (Math.abs(pct) >= 10) out.push({ seq: b.seq, label: f.label, value: v, median, pct })
    }
  }
  return out
}

const signed = (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} pp`
const signedPct = (v) => `${v > 0 ? '+' : ''}${v.toFixed(0)}%`

export function describeLine(l, nm = (k) => k) {
  if (l.status === 'added') return `${nm(l.key)} added (${l.actual.toFixed(1)}%)`
  if (l.status === 'missing') return `${nm(l.key)} dropped (was ${l.base.toFixed(1)}%)`
  return `${nm(l.key)} ${l.base.toFixed(1)}% → ${l.actual.toFixed(1)}% (${signed(l.dev)})`
}

// ---------------------------------------------------------------------------------------------
// Aggregates (dashboard + materials page)
// ---------------------------------------------------------------------------------------------

export function aggregateMaterials(orders) {
  const map = new Map()
  for (const o of orders) {
    for (const b of o.batches) {
      if (!b.vsStandard) continue
      for (const l of b.vsStandard.lines) {
        const e =
          map.get(l.key) ||
          {
            key: l.key,
            name: o.names[l.key] || l.key,
            batches: 0,
            ok: 0,
            minor: 0,
            major: 0,
            added: 0,
            missing: 0,
            sumAbsDev: 0,
            sumDev: 0,
            products: new Set(),
            orders: new Set(),
          }
        e.batches++
        e[l.status]++
        e.sumAbsDev += Math.abs(l.dev)
        e.sumDev += l.dev
        e.products.add(o.product)
        e.orders.add(o.key)
        map.set(l.key, e)
      }
    }
  }
  return [...map.values()]
    .map((e) => ({
      ...e,
      products: [...e.products],
      orders: [...e.orders],
      avgAbsDev: e.batches ? e.sumAbsDev / e.batches : 0,
      avgDev: e.batches ? e.sumDev / e.batches : 0,
      deviationRate: e.batches ? ((e.batches - e.ok) / e.batches) * 100 : 0,
    }))
    .sort((a, b) => b.deviationRate - a.deviationRate || b.avgAbsDev - a.avgAbsDev)
}

export function aggregateTotals(orders) {
  const active = orders.filter((o) => o.batches.length)
  const batches = active.flatMap((o) => o.batches)
  const judged = batches.filter((b) => b.vsStandard)
  return {
    orders: active.length,
    batches: batches.length,
    judged: judged.length,
    ok: judged.filter((b) => b.severity === 'ok').length,
    minor: judged.filter((b) => b.severity === 'minor').length,
    major: judged.filter((b) => b.severity === 'major').length,
    producedQty: batches.reduce((s, b) => s + b.fgQty, 0),
    avgShift: judged.length ? judged.reduce((s, b) => s + b.vsStandard.shift, 0) / judged.length : 0,
    noStandard: active.filter((o) => !o.hasStandard).length,
    unreviewedMajor: active.reduce((s, o) => s + o.unreviewedMajor, 0),
    revisedOrders: active.filter((o) => o.compositions.length > 1).length,
  }
}

// ---------------------------------------------------------------------------------------------
// Business dashboard — profit/loss, product margin, lab quality, trends, people, delivery, data quality
// ---------------------------------------------------------------------------------------------
// Sales / mfg cost come from actual_production (saved by Production-FMS at production entry):
//   selling_price_total = product_rate × FG,  manufacturing_cost_used = Mfg cost/MT × FG.
// RM cost uses the kg-corrected actual (correctActualCost). Batches whose cost is > 3× or < ⅓ of the
// composition cost are DATA ERRORS (e.g. DO-501 ₹1.55 Cr for a ₹5 lakh batch) and are kept out of every
// ₹ figure — they are listed separately so nothing is silently dropped.

export const COST_ERROR_RATIO = 3

const actualRm = (b) => b.cost.actualCorrected ?? b.cost.actual

/** true when the saved RM cost cannot be right (way off the composition cost) */
export function isCostError(b) {
  const e = b.cost.expected
  const a = actualRm(b)
  if (!(e > 0) || !(a > 0)) return false
  const r = a / e
  return r > COST_ERROR_RATIO || r < 1 / COST_ERROR_RATIO
}

const monthKey = (v) => {
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * @param orders  model.orders (already firm-filtered)
 * @param todayMs today's date in ms (passed in so this stays pure)
 */
export function aggregateBusiness(orders, todayMs) {
  const all = orders.flatMap((o) => o.batches.map((b) => ({ b, o })))

  // ---- money (clean batches only) ----
  const money = all.filter(({ b }) => num(b.raw.selling_price_total) > 0 && b.cost.expected > 0 && actualRm(b) > 0)
  const costErrors = money.filter(({ b }) => isCostError(b))
  const clean = money.filter(({ b }) => !isCostError(b))
  const row = ({ b, o }) => {
    const sales = num(b.raw.selling_price_total)
    const mfg = num(b.raw.manufacturing_cost_used)
    const expRm = b.cost.expected
    const actRm = actualRm(b)
    return { b, o, sales, mfg, expRm, actRm, expProfit: sales - expRm - mfg, actProfit: sales - actRm - mfg }
  }
  const rows = clean.map(row)
  const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0)
  const sales = sum(rows, (r) => r.sales)
  const profit = {
    batches: rows.length,
    fg: sum(rows, (r) => r.b.fgQty),
    sales,
    expRm: sum(rows, (r) => r.expRm),
    actRm: sum(rows, (r) => r.actRm),
    mfg: sum(rows, (r) => r.mfg),
    expProfit: sum(rows, (r) => r.expProfit),
    actProfit: sum(rows, (r) => r.actProfit),
  }
  profit.margin = sales ? (profit.actProfit / sales) * 100 : null
  profit.expMargin = sales ? (profit.expProfit / sales) * 100 : null
  profit.deviationImpact = profit.actProfit - profit.expProfit // < 0 = money lost by not following composition
  const sev = (s) => {
    const x = rows.filter((r) => r.b.severity === s)
    const e = sum(x, (r) => r.expRm)
    return { batches: x.length, extraRm: sum(x, (r) => r.actRm - r.expRm), extraPct: e ? (sum(x, (r) => r.actRm - r.expRm) / e) * 100 : null }
  }
  profit.bySeverity = { ok: sev('ok'), minor: sev('minor'), major: sev('major') }

  // Costing-stage margin (final ₹/MT incl. manufacturing, approved in /costing)
  const costed = clean.filter(({ b }) => b.cost.costingPerMt > 0)
  const cSales = sum(costed, ({ b }) => num(b.raw.selling_price_total))
  const cCost = sum(costed, ({ b }) => b.cost.costingPerMt * b.fgQty)
  profit.costing = { batches: costed.length, sales: cSales, cost: cCost, profit: cSales - cCost, margin: cSales ? ((cSales - cCost) / cSales) * 100 : null }

  // ---- loss orders ----
  const byOrder = new Map()
  for (const r of rows) {
    const e = byOrder.get(r.o.key) || { order: r.o, batches: 0, lossBatches: 0, sales: 0, profit: 0, loss: 0 }
    e.batches++
    e.sales += r.sales
    e.profit += r.actProfit
    if (r.actProfit < 0) {
      e.lossBatches++
      e.loss += r.actProfit
    }
    byOrder.set(r.o.key, e)
  }
  const lossOrders = [...byOrder.values()].filter((e) => e.lossBatches > 0).sort((a, b) => a.loss - b.loss)
  const lossTotal = { batches: rows.filter((r) => r.actProfit < 0).length, amount: sum(rows.filter((r) => r.actProfit < 0), (r) => r.actProfit) }

  // ---- product margin ----
  const prod = new Map()
  for (const r of rows) {
    const k = String(r.o.product).trim()
    const e = prod.get(k) || { product: k, batches: 0, fg: 0, sales: 0, profit: 0 }
    e.batches++
    e.fg += r.b.fgQty
    e.sales += r.sales
    e.profit += r.actProfit
    prod.set(k, e)
  }
  const products = [...prod.values()].map((e) => ({ ...e, margin: e.sales ? (e.profit / e.sales) * 100 : null })).sort((a, b) => a.margin - b.margin)

  // ---- lab quality ----
  const JUDGED = ['ok', 'minor', 'major']
  const labProps = new Map()
  let labChecks = 0
  let labOk = 0
  for (const { b } of all)
    for (const i of b.labCheck?.items || []) {
      if (!JUDGED.includes(i.status)) continue
      const e = labProps.get(i.key) || { key: i.key, label: i.label, checks: 0, ok: 0 }
      e.checks++
      labChecks++
      if (i.status === 'ok') {
        e.ok++
        labOk++
      }
      labProps.set(i.key, e)
    }
  const labRate = (list) => {
    const c = sum(list, ({ b }) => b.labCheck.checked)
    return { batches: list.length, rate: c ? (sum(list, ({ b }) => b.labCheck.checked - b.labCheck.out) / c) * 100 : null }
  }
  const labJudged = all.filter(({ b }) => b.labCheck?.checked >= 3)
  const lab = {
    checks: labChecks,
    ok: labOk,
    rate: labChecks ? (labOk / labChecks) * 100 : null,
    props: [...labProps.values()].map((p) => ({ ...p, rate: (p.ok / p.checks) * 100 })),
    mixOk: labRate(labJudged.filter(({ b }) => b.severity === 'ok')),
    mixMajor: labRate(labJudged.filter(({ b }) => b.severity === 'major')),
  }

  // ---- monthly trend ----
  const mon = new Map()
  for (const r of all) {
    const k = monthKey(r.b.date)
    if (!k) continue
    const e = mon.get(k) || { month: k, batches: 0, fg: 0, ok: 0, judged: 0, shift: 0, sales: 0, profit: 0 }
    e.batches++
    e.fg += r.b.fgQty
    if (r.b.vsStandard) {
      e.judged++
      e.shift += r.b.vsStandard.shift
      if (r.b.severity === 'ok') e.ok++
    }
    mon.set(k, e)
  }
  for (const r of rows) {
    const e = mon.get(monthKey(r.b.date))
    if (e) {
      e.sales += r.sales
      e.profit += r.actProfit
    }
  }
  const months = [...mon.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((e) => ({ ...e, okRate: e.judged ? (e.ok / e.judged) * 100 : null, avgShift: e.judged ? e.shift / e.judged : null, margin: e.sales ? (e.profit / e.sales) * 100 : null }))

  // ---- supervisors & firms ----
  const group = (keyOf) => {
    const m = new Map()
    for (const { b, o } of all) {
      const k = keyOf(b, o)
      if (!k) continue
      const e = m.get(k) || { name: k, batches: 0, fg: 0, judged: 0, ok: 0, major: 0, shift: 0 }
      e.batches++
      e.fg += b.fgQty
      if (b.vsStandard) {
        e.judged++
        e.shift += b.vsStandard.shift
        if (b.severity === 'ok') e.ok++
        if (b.severity === 'major') e.major++
      }
      m.set(k, e)
    }
    return [...m.values()].map((e) => ({ ...e, majorRate: e.judged ? (e.major / e.judged) * 100 : null, avgShift: e.judged ? e.shift / e.judged : null }))
  }
  const supervisors = group((b) => {
    const s = String(b.supervisor ?? '').trim()
    return s && s !== '—' ? s : null
  }).sort((a, b) => b.majorRate - a.majorRate)
  const firms = group((b, o) => String(o.firm || '').trim() || null).sort((a, b) => b.fg - a.fg)

  // ---- delivery pending ----
  const open = orders
    .filter((o) => o.orderQty > 0 && !o.cancelled && o.producedQty < o.orderQty * 0.99)
    .map((o) => {
      const due = o.expectedDelivery ? new Date(o.expectedDelivery).getTime() : null
      return { order: o, pending: o.orderQty - o.producedQty, due, overdueDays: due && due < todayMs ? Math.floor((todayMs - due) / 86400000) : 0 }
    })
  const overdue = open.filter((x) => x.overdueDays > 0).sort((a, b) => b.overdueDays - a.overdueDays)
  const delivery = {
    open: open.length,
    pendingMt: sum(open, (x) => x.pending),
    overdue: overdue.length,
    overdueMt: sum(overdue, (x) => x.pending),
    overdueList: overdue,
  }

  // ---- data quality ----
  // one composition can be linked to several order lines → count each once
  const uniqueComps = [...new Map(orders.flatMap((o) => o.compositions).map((c) => [c.id, c])).values()]
  const dataQuality = {
    kgEntries: all.filter(({ b }) => b.unitFixes?.length).length,
    costErrors: costErrors.map(({ b, o }) => ({ b, o, expected: b.cost.expected, actual: actualRm(b) })).sort((a, b) => b.actual / b.expected - a.actual / a.expected),
    noComposition: all.filter(({ b }) => !b.standard).length,
    noLabTarget: uniqueComps.filter((c) => !String(c.raw['Expected WC %'] ?? '').trim()).length,
    compositions: uniqueComps.length,
    notTested: all.filter(({ b }) => !b.labCheck?.tested).length,
    batches: all.length,
  }

  return { profit, lossOrders, lossTotal, products, lab, months, supervisors, firms, delivery, dataQuality }
}
