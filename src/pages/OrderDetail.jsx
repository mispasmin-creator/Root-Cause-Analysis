import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useData } from '../context/DataContext.jsx'
import { comparePercents, describeLine } from '../lib/rca.js'
import { fmtDate, fmtInr, fmtNum } from '../lib/format.js'
import { firmLabel } from '../lib/normalize.js'
import { exportCsv } from '../lib/exportCsv.js'
import { Badge, Empty, Kpi, Notice, SevBar, SeverityBadge } from '../components/ui.jsx'
import { IconDownload } from '../components/Icons.jsx'
import BatchMatrix from '../components/rca/BatchMatrix.jsx'
import FindingsList from '../components/rca/FindingsList.jsx'
import CompareTable from '../components/rca/CompareTable.jsx'
import BatchDrawer from '../components/rca/BatchDrawer.jsx'
import LabTab from '../components/rca/LabTab.jsx'
import CostTab from '../components/rca/CostTab.jsx'

export default function OrderDetail() {
  const { key } = useParams()
  const { model, settings } = useData()
  const [params, setParams] = useSearchParams()
  const order = model.orders.find((o) => o.key === decodeURIComponent(key))
  // unknown / removed tabs (old links to ?tab=mix or ?tab=trend) fall back to the matrix
  const TAB_IDS = ['matrix', 'compare', 'compositions', 'lab', 'cost']
  const tab = TAB_IDS.includes(params.get('tab')) ? params.get('tab') : 'matrix'
  const batchId = Number(params.get('batch')) || null

  const setParam = (k, v) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, String(v))
    else next.delete(k)
    setParams(next, { replace: k === 'tab' })
  }

  if (!order)
    return (
      <Empty title="Order not found">
        It may belong to a firm you can’t see, or data was refreshed. <Link to="/orders">Back to orders</Link>
      </Empty>
    )

  // derive from the live model so the drawer updates after a review is saved
  const selected = batchId ? order.batches.find((b) => b.id === batchId) : null
  const openBatch = (b) => b && setParam('batch', b.id)

  const exportMatrix = () =>
    exportCsv(
      `rca-${order.doNo}-${order.product}.csv`.replace(/[^\w.-]+/g, '_'),
      order.materialKeys.map((k) => {
        const row = { 'Raw material': order.names[k] }
        order.compositions.forEach((c) => (row[`Std ${c.no} %`] = c.percents[k] ? c.percents[k].toFixed(2) : ''))
        order.batches.forEach((b) => {
          const l = b.vsStandard?.lines.find((x) => x.key === k)
          row[`B${b.seq} ${b.jobCard} %`] = b.percents[k] ? b.percents[k].toFixed(2) : ''
          row[`B${b.seq} Δpp`] = l ? l.dev.toFixed(2) : ''
        })
        return row
      }),
    )

  const tabs = [
    { id: 'matrix', label: 'Batch matrix' },
    { id: 'compare', label: 'Batch vs batch' },
    { id: 'compositions', label: 'Composition history', count: order.compositions.length },
    { id: 'lab', label: 'Lab' },
    { id: 'cost', label: 'Cost' },
  ]

  return (
    <div className="stack">
      <div className="page-head">
        <div style={{ minWidth: 0 }}>
          <div className="crumbs">
            <Link to="/orders">Orders</Link> / {order.doNo}
          </div>
          <div className="row">
            <h1 style={{ margin: 0 }}>
              {order.doNo} · {order.product}
            </h1>
            <SeverityBadge severity={order.severity} />
          </div>
          <p style={{ marginTop: 4 }}>
            {order.party || 'Party not set'} · <Badge>{firmLabel(order.firm)}</Badge>
            {order.expectedDelivery && <> · Expected {fmtDate(order.expectedDelivery)}</>}
            {order.cancelled && (
              <>
                {' '}
                · <Badge tone="major">Order cancelled</Badge>
              </>
            )}
          </p>
        </div>
        <button className="btn" onClick={exportMatrix} disabled={!order.batches.length}>
          <IconDownload /> Export matrix
        </button>
      </div>

      <div className="grid grid-kpi">
        <Kpi
          label="Produced / ordered"
          value={`${fmtNum(order.producedQty)} MT`}
          sub={order.orderQty ? `of ${fmtNum(order.orderQty)} MT (${((order.producedQty / order.orderQty) * 100).toFixed(0)}%)` : 'order qty unknown'}
        />
        <Kpi label="Batches" value={order.batches.length} sub={<SevBar counts={order.batchCounts} />} />
        <Kpi
          label="Compositions"
          value={order.compositions.length}
          sub={order.compositions.length ? order.compositions.map((c) => c.no).join(' → ') : 'none linked'}
        />
        <Kpi label="Avg mix shift" value={`${order.avgShift.toFixed(1)}%`} sub="vs standard, per batch" tone={order.severity === 'none' ? undefined : order.severity} />
        <Kpi label="Unreviewed major" value={order.unreviewedMajor} sub="batches needing a root cause" tone={order.unreviewedMajor ? 'minor' : 'ok'} />
      </div>

      {order.batches.length === 0 ? (
        <div className="card">
          <Empty title="No batches produced yet">Batches appear here once Production entries are made for this order’s job cards.</Empty>
        </div>
      ) : (
        <>
          <div>
            <div className="tabs" role="tablist">
              {tabs.map((t) => (
                <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setParam('tab', t.id === 'matrix' ? '' : t.id)} role="tab">
                  {t.label}
                  {t.count > 0 && <span className="count">{t.count}</span>}
                </button>
              ))}
            </div>

            {tab === 'matrix' && (
              <section className="card">
                <BatchMatrix order={order} onSelectBatch={openBatch} selectedId={batchId} />
              </section>
            )}
            {tab === 'compare' && <BatchVsBatch order={order} settings={settings} />}
            {tab === 'compositions' && <CompositionHistory order={order} />}
            {tab === 'lab' && <LabTab order={order} onSelectBatch={openBatch} />}
            {tab === 'cost' && <CostTab order={order} onSelectBatch={openBatch} />}
          </div>

          {/* findings sit below the analysis tabs (user preference) */}
          <section className="card">
            <div className="card-head">
              <h2>Root-cause findings</h2>
              <span className="faint" style={{ fontSize: 12 }}>
                auto-detected · click a batch chip to inspect
              </span>
            </div>
            <FindingsList findings={order.findings} batches={order.batches} onSelectBatch={openBatch} />
          </section>
        </>
      )}

      {selected && <BatchDrawer order={order} batch={selected} onClose={() => setParam('batch', null)} />}
    </div>
  )
}

// ---------------------------------------------------------------------------------------------

function sourcesFor(order) {
  return [
    ...order.compositions.map((c) => ({ id: `c${c.id}`, label: `Standard ${c.no}`, percents: c.percents })),
    ...order.batches.map((b) => ({ id: `b${b.id}`, label: `B${b.seq} · ${b.jobCard} · ${fmtDate(b.date)}`, short: `B${b.seq}`, percents: b.percents })),
  ]
}

function BatchVsBatch({ order, settings }) {
  const sources = useMemo(() => sourcesFor(order), [order])
  const n = order.batches.length
  const [a, setA] = useState(n >= 2 ? `b${order.batches[n - 2].id}` : sources[0]?.id)
  const [b, setB] = useState(n >= 1 ? `b${order.batches[n - 1].id}` : sources[1]?.id)
  const A = sources.find((s) => s.id === a)
  const B = sources.find((s) => s.id === b)
  const result = A && B ? comparePercents(A.percents, B.percents, settings, order.names) : null

  const pick = (value, set, label) => (
    <div className="field" style={{ flex: 1, minWidth: 220 }}>
      <label>{label}</label>
      <select className="select" value={value} onChange={(e) => set(e.target.value)}>
        {sources.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
    </div>
  )

  return (
    <section className="card">
      <div className="card-head" style={{ alignItems: 'flex-end' }}>
        {pick(a, setA, 'Base (expected / earlier)')}
        {pick(b, setB, 'Compare (actual / later)')}
      </div>
      {result ? (
        <>
          <div className="card-body" style={{ borderBottom: '1px solid var(--border)' }}>
            <b>What changed:</b>{' '}
            {result.lines.filter((l) => l.status !== 'ok').length === 0 ? (
              <span className="muted">No change beyond ±{settings.minorTolerance} pp.</span>
            ) : (
              <span className="muted">
                {result.lines
                  .filter((l) => l.status !== 'ok')
                  .slice(0, 6)
                  .map((l) => describeLine(l, (k) => order.names[k] || k))
                  .join('; ')}
              </span>
            )}
          </div>
          <CompareTable result={result} baseLabel={A.short || A.label.split(' · ')[0]} actualLabel={B.short || B.label.split(' · ')[0]} names={order.names} />
        </>
      ) : (
        <Empty title="Pick two sources to compare" />
      )}
    </section>
  )
}

function CompositionHistory({ order }) {
  if (!order.compositions.length)
    return (
      <div className="card">
        <Notice kind="warn">
          No composition (costing_response) is linked to this order. Linking uses Order Receipt Id, then DO + product (+ party).
        </Notice>
      </div>
    )
  return (
    <div className="stack">
      {[...order.compositions].reverse().map((c) => {
        const used = order.batches.filter((b) => b.standard?.id === c.id)
        return (
          <section className="card" key={c.id}>
            <div className="card-head">
              <div className="row">
                <h3>
                  {c.no} <span className="faint">· revision {c.revision}</span>
                </h3>
                <Badge tone={c.status === 'Management Approved' ? 'ok' : 'info'}>{c.status || 'Draft'}</Badge>
              </div>
              <span className="faint" style={{ fontSize: 12 }}>
                created {fmtDate(c.date)} · standard for {used.length} batch{used.length === 1 ? '' : 'es'}
                {used.length > 0 && ` (B${used[0].seq}–B${used[used.length - 1].seq})`}
              </span>
            </div>
            <div className="card-body">
              <div className="row" style={{ gap: 6 }}>
                {c.items.map((it) => (
                  <Badge key={it.key}>
                    {it.name} · {it.value}%
                  </Badge>
                ))}
              </div>
              <div className="faint" style={{ fontSize: 12, marginTop: 8 }}>
                Σ {c.totalPct.toFixed(1)}%{c.alumina !== null && ` · Al₂O₃ ${fmtNum(c.alumina)}`}
                {c.iron !== null && ` · Fe₂O₃ ${fmtNum(c.iron)}`}
                {c.variableCost !== null && ` · Variable cost ${fmtInr(c.variableCost)}`}
              </div>
            </div>
            {c.vsPrev && (
              <>
                <div className="card-head" style={{ borderTop: '1px solid var(--border)' }}>
                  <h3 className="muted">Changes vs previous revision</h3>
                </div>
                <CompareTable result={c.vsPrev} baseLabel="Previous" actualLabel={c.no} names={order.names} />
              </>
            )}
          </section>
        )
      })}
    </div>
  )
}
