// Chatbot tools — run in the browser on the already-loaded, firm-filtered RCA model.
// Pure functions (no React / fetch): (args, ctx) → small JSON-able object. Names/params must match
// server/chatTools.schema.js. All numbers come from rca.js so the bot says exactly what the pages show.

import { aggregateBusiness, comparePercents, describeLine, summarizeCost, summarizeLab } from './rca.js'
import { firmLabel, normalizeKey, numericDo } from './normalize.js'

const MAX_LIMIT = 25
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

const TOOLS = { search_orders, get_order, get_batch, compare_batches, business_summary, material_stats }

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
