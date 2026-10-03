import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '../context/DataContext.jsx'
import { fmtDate, fmtNum } from '../lib/format.js'
import { firmLabel } from '../lib/normalize.js'
import { Badge, Empty, Kpi, SevBar, SeverityBadge } from '../components/ui.jsx'
import { IconArrowRight } from '../components/Icons.jsx'

export default function Dashboard() {
  const { model, settings } = useData()
  const t = model.totals

  const attention = useMemo(
    () =>
      model.orders
        .filter((o) => o.batches.length && o.findings.some((f) => f.severity === 'critical'))
        .sort((a, b) => b.unreviewedMajor - a.unreviewedMajor || b.avgShift - a.avgShift)
        .slice(0, 8),
    [model],
  )

  const recent = useMemo(
    () =>
      model.orders
        .flatMap((o) => o.batches.filter((b) => b.severity === 'major').map((b) => ({ o, b })))
        .sort((x, y) => y.b.sortKey - x.b.sortKey || y.b.id - x.b.id)
        .slice(0, 8),
    [model],
  )

  const topMaterials = model.materials.filter((m) => m.batches >= 3).slice(0, 8)
  const pct = (n) => (t.judged ? `${((n / t.judged) * 100).toFixed(0)}%` : '—')

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Composition deviation overview</h1>
          <p>
            Every production batch compared with its approved composition. Tolerance ±{settings.minorTolerance} pp (minor) / ±
            {settings.majorTolerance} pp (major), basis: {settings.basis === 'mix' ? 'mix share' : '% of FG'}.
          </p>
        </div>
        <Link to="/orders" className="btn btn-primary">
          Open orders <IconArrowRight />
        </Link>
      </div>

      <div className="grid grid-kpi">
        <Kpi label="Orders in production" value={fmtNum(t.orders, 0)} sub={`${fmtNum(t.producedQty, 0)} MT produced`} />
        <Kpi label="Batches analysed" value={fmtNum(t.judged, 0)} sub={`${t.batches - t.judged} without composition`} />
        <Kpi label="Within tolerance" value={pct(t.ok)} sub={`${t.ok} batches`} tone="ok" />
        <Kpi label="Major deviation" value={pct(t.major)} sub={`${t.major} batches · ${t.minor} minor`} tone="major" />
        <Kpi label="Avg mix shift" value={`${t.avgShift.toFixed(1)}%`} sub="share of mix off-standard" />
        <Kpi label="Unreviewed major" value={fmtNum(t.unreviewedMajor, 0)} sub={`${t.revisedOrders} orders with revised composition`} tone={t.unreviewedMajor ? 'minor' : 'ok'} />
      </div>

      <div className="grid grid-2">
        <section className="card">
          <div className="card-head">
            <h2>Needs attention</h2>
            <span className="faint" style={{ fontSize: 12 }}>
              orders with critical findings
            </span>
          </div>
          {attention.length === 0 ? (
            <Empty title="No critical findings" />
          ) : (
            attention.map((o) => (
              <Link key={o.key} to={`/orders/${encodeURIComponent(o.key)}`} className="list-item">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="truncate" style={{ fontWeight: 600 }}>
                    {o.doNo} · {o.product}
                  </div>
                  <div className="faint truncate" style={{ fontSize: 12 }}>
                    {o.findings.find((f) => f.severity === 'critical')?.title}
                  </div>
                </div>
                <div style={{ width: 90 }}>
                  <SevBar counts={o.batchCounts} />
                </div>
                <Badge>{firmLabel(o.firm)}</Badge>
              </Link>
            ))
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Raw materials most often off-standard</h2>
            <Link to="/materials" className="btn btn-ghost btn-sm">
              All <IconArrowRight />
            </Link>
          </div>
          {topMaterials.length === 0 ? (
            <Empty title="Not enough batches yet" />
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Material</th>
                    <th className="r">Batches</th>
                    <th style={{ minWidth: 120 }}>Off-standard</th>
                    <th className="r">Avg |Δ|</th>
                  </tr>
                </thead>
                <tbody>
                  {topMaterials.map((m) => (
                    <tr key={m.key}>
                      <td className="truncate" style={{ maxWidth: 200 }}>
                        {m.name}
                      </td>
                      <td className="r num">{m.batches}</td>
                      <td>
                        <div className="row" style={{ flexWrap: 'nowrap' }}>
                          <div className="progress" style={{ flex: 1 }}>
                            <span style={{ width: `${m.deviationRate}%`, background: 'var(--major)' }} />
                          </div>
                          <span className="num" style={{ fontSize: 12, width: 34, textAlign: 'right' }}>
                            {m.deviationRate.toFixed(0)}%
                          </span>
                        </div>
                      </td>
                      <td className="r num">{m.avgAbsDev.toFixed(1)} pp</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>Latest batches with major deviation</h2>
        </div>
        {recent.length === 0 ? (
          <Empty title="No major deviations" />
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Order</th>
                  <th>Product</th>
                  <th>Batch</th>
                  <th className="r">FG (MT)</th>
                  <th className="r">Mix shift</th>
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
                      <td className="nowrap">
                        <Link to={`/orders/${encodeURIComponent(o.key)}?batch=${b.id}`} style={{ color: 'var(--brand)', fontWeight: 600 }}>
                          {o.doNo}
                        </Link>
                      </td>
                      <td className="truncate" style={{ maxWidth: 180 }}>
                        {o.product}
                      </td>
                      <td className="nowrap">
                        B{b.seq} · {b.jobCard}
                      </td>
                      <td className="r num">{b.fgQty}</td>
                      <td className="r num">{b.vsStandard.shift.toFixed(1)}%</td>
                      <td className="truncate" style={{ maxWidth: 240 }}>
                        {o.names[top.key]}{' '}
                        <span className="faint">
                          {top.status === 'added' ? 'added' : top.status === 'missing' ? 'skipped' : `${top.dev > 0 ? '+' : ''}${top.dev.toFixed(1)} pp`}
                        </span>
                      </td>
                      <td>{b.reviewed ? <Badge tone="brand">Reviewed</Badge> : <SeverityBadge severity="major" />}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
