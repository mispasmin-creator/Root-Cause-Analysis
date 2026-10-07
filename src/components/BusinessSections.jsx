// Business sections of the Dashboard. Numbers come from aggregateBusiness() in lib/rca.js — no maths here.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { fmtDate, fmtInr, fmtNum } from '../lib/format.js'
import { firmLabel } from '../lib/normalize.js'
import { Badge, Empty, Kpi, Notice } from './ui.jsx'
import Pagination from './Pagination.jsx'
import { usePagination } from '../lib/pagination.js'

/** ₹ in lakh / crore for headline numbers: ₹9.89 Cr, ₹57.0 L */
const fmtMoney = (v) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  const a = Math.abs(v)
  const sign = v < 0 ? '−' : ''
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(2)} Cr`
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(1)} L`
  return `${sign}${fmtInr(a)}`
}
const pct = (v, d = 1) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : `${v.toFixed(d)}%`)
const marginColor = (m) => (m === null ? undefined : m < 0 ? 'var(--major)' : m < 10 ? 'var(--minor)' : 'var(--ok)')
const orderLink = (o) => `/orders/${encodeURIComponent(o.key)}`

function Bar({ value, max = 100, color }) {
  const w = max > 0 ? Math.max(0, Math.min(100, (Math.abs(value) / max) * 100)) : 0
  return (
    <div className="progress" style={{ flex: 1 }}>
      <span style={{ width: `${w}%`, background: color }} />
    </div>
  )
}

function SectionTitle({ children, sub }) {
  return (
    <div style={{ margin: '8px 0 -4px' }}>
      <h2 style={{ margin: 0, fontSize: 17 }}>{children}</h2>
      {sub && <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------------------------

export function ProfitSection({ biz }) {
  const p = biz.profit
  const dq = biz.dataQuality
  return (
    <>
      <SectionTitle sub={`${fmtNum(p.batches, 0)} batches · ${fmtNum(p.fg, 0)} MT with sales value. ${dq.costErrors.length} batches with impossible cost kept out (see Data quality).`}>
        Profit & loss
      </SectionTitle>
      <div className="grid grid-kpi">
        <Kpi label="Sales value" value={fmtMoney(p.sales)} sub="product rate × FG produced" />
        <Kpi label="Expected profit" value={fmtMoney(p.expProfit)} sub={`if composition was followed · ${pct(p.expMargin)}`} />
        <Kpi label="Actual profit" value={fmtMoney(p.actProfit)} sub={`margin ${pct(p.margin)} · after RM + mfg cost`} tone={p.actProfit < 0 ? 'major' : 'ok'} />
        <Kpi
          label="Lost to deviation"
          value={fmtMoney(p.deviationImpact)}
          sub="actual − expected profit (extra RM cost)"
          tone={p.deviationImpact < 0 ? 'major' : 'ok'}
        />
        <Kpi
          label="Final costing margin"
          value={pct(p.costing.margin)}
          sub={`${fmtMoney(p.costing.profit)} · Costing stage, ${fmtNum(p.costing.batches, 0)} batches`}
          tone={p.costing.margin < 10 ? 'minor' : 'ok'}
        />
        <Kpi
          label="Loss-making batches"
          value={fmtNum(biz.lossTotal.batches, 0)}
          sub={`${fmtMoney(biz.lossTotal.amount)} · ${biz.lossOrders.length} orders`}
          tone={biz.lossTotal.batches ? 'major' : 'ok'}
        />
      </div>

      <section className="card">
        <div className="card-head">
          <h2>Does deviation cost money?</h2>
          <span className="faint" style={{ fontSize: 12 }}>
            extra raw-material cost vs composition, by batch status
          </span>
        </div>
        <div className="card-body grid grid-kpi" style={{ gap: 12 }}>
          {[
            ['ok', 'Composition followed'],
            ['minor', 'Minor deviation'],
            ['major', 'Major deviation'],
          ].map(([k, label]) => {
            const s = p.bySeverity[k]
            return (
              <div key={k} style={{ borderLeft: `3px solid var(--${k})`, paddingLeft: 12 }}>
                <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>
                  {label} · {fmtNum(s.batches, 0)} batches
                </div>
                <div className="num" style={{ fontSize: 20, fontWeight: 700, color: s.extraRm > 0 ? 'var(--major)' : 'var(--ok)' }}>
                  {s.extraRm > 0 ? '+' : ''}
                  {fmtMoney(s.extraRm)}
                </div>
                <div className="faint" style={{ fontSize: 12 }}>{s.extraPct === null ? '—' : `${s.extraPct > 0 ? '+' : ''}${s.extraPct.toFixed(2)}% RM cost`}</div>
              </div>
            )
          })}
        </div>
      </section>

      <div className="grid grid-2">
        <LossOrders biz={biz} />
        <ProductMargins biz={biz} />
      </div>
    </>
  )
}

function LossOrders({ biz }) {
  const list = biz.lossOrders.slice(0, 10)
  return (
    <section className="card">
      <div className="card-head">
        <h2>Loss-making orders</h2>
        <span className="faint" style={{ fontSize: 12 }}>
          batches where RM + mfg cost &gt; sales value
        </span>
      </div>
      {list.length === 0 ? (
        <Empty title="No loss-making batches" />
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Order</th>
                <th>Product</th>
                <th className="r">Loss batches</th>
                <th className="r">Loss</th>
                <th className="r">Order margin</th>
              </tr>
            </thead>
            <tbody>
              {list.map((e) => (
                <tr key={e.order.key}>
                  <td className="nowrap">
                    <Link to={`${orderLink(e.order)}?tab=cost`} style={{ color: 'var(--brand)', fontWeight: 600 }}>
                      {e.order.doNo}
                    </Link>{' '}
                    <Badge>{firmLabel(e.order.firm)}</Badge>
                  </td>
                  <td className="truncate" style={{ maxWidth: 170 }} title={e.order.product}>
                    {e.order.product}
                  </td>
                  <td className="r num">
                    {e.lossBatches}/{e.batches}
                  </td>
                  <td className="r num nowrap" style={{ color: 'var(--major)', fontWeight: 600 }}>
                    {fmtMoney(e.loss)}
                  </td>
                  <td className="r num" style={{ color: marginColor((e.profit / e.sales) * 100) }}>
                    {pct((e.profit / e.sales) * 100)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function ProductMargins({ biz }) {
  const [view, setView] = useState('low')
  const eligible = biz.products.filter((p) => p.batches >= 5)
  const list = view === 'low' ? eligible.slice(0, 10) : [...eligible].reverse().slice(0, 10)
  const max = Math.max(1, ...eligible.map((p) => Math.abs(p.margin)))
  return (
    <section className="card">
      <div className="card-head">
        <h2>Product margin</h2>
        <div className="seg">
          <button className={view === 'low' ? 'on' : ''} onClick={() => setView('low')} type="button">
            Lowest
          </button>
          <button className={view === 'high' ? 'on' : ''} onClick={() => setView('high')} type="button">
            Highest
          </button>
        </div>
      </div>
      {list.length === 0 ? (
        <Empty title="Not enough batches" />
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Product</th>
                <th className="r">Batches</th>
                <th className="r">Profit</th>
                <th style={{ minWidth: 150 }}>Margin</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.product}>
                  <td className="truncate" style={{ maxWidth: 190 }} title={p.product}>
                    {p.product}
                  </td>
                  <td className="r num">{p.batches}</td>
                  <td className="r num nowrap" style={{ color: p.profit < 0 ? 'var(--major)' : undefined }}>
                    {fmtMoney(p.profit)}
                  </td>
                  <td>
                    <div className="row" style={{ flexWrap: 'nowrap' }}>
                      <Bar value={p.margin} max={max} color={marginColor(p.margin)} />
                      <span className="num" style={{ fontSize: 12, width: 48, textAlign: 'right', color: marginColor(p.margin), fontWeight: 600 }}>
                        {pct(p.margin)}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="faint" style={{ padding: '8px 16px', fontSize: 12, borderTop: '1px solid var(--border)' }}>
        Products with ≥ 5 batches · margin = (sales − RM − mfg) ÷ sales
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------------------------

export function QualitySection({ biz }) {
  const lab = biz.lab
  const props = [...lab.props].sort((a, b) => a.rate - b.rate)
  const months = biz.months.filter((m) => m.batches >= 5)
  return (
    <>
      <SectionTitle sub="Lab result vs the target set while creating the composition, and how things move month by month.">Quality & trend</SectionTitle>
      <div className="grid grid-2">
        <section className="card">
          <div className="card-head">
            <h2>Lab quality</h2>
            <Badge tone={lab.rate >= 70 ? 'ok' : lab.rate >= 50 ? 'minor' : 'major'}>
              {fmtNum(lab.ok, 0)}/{fmtNum(lab.checks, 0)} results on target ({pct(lab.rate, 0)})
            </Badge>
          </div>
          <div className="card-body" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="muted" style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
              Lab results on target when the batch…
            </div>
            <div className="grid grid-kpi" style={{ gap: 12 }}>
              <div style={{ borderLeft: '3px solid var(--ok)', paddingLeft: 12 }}>
                <div className="muted" style={{ fontSize: 12 }}>followed composition ({fmtNum(lab.mixOk.batches, 0)} batches)</div>
                <div className="num" style={{ fontSize: 22, fontWeight: 700, color: 'var(--ok)' }}>
                  {pct(lab.mixOk.rate, 0)}
                </div>
              </div>
              <div style={{ borderLeft: '3px solid var(--major)', paddingLeft: 12 }}>
                <div className="muted" style={{ fontSize: 12 }}>had major deviation ({fmtNum(lab.mixMajor.batches, 0)} batches)</div>
                <div className="num" style={{ fontSize: 22, fontWeight: 700, color: 'var(--major)' }}>
                  {pct(lab.mixMajor.rate, 0)}
                </div>
              </div>
            </div>
          </div>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Test</th>
                  <th className="r">Results</th>
                  <th style={{ minWidth: 150 }}>On target</th>
                </tr>
              </thead>
              <tbody>
                {props.map((p) => (
                  <tr key={p.key}>
                    <td style={{ fontWeight: 600 }}>{p.label}</td>
                    <td className="r num">{fmtNum(p.checks, 0)}</td>
                    <td>
                      <div className="row" style={{ flexWrap: 'nowrap' }}>
                        <Bar value={p.rate} color={p.rate >= 70 ? 'var(--ok)' : p.rate >= 40 ? 'var(--minor)' : 'var(--major)'} />
                        <span className="num" style={{ fontSize: 12, width: 38, textAlign: 'right' }}>
                          {pct(p.rate, 0)}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Monthly trend</h2>
            <span className="faint" style={{ fontSize: 12 }}>
              by production date · months with ≥ 5 batches
            </span>
          </div>
          {months.length === 0 ? (
            <Empty title="No production yet" />
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th className="r">Batches</th>
                    <th className="r">FG (MT)</th>
                    <th style={{ minWidth: 130 }}>Followed composition</th>
                    <th className="r">Avg shift</th>
                    <th className="r">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((m) => (
                    <tr key={m.month}>
                      <td className="nowrap" style={{ fontWeight: 600 }}>
                        {new Date(`${m.month}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                      </td>
                      <td className="r num">{m.batches}</td>
                      <td className="r num">{fmtNum(m.fg, 0)}</td>
                      <td>
                        <div className="row" style={{ flexWrap: 'nowrap' }}>
                          <Bar value={m.okRate ?? 0} color={m.okRate >= 50 ? 'var(--ok)' : m.okRate >= 25 ? 'var(--minor)' : 'var(--major)'} />
                          <span className="num" style={{ fontSize: 12, width: 34, textAlign: 'right' }}>
                            {pct(m.okRate, 0)}
                          </span>
                        </div>
                      </td>
                      <td className="r num">{pct(m.avgShift)}</td>
                      <td className="r num" style={{ color: marginColor(m.margin) }}>
                        {pct(m.margin)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------------------------

function PeopleTable({ title, sub, rows, nameFmt = (n) => n }) {
  return (
    <section className="card">
      <div className="card-head">
        <h2>{title}</h2>
        <span className="faint" style={{ fontSize: 12 }}>
          {sub}
        </span>
      </div>
      {rows.length === 0 ? (
        <Empty title="No data" />
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Name</th>
                <th className="r">Batches</th>
                <th className="r">FG (MT)</th>
                <th style={{ minWidth: 140 }}>Major deviation</th>
                <th className="r">Avg shift</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name}>
                  <td style={{ fontWeight: 600 }}>{nameFmt(r.name)}</td>
                  <td className="r num">{r.batches}</td>
                  <td className="r num">{fmtNum(r.fg, 0)}</td>
                  <td>
                    <div className="row" style={{ flexWrap: 'nowrap' }}>
                      <Bar value={r.majorRate ?? 0} color={r.majorRate > 80 ? 'var(--major)' : r.majorRate > 60 ? 'var(--minor)' : 'var(--ok)'} />
                      <span className="num" style={{ fontSize: 12, width: 34, textAlign: 'right' }}>
                        {pct(r.majorRate, 0)}
                      </span>
                    </div>
                  </td>
                  <td className="r num">{pct(r.avgShift)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export function PeopleSection({ biz }) {
  return (
    <>
      <SectionTitle sub="Who and where composition is followed least. Lower major % is better.">Supervisor & firm</SectionTitle>
      <div className="grid grid-2">
        <PeopleTable title="Supervisor-wise" sub="supervisors with ≥ 20 batches" rows={biz.supervisors.filter((s) => s.batches >= 20)} />
        <PeopleTable title="Firm-wise" sub="all batches" rows={biz.firms} nameFmt={firmLabel} />
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------------------------

export function OpsSection({ biz }) {
  const d = biz.delivery
  const q = biz.dataQuality
  const [showErrors, setShowErrors] = useState(false)
  // two independent tables on the Dashboard → own URL keys (?dpage / ?epage)
  const dpg = usePagination(d.overdueList.length, 'd')
  const epg = usePagination(q.costErrors.length, 'e')
  return (
    <>
      <SectionTitle sub="Orders still to be produced, and data problems that make the numbers above less reliable.">Delivery & data quality</SectionTitle>
      <div className="grid grid-2">
        <section className="card">
          <div className="card-head">
            <h2>Delivery pending</h2>
            <div className="row">
              <Badge>
                {d.open} orders · {fmtNum(d.pendingMt, 0)} MT to make
              </Badge>
              <Badge tone={d.overdue ? 'major' : 'ok'}>
                {d.overdue} overdue · {fmtNum(d.overdueMt, 0)} MT
              </Badge>
            </div>
          </div>
          {d.overdueList.length === 0 ? (
            <Empty title="Nothing overdue" />
          ) : (
            <div className="table-wrap" style={{ maxHeight: 420 }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Product</th>
                    <th className="r">Pending (MT)</th>
                    <th>Expected</th>
                    <th className="r">Late by</th>
                  </tr>
                </thead>
                <tbody>
                  {dpg.slice(d.overdueList).map((x) => (
                    <tr key={x.order.key}>
                      <td className="nowrap">
                        <Link to={orderLink(x.order)} style={{ color: 'var(--brand)', fontWeight: 600 }}>
                          {x.order.doNo}
                        </Link>{' '}
                        <Badge>{firmLabel(x.order.firm)}</Badge>
                      </td>
                      <td className="truncate" style={{ maxWidth: 120 }} title={x.order.product}>
                        {x.order.product}
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
          <Pagination pg={dpg} label="overdue orders" />
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Data quality</h2>
            <span className="faint" style={{ fontSize: 12 }}>
              fix these in Production-FMS
            </span>
          </div>
          <div>
            {[
              [q.costErrors.length, 'batches with impossible RM cost', 'saved cost > 3× or < ⅓ of composition cost — kept out of profit figures', 'major'],
              [q.kgEntries, 'batches with RM entered in kg', 'auto-converted to MT here; the saved cost in Production-FMS is too high', 'minor'],
              [q.noLabTarget, `of ${q.compositions} compositions have no lab target`, '“Expected WC / BD / CCS …” not filled → lab result can’t be matched', 'minor'],
              [q.notTested, `of ${q.batches} batches not lab-tested yet`, 'Lab Test 1 / 2 pending', 'info'],
              [q.noComposition, 'batches with no composition linked', 'deviation can’t be judged', 'info'],
            ].map(([n, label, hint, tone]) => (
              <div key={label} className="list-item" style={{ alignItems: 'flex-start' }}>
                <div className="num" style={{ fontSize: 20, fontWeight: 700, minWidth: 56, color: n ? `var(--${tone === 'info' ? 'info' : tone})` : 'var(--ok)' }}>
                  {fmtNum(n, 0)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{label}</div>
                  <div className="faint" style={{ fontSize: 12 }}>
                    {hint}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {q.costErrors.length > 0 && (
            <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-sm" onClick={() => setShowErrors((v) => !v)} type="button">
                {showErrors ? 'Hide' : 'Show'} impossible-cost batches
              </button>
            </div>
          )}
          {showErrors && (
            <>
            <div className="table-wrap" style={{ maxHeight: 360 }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Order · batch</th>
                    <th className="r">Composition cost</th>
                    <th className="r">Saved actual cost</th>
                    <th className="r">×</th>
                  </tr>
                </thead>
                <tbody>
                  {epg.slice(q.costErrors).map(({ b, o, expected, actual }) => (
                    <tr key={b.id}>
                      <td className="nowrap">
                        <Link to={`${orderLink(o)}?tab=cost`} style={{ color: 'var(--brand)', fontWeight: 600 }}>
                          {o.doNo}
                        </Link>{' '}
                        · {b.jobCard} <span className="faint">{o.product}</span>
                      </td>
                      <td className="r num">{fmtInr(expected)}</td>
                      <td className="r num" style={{ color: 'var(--major)' }}>
                        {fmtInr(actual)}
                      </td>
                      <td className="r num">{(actual / expected).toFixed(actual / expected < 1 ? 2 : 0)}×</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination pg={epg} label="batches" />
            </>
          )}
        </section>
      </div>
      <Notice kind="info">
        Sales value and manufacturing cost are what Production-FMS saved at production entry (product rate × FG, mfg cost/MT × FG). Raw-material
        cost uses the same KYC rates, with kg entries corrected. Final costing margin uses the ₹/MT approved in the Costing stage.
      </Notice>
    </>
  )
}
