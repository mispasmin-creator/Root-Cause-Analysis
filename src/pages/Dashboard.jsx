import PdfButton from '../components/PdfButton.jsx'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '../context/DataContext.jsx'
import { fmtDate, fmtInr, fmtNum } from '../lib/format.js'
import { firmLabel } from '../lib/normalize.js'
import { Badge, Empty, Kpi } from '../components/ui.jsx'
import { IconArrowRight } from '../components/Icons.jsx'
import { aggregateBusiness } from '../lib/rca.js'

/** ₹ in lakh / crore for headline numbers: ₹9.89 Cr, ₹57.0 L */
const fmtMoney = (v) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  const a = Math.abs(v)
  const sign = v < 0 ? '−' : ''
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(2)} Cr`
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(1)} L`
  return `${sign}${fmtInr(a)}`
}
const pct = (v, d = 0) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : `${v.toFixed(d)}%`)
const orderLink = (o) => `/orders/${encodeURIComponent(o.key)}`

/**
 * Simple overview: six headline numbers, then the three lists that need action —
 * latest batches that broke the composition, overdue deliveries and loss-making orders.
 * Detail lives on the other pages (Orders, Raw Materials, R&D).
 */
export default function Dashboard() {
  const { model, status } = useData()
  const t = model.totals

  const recent = useMemo(
    () =>
      model.orders
        .flatMap((o) => o.batches.filter((b) => b.severity === 'major').map((b) => ({ o, b })))
        .sort((x, y) => y.b.sortKey - x.b.sortKey || y.b.id - x.b.id)
        .slice(0, 8),
    [model],
  )

  // "today" = last data sync, so overdue days match the data shown
  const syncedAt = status.loadedAt?.getTime() ?? 0
  const biz = useMemo(() => aggregateBusiness(model.orders, syncedAt), [model, syncedAt])
  const p = biz.profit
  const d = biz.delivery
  const overdue = [...d.overdueList].sort((a, b) => b.overdueDays - a.overdueDays).slice(0, 8)
  const losses = biz.lossOrders.slice(0, 5)

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>Is production following the approved composition, is it passing the lab, and is it making money.</p>
        </div>
        <Link to="/orders" className="btn btn-primary">
          Open orders <IconArrowRight />
        </Link>
      </div>

      <div className="grid grid-kpi">
        <Kpi label="Orders in production" value={fmtNum(t.orders, 0)} sub={`${fmtNum(t.batches, 0)} batches · ${fmtNum(t.producedQty, 0)} MT`} />
        <Kpi
          label="Followed composition"
          value={t.judged ? pct((t.ok / t.judged) * 100) : '—'}
          sub={`${fmtNum(t.ok, 0)} of ${fmtNum(t.judged, 0)} batches`}
          tone={!t.judged ? undefined : t.ok / t.judged >= 0.7 ? 'ok' : t.ok / t.judged >= 0.4 ? 'minor' : 'major'}
        />
        <Kpi
          label="Major deviation"
          value={fmtNum(t.major, 0)}
          sub={t.judged ? `${pct((t.major / t.judged) * 100)} of batches` : 'batches'}
          tone={t.major ? 'major' : 'ok'}
        />
        <Kpi
          label="Lab results on target"
          value={pct(biz.lab.rate)}
          sub={`${fmtNum(biz.lab.ok, 0)} of ${fmtNum(biz.lab.checks, 0)} results`}
          tone={biz.lab.rate >= 70 ? 'ok' : biz.lab.rate >= 50 ? 'minor' : 'major'}
        />
        <Kpi label="Profit" value={fmtMoney(p.actProfit)} sub={`margin ${pct(p.margin, 1)} on ${fmtMoney(p.sales)} sales`} tone={p.actProfit < 0 ? 'major' : 'ok'} />
        <Kpi label="Overdue deliveries" value={fmtNum(d.overdue, 0)} sub={`${fmtNum(d.overdueMt, 0)} MT still to make`} tone={d.overdue ? 'major' : 'ok'} />
      </div>

      <div className="grid grid-2">
        <section className="card">
          <div className="card-head">
            <h2>Latest batches with major deviation</h2>
            <PdfButton />
          </div>
          {recent.length === 0 ? (
            <Empty title="No major deviations" />
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Order · batch</th>
                    <th>Biggest change</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map(({ o, b }) => {
                    const top = b.vsStandard.lines[0]
                    return (
                      <tr key={b.id}>
                        <td className="nowrap">{fmtDate(b.date)}</td>
                        <td>
                          <Link to={`${orderLink(o)}?batch=${b.id}`} style={{ color: 'var(--brand)', fontWeight: 600 }} className="nowrap">
                            {o.doNo} · {b.jobCard}
                          </Link>
                          <div className="faint truncate" style={{ fontSize: 12, maxWidth: 200 }} title={o.product}>
                            {o.product}
                          </div>
                        </td>
                        <td className="truncate" style={{ maxWidth: 200 }}>
                          {o.names[top.key]}{' '}
                          <span className="faint">
                            {top.status === 'added' ? 'added' : top.status === 'missing' ? 'skipped' : `${top.dev > 0 ? '+' : ''}${top.dev.toFixed(1)} pp`}
                          </span>
                        </td>
                        <td>{b.reviewed ? <Badge tone="brand">Reviewed</Badge> : <Badge tone="major">To review</Badge>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Overdue deliveries</h2>
            <span className="faint" style={{ fontSize: 12 }}>
              most late first
            </span>
            <PdfButton />
          </div>
          {overdue.length === 0 ? (
            <Empty title="Nothing overdue" />
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th className="r">Pending (MT)</th>
                    <th>Expected</th>
                    <th className="r">Late by</th>
                  </tr>
                </thead>
                <tbody>
                  {overdue.map((x) => (
                    <tr key={x.order.key}>
                      <td>
                        <Link to={orderLink(x.order)} style={{ color: 'var(--brand)', fontWeight: 600 }} className="nowrap">
                          {x.order.doNo}
                        </Link>{' '}
                        <Badge>{firmLabel(x.order.firm)}</Badge>
                        <div className="faint truncate" style={{ fontSize: 12, maxWidth: 200 }} title={x.order.product}>
                          {x.order.product}
                        </div>
                      </td>
                      <td className="r num">
                        {fmtNum(x.pending, 0)} <span className="faint">/ {fmtNum(x.order.orderQty, 0)}</span>
                      </td>
                      <td className="nowrap">{fmtDate(x.due)}</td>
                      <td className="r num nowrap" style={{ color: 'var(--major)', fontWeight: 600 }}>
                        {x.overdueDays} d
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {d.overdue > overdue.length && (
            <div className="faint" style={{ padding: '8px 16px', fontSize: 12, borderTop: '1px solid var(--border)' }}>
              Showing the {overdue.length} most late of {d.overdue} overdue orders.
            </div>
          )}
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>Loss-making orders</h2>
          <span className="faint" style={{ fontSize: 12 }}>
            raw material + manufacturing cost higher than sales value
          </span>
          <PdfButton />
        </div>
        {losses.length === 0 ? (
          <Empty title="No loss-making orders" />
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Product</th>
                  <th className="r">Loss batches</th>
                  <th className="r">Loss</th>
                </tr>
              </thead>
              <tbody>
                {losses.map((e) => (
                  <tr key={e.order.key}>
                    <td className="nowrap">
                      <Link to={`${orderLink(e.order)}?tab=cost`} style={{ color: 'var(--brand)', fontWeight: 600 }}>
                        {e.order.doNo}
                      </Link>{' '}
                      <Badge>{firmLabel(e.order.firm)}</Badge>
                    </td>
                    <td className="truncate" style={{ maxWidth: 240 }} title={e.order.product}>
                      {e.order.product}
                    </td>
                    <td className="r num">
                      {e.lossBatches} of {e.batches}
                    </td>
                    <td className="r num nowrap" style={{ color: 'var(--major)', fontWeight: 600 }}>
                      {fmtMoney(e.loss)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
