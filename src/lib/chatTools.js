// Chatbot tools — run in the browser on the already-loaded, firm-filtered RCA model.
// Pure functions (no React / fetch): (args, ctx) → small JSON-able object. Names/params must match
// server/chatTools.schema.js. All numbers come from rca.js so the bot says exactly what the pages show.

import { aggregateBusiness, comparePercents, describeLine, summarizeCost, summarizeLab } from './rca.js'
import { firmLabel, normalizeKey, numericDo } from './normalize.js'

// lists shown in chat; bigger tables should go through export_data
const MAX_LIMIT = 50
const lim = (n, d = 10) => Math.max(1, Math.min(MAX_LIMIT, Number.isFinite(n) && n > 0 ? Math.floor(n) : d))
const r1 = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null)
const r0 = (v) => (Number.isFinite(v) ? Math.round(v) : null)
const day = (v) => {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString().slice(0, 10)
}
const orderLink = (o) => `/orders/${encodeURIComponent(o.key)}`
const nm = (o) => (k) => o.names[k] || k

function orderBrief(o) {
  return {
    do_no: o.doNo,
    product: o.product,
    party: o.party || null,
    firm: firmLabel(o.firm),
    ordered_mt: r1(o.orderQty),
    produced_mt: r1(o.producedQty),
    batches: o.batches.length,
    batch_status: o.batchCounts,
    overall: o.severity,
    avg_mix_shift_pct: r1(o.avgShift),
    compositions: o.compositions.map((c) => c.no),
    link: orderLink(o),
  }
}

/** Orders matching a DO number (and optional product). */
function findOrders(model, doNo, product) {
  const k = normalizeKey(doNo)
  let list = model.orders.filter((o) => normalizeKey(o.doNo) === k)
  if (!list.length) {
    const n = numericDo(doNo)
    if (n !== null) list = model.orders.filter((o) => numericDo(o.doNo) === n)
  }
  if (product) {
    const p = String(product).toLowerCase().replace(/\s+/g, '')
    const byProd = list.filter((o) => String(o.product).toLowerCase().replace(/\s+/g, '').includes(p))
    if (byProd.length) list = byProd
  }
  return list
}

function pickOrder(model, doNo, product) {
  const list = findOrders(model, doNo, product)
  if (!list.length) return { error: `${doNo} not found (or it belongs to a firm you cannot see).` }
  if (list.length > 1) {
    const withBatches = list.filter((o) => o.batches.length)
    if (withBatches.length === 1) return { order: withBatches[0] }
    return {
      error: `${doNo} has ${list.length} products — ask which product.`,
      options: list.map((o) => ({ product: o.product, batches: o.batches.length, link: orderLink(o) })),
    }
  }
  return { order: list[0] }
}

function pickBatch(order, batch, jobCard) {
  if (jobCard) {
    const k = normalizeKey(jobCard)
    const b = order.batches.find((x) => normalizeKey(x.jobCard) === k)
    if (b) return b
  }
  if (Number.isFinite(batch)) return order.batches[batch - 1] || null
  return null
}

const lineOut = (l, names) => ({
  material: names(l.key),
  base_pct: r1(l.base),
  actual_pct: r1(l.actual),
  diff_pp: r1(l.dev),
  status: l.status === 'added' ? 'not in std' : l.status === 'missing' ? 'skipped' : l.status,
})

// ---------------------------------------------------------------------------------------------

function search_orders(args, { model }) {
  const q = String(args.query ?? '').trim().toLowerCase()
  const firm = args.firm ? String(args.firm).toLowerCase() : null
  let list = model.orders.filter((o) => o.batches.length || o.compositions.length)
  if (firm) list = list.filter((o) => firmLabel(o.firm).toLowerCase().includes(firm))
  if (args.severity) list = list.filter((o) => o.severity === args.severity)
  if (q)
    list = list.filter((o) =>
      [o.doNo, o.product, o.party, ...o.batches.map((b) => b.jobCard), ...o.compositions.map((c) => c.no)]
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  const sorts = {
    recent: (a, b) => (b.lastBatchAt || 0) - (a.lastBatchAt || 0),
    shift: (a, b) => b.avgShift - a.avgShift,
    batches: (a, b) => b.batches.length - a.batches.length,
    unreviewed: (a, b) => b.unreviewedMajor - a.unreviewedMajor,
  }
  list.sort(sorts[args.sort] || sorts.recent)
  return { total_matches: list.length, orders: list.slice(0, lim(args.limit)).map(orderBrief) }
}

function get_order(args, { model }) {
  const { order: o, error, options } = pickOrder(model, args.do_no, args.product)
  if (!o) return { error, options }
  const names = nm(o)
  const latest = o.compositions[o.compositions.length - 1]
  const lab = summarizeLab(o.batches)
    .filter((p) => p.judged)
    .map((p) => ({ test: p.label, matched: `${p.ok}/${p.judged}` }))
  const cost = summarizeCost(o.batches)
  return {
    ...orderBrief(o),
    expected_delivery: day(o.expectedDelivery),
    cancelled: o.cancelled,
    unreviewed_major_batches: o.unreviewedMajor,
    composition: latest
      ? { no: latest.no, status: latest.status, revisions: o.compositions.length, recipe: latest.items.map((i) => `${i.name} ${i.value}%`) }
      : null,
    batches: o.batches.slice(-30).map((b) => {
      const top = b.vsStandard?.lines.find((l) => l.status !== 'ok')
      return {
        batch: b.seq,
        job_card: b.jobCard,
        date: day(b.date),
        fg_mt: b.fgQty,
        status: b.severity,
        mix_shift_pct: r1(b.vsStandard?.shift),
        biggest_change: top ? describeLine(top, names) : null,
        reviewed: b.reviewed,
      }
    }),
    batches_note: o.batches.length > 30 ? `Only the last 30 of ${o.batches.length} batches are listed.` : undefined,
    findings: o.findings.slice(0, 8).map((f) => ({ severity: f.severity, title: f.title, detail: f.detail.slice(0, 400), batches: f.batches.slice(0, 12) })),
    lab_vs_target: lab,
    cost: cost.batches
      ? {
          expected_rm_rs: r0(cost.expected),
          actual_rm_rs: r0(cost.actual),
          diff_rs: r0(cost.diff),
          diff_pct: r1(cost.diffPct),
          final_costing_per_mt_rs: r0(cost.costingPerMt),
        }
      : null,
  }
}

function get_batch(args, { model }) {
  // a DO can carry several products; keep only those that actually have this batch / JC — saves a round trip
  const cands = findOrders(model, args.do_no, args.product).filter((x) => pickBatch(x, args.batch, args.job_card))
  const picked = cands.length === 1 ? { order: cands[0] } : pickOrder(model, args.do_no, args.product)
  const { order: o, error, options } = picked
  if (!o) return { error, options }
  const b = pickBatch(o, args.batch, args.job_card)
  if (!b) return { error: `Batch not found. ${o.doNo} has ${o.batches.length} batches (B1–B${o.batches.length}).` }
  const names = nm(o)
  const prev = b.seq > 1 ? o.batches[b.seq - 2] : null
  return {
    do_no: o.doNo,
    product: o.product,
    batch: b.seq,
    job_card: b.jobCard,
    date: day(b.date),
    supervisor: b.supervisor,
    fg_mt: b.fgQty,
    rm_total_mt: r1(b.rmTotal),
    status: b.severity,
    standard: b.standard?.no || null,
    mix_shift_pct: r1(b.vsStandard?.shift),
    vs_standard: b.vsStandard ? b.vsStandard.lines.filter((l) => l.status !== 'ok').map((l) => lineOut(l, names)) : null,
    vs_previous_batch: prev && b.vsPrev ? { previous: `B${prev.seq} ${prev.jobCard}`, changes: b.vsPrev.lines.filter((l) => l.status !== 'ok').map((l) => lineOut(l, names)) } : null,
    kg_entries_fixed: b.unitFixes.map((x) => `${x.name}: entered ${x.enteredQty} → ${r1(x.value * 1000) / 1000} MT`),
    lab: b.labCheck.items
      .filter((i) => i.actualText !== null && String(i.actualText).trim())
      .map((i) => ({ test: i.label, result: String(i.actualText).trim(), target: i.targetText, status: i.status, off_by: i.diff ? r1(i.diff) : null })),
    cost: {
      expected_rm_rs: r0(b.cost.expected),
      actual_rm_rs: r0(b.cost.actualCorrected ?? b.cost.actual),
      final_costing_per_mt_rs: r0(b.cost.costingPerMt),
    },
    root_causes_recorded: b.reviews.map((r) => ({ category: r.root_cause_category, detail: r.root_cause_detail, status: r.status, by: r.reviewed_by })),
    link: `${orderLink(o)}?batch=${b.id}`,
  }
}

function compare_batches(args, { model, settings }) {
  const A = pickOrder(model, args.a_do_no, args.product)
  const B = pickOrder(model, args.b_do_no, args.product)
  if (!A.order) return { error: `A: ${A.error}`, options: A.options }
  if (!B.order) return { error: `B: ${B.error}`, options: B.options }
  const a = A.order.batches[args.a_batch - 1]
  const b = B.order.batches[args.b_batch - 1]
  if (!a || !b) return { error: 'Invalid batch number.' }
  const names = (k) => A.order.names[k] || B.order.names[k] || k
  const res = comparePercents(a.percents, b.percents, settings, {})
  return {
    a: `${A.order.doNo} B${a.seq} ${a.jobCard} (${day(a.date)})`,
    b: `${B.order.doNo} B${b.seq} ${b.jobCard} (${day(b.date)})`,
    mix_shift_pct: r1(res.shift),
    changes: res.lines.filter((l) => l.status !== 'ok').map((l) => lineOut(l, names)),
    unchanged_materials: res.lines.filter((l) => l.status === 'ok').length,
    links: [`${orderLink(A.order)}?batch=${a.id}`, `${orderLink(B.order)}?batch=${b.id}`],
  }
}

function business_summary(args, { model, todayMs }) {
  const n = lim(args.limit)
  const biz = aggregateBusiness(model.orders, todayMs)
  const p = biz.profit
  switch (args.section) {
    case 'overview':
      return { ...model.totals, avgShift: r1(model.totals.avgShift), producedQty: r0(model.totals.producedQty), link: '/' }
    case 'profit':
      return {
        batches: p.batches,
        sales_rs: r0(p.sales),
        expected_profit_rs: r0(p.expProfit),
        actual_profit_rs: r0(p.actProfit),
        margin_pct: r1(p.margin),
        lost_to_deviation_rs: r0(p.deviationImpact),
        costing_stage_margin_pct: r1(p.costing.margin),
        extra_rm_cost_by_status: Object.fromEntries(Object.entries(p.bySeverity).map(([k, v]) => [k, { batches: v.batches, extra_rs: r0(v.extraRm), extra_pct: r1(v.extraPct) }])),
        loss_batches: biz.lossTotal.batches,
        loss_rs: r0(biz.lossTotal.amount),
        excluded_cost_error_batches: biz.dataQuality.costErrors.length,
        link: '/',
      }
    case 'loss_orders':
      return {
        orders: biz.lossOrders.slice(0, n).map((e) => ({
          do_no: e.order.doNo,
          product: e.order.product,
          firm: firmLabel(e.order.firm),
          loss_batches: `${e.lossBatches}/${e.batches}`,
          loss_rs: r0(e.loss),
          order_margin_pct: r1((e.profit / e.sales) * 100),
          link: `${orderLink(e.order)}?tab=cost`,
        })),
      }
    case 'product_margin': {
      const elig = biz.products.filter((x) => x.batches >= 5)
      const fmt = (x) => ({ product: x.product, batches: x.batches, profit_rs: r0(x.profit), margin_pct: r1(x.margin) })
      return { lowest: elig.slice(0, n).map(fmt), highest: [...elig].reverse().slice(0, n).map(fmt), note: 'products with >= 5 batches' }
    }
    case 'lab_quality':
      return {
        checks: biz.lab.checks,
        on_target_pct: r1(biz.lab.rate),
        when_mix_followed_pct: r1(biz.lab.mixOk.rate),
        when_major_deviation_pct: r1(biz.lab.mixMajor.rate),
        by_test: biz.lab.props.map((x) => ({ test: x.label, results: x.checks, on_target_pct: r1(x.rate) })).sort((a, b) => a.on_target_pct - b.on_target_pct),
      }
    case 'monthly_trend':
      return { months: biz.months.map((m) => ({ month: m.month, batches: m.batches, fg_mt: r0(m.fg), followed_composition_pct: r1(m.okRate), avg_shift_pct: r1(m.avgShift), margin_pct: r1(m.margin) })) }
    case 'supervisors':
    case 'firms': {
      const rows = args.section === 'supervisors' ? biz.supervisors.filter((s) => s.batches >= 5) : biz.firms
      return { rows: rows.slice(0, n).map((s) => ({ name: args.section === 'firms' ? firmLabel(s.name) : s.name, batches: s.batches, fg_mt: r0(s.fg), major_pct: r1(s.majorRate), avg_shift_pct: r1(s.avgShift) })) }
    }
    case 'delivery':
      return {
        open_orders: biz.delivery.open,
        pending_mt: r0(biz.delivery.pendingMt),
        overdue_orders: biz.delivery.overdue,
        overdue_mt: r0(biz.delivery.overdueMt),
        most_overdue: biz.delivery.overdueList.slice(0, n).map((x) => ({ do_no: x.order.doNo, product: x.order.product, firm: firmLabel(x.order.firm), pending_mt: r1(x.pending), expected: day(x.due), late_days: x.overdueDays, link: orderLink(x.order) })),
      }
    case 'data_quality': {
      const q = biz.dataQuality
      return {
        impossible_cost_batches: q.costErrors.length,
        impossible_cost_examples: q.costErrors.slice(0, n).map((e) => ({ do_no: e.o.doNo, job_card: e.b.jobCard, composition_cost_rs: r0(e.expected), saved_cost_rs: r0(e.actual) })),
        kg_entry_batches: q.kgEntries,
        compositions_without_lab_target: `${q.noLabTarget}/${q.compositions}`,
        batches_not_lab_tested: `${q.notTested}/${q.batches}`,
        batches_without_composition: q.noComposition,
      }
    }
    default:
      return { error: `Unknown section ${args.section}` }
  }
}

function material_stats(args, { model }) {
  const q = String(args.name ?? '').trim().toLowerCase()
  const list = q ? model.materials.filter((m) => m.name.toLowerCase().includes(q)) : model.materials.filter((m) => m.batches >= 5)
  return {
    total_matches: list.length,
    materials: list.slice(0, lim(args.limit)).map((m) => ({
      material: m.name,
      batches: m.batches,
      off_standard_pct: r1(m.deviationRate),
      avg_abs_diff_pp: r1(m.avgAbsDev),
      bias_pp: r1(m.avgDev),
      used_not_in_std: m.added,
      skipped: m.missing,
      products: m.products.slice(0, 6),
    })),
    link: '/materials',
  }
}
// ---------------------------------------------------------------------------------------------
// Export — tables the user can download as CSV / Excel from the chat. buildExport is pure (rows only);
// ChatPanel turns the result into a file (lib/xlsx.js) and shows a download button.
// Order-level exports mirror the app's tabs: Batch matrix, Batch vs batch, Lab, Cost. Cells can carry a style
// ({ v, s }) so Excel shows the same status colours as the app (ok / minor / major / added / missing).

export const EXPORT_MAX_ROWS = 5000

const EXPORT_DATASETS = {
  orders: 'Orders with batch status (filters: query, firm, severity)',
  order_report: 'Full workbook of one order: Batch matrix + Deviation + Batches + Lab + Cost sheets (needs do_no)',
  order_matrix: 'Batch matrix of one order like the app (materials × batches, coloured) + Deviation + Batches sheets (needs do_no)',
  order_batches: 'Batch list of one order (needs do_no)',
  batch_compare: 'Batch vs batch like the app: Raw material | Base | Compare | Δ | Deviation | Status (do_no+batch vs b_do_no+b_batch)',
  batch_lines: 'One batch vs its composition, Batch-vs-batch format (needs do_no + batch/job_card)',
  order_lab: 'Lab tab of one order: Test | Your target | Matched | B1..Bn (needs do_no)',
  lab_results: 'Every lab result vs target for one order as a long list (needs do_no)',
  order_cost: 'Cost tab of one order: expected vs actual RM cost per batch + total (needs do_no)',
  loss_orders: 'Loss-making orders',
  product_margin: 'Margin by product',
  monthly_trend: 'Month-wise batches, compliance, margin',
  supervisors: 'Supervisor-wise deviation',
  firms: 'Firm-wise deviation',
  delivery_overdue: 'Orders past expected delivery',
  lab_by_test: 'Lab on-target % by test',
  materials: 'Raw-material deviation stats',
  cost_errors: 'Batches with impossible saved cost',
}
export const EXPORT_DATASET_NAMES = Object.keys(EXPORT_DATASETS)

const slug = (s) =>
  String(s || '')
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 60)

const STATUS_TEXT = { ok: 'OK', minor: 'Minor', major: 'Major', added: 'Not in std', missing: 'Skipped' }
const r2 = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null)
const pctCell = (v) => (v > 0 && v < 1 ? r2(v) : r1(v))
const sc = (v, s) => (s ? { v, s } : v) // styled cell
const statusCell = (st) => sc(STATUS_TEXT[st] || st, st === 'ok' ? 'ok' : st)
const devWord = (d) => (Math.abs(d) < 0.005 ? 'Same' : d > 0 ? 'Higher than base' : 'Lower than base')

/** Batch-vs-batch table (same columns as the app's CompareTable). */
function compareSheet(name, result, baseLabel, actualLabel, names) {
  const counts = result.lines.reduce((m, l) => ((m[l.status] = (m[l.status] || 0) + 1), m), {})
  const rows = result.lines.map((l) => [
    names(l.key),
    l.base > 0 ? pctCell(l.base) : null,
    l.actual > 0 ? pctCell(l.actual) : null,
    sc(r2(l.dev), l.status === 'ok' ? null : l.status === 'added' ? 'added' : l.status === 'minor' ? 'minor' : 'major'),
    devWord(l.dev),
    statusCell(l.status),
  ])
  rows.push([], [sc('Total mix shift %', 'bold'), null, null, sc(r1(result.shift), 'bold')])
  rows.push([sc(Object.entries(counts).map(([k, n]) => `${n} ${STATUS_TEXT[k] || k}`).join(' · '), 'note')])
  rows.push([sc('Δ = compare % − base % in percentage points (pp). Status: OK ≤ 1 pp, Minor 1–3 pp, Major > 3 pp.', 'note')])
  return { name, columns: ['Raw material', `${baseLabel} %`, `${actualLabel} %`, 'Δ (pp)', 'Deviation', 'Status'], rows, freezeCols: 1 }
}

/** Batch matrix like the app: materials × batches; value = actual % (or Δ pp), coloured by status vs the batch's standard. */
function matrixSheet(o, mode) {
  const latest = o.compositions[o.compositions.length - 1]
  const columns = ['Raw material', ...(latest ? [`Std ${latest.no} %`] : []), ...o.batches.map((b) => `B${b.seq} ${b.jobCard}`)]
  const rows = o.materialKeys.map((k) => [
    o.names[k],
    ...(latest ? [sc(latest.percents[k] > 0 ? pctCell(latest.percents[k]) : null, 'std')] : []),
    ...o.batches.map((b) => {
      const l = b.vsStandard?.lines.find((x) => x.key === k)
      const actual = b.percents[k] || 0
      const st = l ? l.status : actual > 0 ? 'ok' : null
      if (!st) return null
      const v = mode === 'dev' ? (l ? r2(l.dev) : null) : st === 'missing' ? 0 : pctCell(actual)
      return sc(v, st === 'ok' ? null : st)
    }),
  ])
  const foot = (label, f) => [sc(label, 'bold'), ...(latest ? [null] : []), ...o.batches.map(f)]
  rows.push(
    [],
    foot('FG produced (MT)', (b) => sc(b.fgQty, 'bold')),
    foot('Mix shift %', (b) => sc(b.vsStandard ? r1(b.vsStandard.shift) : null, b.severity === 'ok' ? 'ok' : b.severity)),
    foot('RM ÷ FG %', (b) => (b.coverage !== null ? r1(b.coverage) : null)),
    foot('Status', (b) => statusCell(b.severity)),
    foot('Standard', (b) => b.standard?.no || ''),
    foot('Date', (b) => day(b.date)),
    foot('Root cause recorded', (b) => (b.reviewed ? 'Yes' : 'No')),
    [],
    [sc(mode === 'dev' ? 'Values = Δ vs the batch’s own composition (pp).' : 'Values = % share of the batch mix (packaging excluded; kg entries converted).', 'note')],
    [sc('Colours: yellow = Minor (1–3 pp) · red = Major (> 3 pp) · purple = Not in composition · red hatched = Skipped (0).', 'note')],
  )
  return { name: mode === 'dev' ? 'Deviation (pp)' : 'Batch matrix', columns, rows, freezeCols: 1 }
}

function batchesSheet(o) {
  const names = nm(o)
  return {
    name: 'Batches',
    columns: ['Batch', 'Job card', 'Date', 'Supervisor', 'FG MT', 'Status', 'Mix shift %', 'Standard', 'Biggest change', 'Expected RM ₹', 'Actual RM ₹', 'Final costing ₹/MT', 'Root cause recorded'],
    rows: o.batches.map((b) => {
      const top = b.vsStandard?.lines.find((l) => l.status !== 'ok')
      return [b.seq, b.jobCard, day(b.date), b.supervisor, b.fgQty, statusCell(b.severity), r1(b.vsStandard?.shift), b.standard?.no || '', top ? describeLine(top, names) : '', r0(b.cost.expected), r0(b.cost.actualCorrected ?? b.cost.actual), r0(b.cost.costingPerMt), b.reviewed ? 'Yes' : 'No']
    }),
    freezeCols: 2,
  }
}

/** Lab tab: tests × batches with "your target" and matched count. */
function labSheet(o) {
  const summary = summarizeLab(o.batches).filter((p) => p.tested > 0)
  const latest = o.compositions[o.compositions.length - 1]
  const items = o.batches.find((b) => b.standard?.id === latest?.id)?.labCheck.items || o.batches[0]?.labCheck.items || []
  const target = (key) => items.find((i) => i.key === key)?.targetText || 'not set'
  const off = (it) => {
    if (!it.diff) return ''
    const v = Math.abs(it.diff)
    return ` (${it.diff > 0 ? '↑' : '↓'} ${v < 1 ? r2(v) : r1(v)}${it.unit === 'min' ? ' min' : ''} ${it.diff > 0 ? 'high' : 'low'})`
  }
  const rows = summary.map((p) => [
    sc(p.label, 'bold'),
    sc(target(p.key), 'std'),
    p.judged ? sc(`${p.ok}/${p.judged}`, p.ok === p.judged ? 'ok' : p.ok / p.judged >= 0.5 ? 'minor' : 'major') : '—',
    ...o.batches.map((b) => {
      const it = b.labCheck.items.find((i) => i.key === p.key)
      const raw = it?.actualText !== null && it?.actualText !== undefined ? String(it.actualText).trim() : ''
      if (!raw) return null
      if (it.status === 'ok') return sc(`${raw} ✓`, 'ok')
      if (it.status === 'minor' || it.status === 'major') return sc(raw + off(it), it.status)
      return it.status === 'notarget' ? `${raw} (no target)` : raw
    }),
  ])
  rows.push([], [sc(`Your target = “Expected …” values entered while creating composition ${latest?.no || ''}. ✓ = matched; ↓/↑ = how far outside the target.`, 'note')])
  return { name: 'Lab', columns: ['Test', `Your target (${latest?.no || '—'})`, 'Matched', ...o.batches.map((b) => `B${b.seq} ${b.jobCard}`)], rows, freezeCols: 3 }
}

/** Cost tab: per batch expected vs actual RM cost, ₹/MT, final costing, total row. */
function costSheet(o) {
  const s = summarizeCost(o.batches)
  const money = (d) => sc(r0(d), d > 0 ? 'bad' : d < 0 ? 'good' : null)
  const pct = (d, e) => (d !== null && e ? sc(r1((d / e) * 100), d > 0 ? 'bad' : d < 0 ? 'good' : null) : null)
  const rows = o.batches.map((b) => {
    const e = b.cost.expected
    const a = b.cost.actualCorrected ?? b.cost.actual
    const d = e !== null && a !== null ? a - e : null
    return [`B${b.seq}`, b.jobCard, day(b.date), b.fgQty, r0(e), r0(a), d === null ? null : money(d), pct(d, e), e !== null && b.fgQty ? r0(e / b.fgQty) : null, a !== null && b.fgQty ? r0(a / b.fgQty) : null, r0(b.cost.costingPerMt), b.cost.kgExcess > 0 ? 'kg entry corrected' : '']
  })
  rows.push(
    [],
    [sc(`Total (${s.batches} batches)`, 'bold'), null, null, sc(r1(s.fg), 'bold'), sc(r0(s.expected), 'bold'), sc(r0(s.actual), 'bold'), money(s.diff), s.diffPct === null ? null : sc(r1(s.diffPct), s.diff > 0 ? 'bad' : 'good'), sc(r0(s.expectedPerMt), 'bold'), sc(r0(s.actualPerMt), 'bold'), sc(r0(s.costingPerMt), 'bold')],
    [],
    [sc('Expected RM = composition % × FG × KYC rate; Actual RM = RM entered × rate (kg entries corrected). Red = costlier, green = cheaper. Final costing = Costing stage ₹/MT.', 'note')],
  )
  return { name: 'Cost', columns: ['Batch', 'Job card', 'Date', 'FG (MT)', 'Expected RM ₹', 'Actual RM ₹', 'Difference ₹', 'Diff %', 'Expected ₹/MT', 'Actual ₹/MT', 'Final costing ₹/MT', 'Note'], rows, freezeCols: 2 }
}

/** → { filename, sheets: [{ name, columns, rows, freezeCols? }], total } or { error } */
export function buildExport(args, { model, settings, todayMs }) {
  const ds = args.dataset
  const firm = args.firm ? String(args.firm).toLowerCase() : null
  const biz = () => aggregateBusiness(model.orders, todayMs)
  const book = (name, sheets) => ({
    filename: slug(args.filename || name),
    sheets: sheets.map((s) => ({ ...s, rows: s.rows.slice(0, EXPORT_MAX_ROWS) })),
    total: sheets[0].rows.length,
  })
  const out = (name, columns, rows) => book(name, [{ name: name.slice(0, 31), columns, rows }])
  const needOrder = () => {
    if (!args.do_no) return { error: 'This export needs do_no.' }
    return pickOrder(model, args.do_no, args.product)
  }
  const needBatch = (o, batch, jobCard) => pickBatch(o, batch, jobCard)
  // a DO can carry several products — prefer the one that actually has this batch (same rule as get_batch)
  const orderWithBatch = (doNo, batch, jobCard) => {
    const cands = findOrders(model, doNo, args.product).filter((x) => pickBatch(x, batch, jobCard))
    return cands.length === 1 ? { order: cands[0] } : pickOrder(model, doNo, args.product)
  }

  switch (ds) {
    case 'orders': {
      const q = String(args.query ?? '').trim().toLowerCase()
      let list = model.orders.filter((o) => o.batches.length || o.compositions.length)
      if (firm) list = list.filter((o) => firmLabel(o.firm).toLowerCase().includes(firm))
      if (args.severity) list = list.filter((o) => o.severity === args.severity)
      if (q) list = list.filter((o) => [o.doNo, o.product, o.party, ...o.batches.map((b) => b.jobCard)].join(' ').toLowerCase().includes(q))
      return out('Orders', ['DO', 'Product', 'Party', 'Firm', 'Ordered MT', 'Produced MT', 'Batches', 'OK', 'Minor', 'Major', 'Avg mix shift %', 'Compositions', 'Overall', 'Expected delivery'],
        list.map((o) => [o.doNo, o.product, o.party, firmLabel(o.firm), r1(o.orderQty), r1(o.producedQty), o.batches.length, o.batchCounts.ok, o.batchCounts.minor, o.batchCounts.major, r1(o.avgShift), o.compositions.map((c) => c.no).join(' → '), statusCell(o.severity === 'none' ? 'ok' : o.severity), day(o.expectedDelivery)]))
    }
    case 'order_report':
    case 'order_matrix':
    case 'order_batches':
    case 'order_lab':
    case 'order_cost': {
      const { order: o, error } = needOrder()
      if (!o) return { error }
      if (!o.batches.length) return { error: `${o.doNo} has no batches yet.` }
      const base = `${o.doNo} ${o.product}`
      if (ds === 'order_batches') return book(`${base} batches`, [batchesSheet(o)])
      if (ds === 'order_lab') return book(`${base} lab`, [labSheet(o)])
      if (ds === 'order_cost') return book(`${base} cost`, [costSheet(o)])
      if (ds === 'order_matrix') return book(`${base} batch matrix`, [matrixSheet(o, 'actual'), matrixSheet(o, 'dev'), batchesSheet(o)])
      return book(`${base} report`, [matrixSheet(o, 'actual'), matrixSheet(o, 'dev'), batchesSheet(o), labSheet(o), costSheet(o)])
    }
    case 'batch_lines':
    case 'batch_compare': {
      if (!args.do_no) return { error: 'This export needs do_no.' }
      const { order: oa, error } = orderWithBatch(args.do_no, args.batch, args.job_card)
      if (!oa) return { error }
      const a = needBatch(oa, args.batch, args.job_card)
      if (!a) return { error: `Batch not found in ${oa.doNo}.` }
      const hasB = ds === 'batch_compare' && (args.b_batch || args.b_job_card)
      if (!hasB) {
        if (!a.vsStandard) return { error: 'No composition linked to this batch.' }
        return book(`${oa.doNo} B${a.seq} vs ${a.standard.no}`, [compareSheet(`B${a.seq} vs ${a.standard.no}`, a.vsStandard, `Std ${a.standard.no}`, `B${a.seq} ${a.jobCard}`, nm(oa))])
      }
      const B = args.b_do_no && normalizeKey(args.b_do_no) !== normalizeKey(args.do_no) ? orderWithBatch(args.b_do_no, args.b_batch, args.b_job_card) : { order: oa }
      if (!B.order) return { error: `B: ${B.error}` }
      const b = needBatch(B.order, args.b_batch, args.b_job_card)
      if (!b) return { error: `Batch B not found in ${B.order.doNo}.` }
      const names = (k) => oa.names[k] || B.order.names[k] || k
      const res = comparePercents(a.percents, b.percents, settings, {})
      const la = `${oa.doNo === B.order.doNo ? '' : `${oa.doNo} `}B${a.seq} ${a.jobCard}`
      const lb = `${oa.doNo === B.order.doNo ? '' : `${B.order.doNo} `}B${b.seq} ${b.jobCard}`
      return book(`${oa.doNo} ${la} vs ${lb}`, [compareSheet('Batch vs batch', res, la, lb, names)])
    }
    case 'lab_results': {
      const { order: o, error } = needOrder()
      if (!o) return { error }
      const rows = []
      for (const b of o.batches)
        for (const i of b.labCheck.items)
          if (i.actualText !== null && String(i.actualText).trim())
            rows.push([b.seq, b.jobCard, day(b.raw.DateOfTest2 || b.raw.DateOfTest1 || b.date), i.label, String(i.actualText).trim(), i.targetText || '', ['ok', 'minor', 'major'].includes(i.status) ? statusCell(i.status) : i.status, i.diff ? r1(i.diff) : null])
      return out(`${o.doNo} lab results`, ['Batch', 'Job card', 'Tested on', 'Test', 'Result', 'Target', 'Status', 'Off by'], rows)
    }
    case 'loss_orders':
      return out('Loss orders', ['DO', 'Product', 'Firm', 'Loss batches', 'Total batches', 'Loss ₹', 'Sales ₹', 'Order profit ₹', 'Order margin %'],
        biz().lossOrders.map((e) => [e.order.doNo, e.order.product, firmLabel(e.order.firm), e.lossBatches, e.batches, sc(r0(e.loss), 'bad'), r0(e.sales), r0(e.profit), sc(r1((e.profit / e.sales) * 100), e.profit < 0 ? 'bad' : null)]))
    case 'product_margin':
      return out('Product margin', ['Product', 'Batches', 'FG MT', 'Sales ₹', 'Profit ₹', 'Margin %'],
        biz().products.map((p) => [p.product, p.batches, r1(p.fg), r0(p.sales), r0(p.profit), sc(r1(p.margin), p.margin < 0 ? 'bad' : p.margin < 10 ? 'minor' : 'good')]))
    case 'monthly_trend':
      return out('Monthly trend', ['Month', 'Batches', 'FG MT', 'Followed composition %', 'Avg mix shift %', 'Sales ₹', 'Profit ₹', 'Margin %'],
        biz().months.map((m) => [m.month, m.batches, r1(m.fg), r1(m.okRate), r1(m.avgShift), r0(m.sales), r0(m.profit), r1(m.margin)]))
    case 'supervisors':
    case 'firms': {
      const rows = ds === 'supervisors' ? biz().supervisors : biz().firms
      return out(ds === 'supervisors' ? 'Supervisors' : 'Firms', ['Name', 'Batches', 'FG MT', 'OK batches', 'Major batches', 'Major %', 'Avg mix shift %'],
        rows.map((s) => [ds === 'firms' ? firmLabel(s.name) : s.name, s.batches, r1(s.fg), s.ok, s.major, sc(r1(s.majorRate), s.majorRate > 80 ? 'major' : s.majorRate > 60 ? 'minor' : 'ok'), r1(s.avgShift)]))
    }
    case 'delivery_overdue':
      return out('Delivery overdue', ['DO', 'Product', 'Party', 'Firm', 'Ordered MT', 'Produced MT', 'Pending MT', 'Expected delivery', 'Days late'],
        biz().delivery.overdueList.filter((x) => !firm || firmLabel(x.order.firm).toLowerCase().includes(firm))
          .map((x) => [x.order.doNo, x.order.product, x.order.party, firmLabel(x.order.firm), r1(x.order.orderQty), r1(x.order.producedQty), r1(x.pending), day(x.due), sc(x.overdueDays, 'bad')]))
    case 'lab_by_test':
      return out('Lab by test', ['Test', 'Results', 'On target', 'On target %'],
        biz().lab.props.map((p) => [p.label, p.checks, p.ok, sc(r1(p.rate), p.rate >= 70 ? 'ok' : p.rate >= 40 ? 'minor' : 'major')]))
    case 'materials': {
      const q = String(args.query ?? '').trim().toLowerCase()
      const list = q ? model.materials.filter((m) => m.name.toLowerCase().includes(q)) : model.materials
      return out('Raw materials', ['Material', 'Batches', 'Off-standard %', 'Avg |Δ| pp', 'Bias pp', 'Used not in std', 'Skipped', 'Products'],
        list.map((m) => [m.name, m.batches, r1(m.deviationRate), r1(m.avgAbsDev), r1(m.avgDev), m.added, m.missing, m.products.join(' | ')]))
    }
    case 'cost_errors':
      return out('Cost errors', ['DO', 'Product', 'Job card', 'Composition cost ₹', 'Saved actual cost ₹', 'Ratio ×'],
        biz().dataQuality.costErrors.map((e) => [e.o.doNo, e.o.product, e.b.jobCard, r0(e.expected), sc(r0(e.actual), 'bad'), r2(e.actual / e.expected)]))
    default:
      return { error: `Unknown dataset ${ds}. Use one of: ${EXPORT_DATASET_NAMES.join(', ')}` }
  }
}

/** Tool wrapper: builds the workbook, returns a short summary to the model (rows themselves go to the file). */
function export_data(args, ctx) {
  const r = buildExport(args, ctx)
  if (r.error) return { error: r.error }
  const format = args.format === 'csv' ? 'csv' : 'xlsx'
  const first = r.sheets[0]
  const plain = (row) => row.map((c) => (c !== null && typeof c === 'object' && 'v' in c ? c.v : c))
  return {
    ok: true,
    file: `${r.filename}.${format}`,
    format,
    sheets: format === 'csv' ? [first.name] : r.sheets.map((s) => s.name),
    rows: first.rows.length,
    columns: first.columns,
    preview: first.rows.slice(0, 3).map(plain),
    note:
      format === 'csv' && r.sheets.length > 1
        ? 'CSV holds only the first sheet; suggest Excel for all sheets. A download button is shown under your answer.'
        : 'A download button for this file is shown under your answer. Tell the user it is ready and what sheets it has; do not paste all rows.',
  }
}

const TOOLS = { search_orders, get_order, get_batch, compare_batches, business_summary, material_stats, export_data }

/** Friendly status line shown while a tool runs. */
export function toolLabel(name, args) {
  const a = args || {}
  switch (name) {
    case 'search_orders':
      return `Searching orders${a.query ? ` “${a.query}”` : ''}…`
    case 'get_order':
      return `Looking at ${a.do_no || 'order'}…`
    case 'get_batch':
      return `Looking at batch ${a.job_card || (a.batch ? `B${a.batch}` : '')} of ${a.do_no || 'order'}…`
    case 'compare_batches':
      return 'Comparing batches…'
    case 'business_summary':
      return `Getting ${String(a.section || 'summary').replace('_', ' ')}…`
    case 'material_stats':
      return 'Checking raw-material data…'
    case 'export_data':
      return `Preparing ${a.format === 'csv' ? 'CSV' : 'Excel'} file…`
    default:
      return 'Checking data…'
  }
}

/** Run one tool call from the model; always returns a JSON string (errors included). */
export function runTool(name, rawArgs, ctx) {
  let args = {}
  try {
    args = typeof rawArgs === 'string' ? JSON.parse(rawArgs || '{}') : rawArgs || {}
  } catch {
    return JSON.stringify({ error: 'Invalid tool arguments' })
  }
  const fn = TOOLS[name]
  if (!fn) return JSON.stringify({ error: `Unknown tool ${name}` })
  try {
    return JSON.stringify(fn(args, ctx))
  } catch (e) {
    return JSON.stringify({ error: `Tool failed: ${e.message}` })
  }
}
