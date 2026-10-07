import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useData } from '../context/DataContext.jsx'
import { fmtDate, fmtNum } from '../lib/format.js'
import { firmLabel } from '../lib/normalize.js'
import { exportCsv } from '../lib/exportCsv.js'
import { Badge, Empty, Progress, SevBar, SeverityBadge } from '../components/ui.jsx'
import { IconDownload, IconSearch } from '../components/Icons.jsx'
import Pagination from '../components/Pagination.jsx'
import { usePagination } from '../lib/pagination.js'

const SORTS = {
  recent: (a, b) => (b.lastBatchAt || 0) - (a.lastBatchAt || 0),
  shift: (a, b) => b.avgShift - a.avgShift,
  batches: (a, b) => b.batches.length - a.batches.length,
  unreviewed: (a, b) => b.unreviewedMajor - a.unreviewedMajor,
}

export default function Orders() {
  const { model } = useData()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') || ''
  const firm = params.get('firm') || ''
  const party = params.get('party') || ''
  const po = params.get('po') || ''
  const sev = params.get('sev') || ''
  // scope + sort dropdowns removed on user request — the list always shows orders with batches, latest batch first
  const scope = 'batches'
  const sort = 'recent'
  const [qInput, setQInput] = useState(q)

  const setParam = (k, v) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    next.delete('page') // filters changed → back to page 1
    setParams(next, { replace: true })
  }

  const firms = useMemo(() => [...new Set(model.orders.map((o) => firmLabel(o.firm)))].filter((f) => f !== '—').sort(), [model])
  // party list follows the firm filter so the dropdown stays short
  const parties = useMemo(
    () =>
      [...new Set(model.orders.filter((o) => !firm || firmLabel(o.firm) === firm).map((o) => String(o.party || '').trim()))]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
    [model, firm],
  )
  // PO list follows the firm + party filters (orders with batches only, same as the list)
  const pos = useMemo(
    () =>
      [
        ...new Set(
          model.orders
            .filter((o) => o.batches.length > 0)
            .filter((o) => !firm || firmLabel(o.firm) === firm)
            .filter((o) => !party || String(o.party || '').trim() === party)
            .map((o) => String(o.poNo || '').trim()),
        ),
      ]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [model, firm, party],
  )

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return model.orders
      .filter((o) => (scope === 'all' ? true : scope === 'revised' ? o.compositions.length > 1 : o.batches.length > 0))
      .filter((o) => !firm || firmLabel(o.firm) === firm)
      .filter((o) => !party || String(o.party || '').trim() === party)
      .filter((o) => !po || String(o.poNo || '').trim() === po)
      .filter((o) => !sev || o.severity === sev)
      .filter(
        (o) =>
          !needle ||
          [o.doNo, o.poNo, o.product, o.party, ...o.batches.map((b) => b.jobCard), ...o.compositions.map((c) => c.no)]
            .join(' ')
            .toLowerCase()
            .includes(needle),
      )
      .sort(SORTS[sort] || SORTS.recent)
  }, [model, q, firm, party, po, sev, scope, sort])

  const pg = usePagination(rows.length)

  const doExport = () =>
    exportCsv(
      'rca-orders.csv',
      rows.map((o) => ({
        DO: o.doNo,
        'PO No.': o.poNo || '',
        'PO Date': o.poDate ? fmtDate(o.poDate) : '',
        Product: o.product,
        Party: o.party,
        Firm: firmLabel(o.firm),
        'Order Qty (MT)': o.orderQty,
        'Produced (MT)': o.producedQty,
        Batches: o.batches.length,
        Compositions: o.compositions.map((c) => c.no).join(' → '),
        'OK batches': o.batchCounts.ok,
        'Minor batches': o.batchCounts.minor,
        'Major batches': o.batchCounts.major,
        'Avg mix shift %': o.avgShift.toFixed(2),
        'Top finding': o.findings[0]?.title || '',
      })),
    )

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Orders & batches</h1>
          <p>Production orders (from “For Production Planning”) with their batch-wise composition deviation.</p>
        </div>
        <button className="btn" onClick={doExport} disabled={!rows.length}>
          <IconDownload /> Export CSV
        </button>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="search">
            <IconSearch />
            <input
              className="input"
              placeholder="Search DO, PO, product, party, JC, CN…"
              value={qInput}
              onChange={(e) => {
                setQInput(e.target.value)
                setParam('q', e.target.value)
              }}
              aria-label="Search orders"
            />
          </div>
          <div className="row">
            <select
              className="select"
              value={firm}
              onChange={(e) => {
                // changing firm clears party + PO (they may not belong to the new firm)
                const next = new URLSearchParams(params)
                if (e.target.value) next.set('firm', e.target.value)
                else next.delete('firm')
                next.delete('party')
                next.delete('po')
                next.delete('page') // filters changed → back to page 1
    setParams(next, { replace: true })
              }}
              aria-label="Firm"
            >
              <option value="">All firms</option>
              {firms.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
            <select
              className="select"
              value={party}
              onChange={(e) => {
                // changing party clears the PO filter (the PO may not belong to the new party)
                const next = new URLSearchParams(params)
                if (e.target.value) next.set('party', e.target.value)
                else next.delete('party')
                next.delete('po')
                next.delete('page') // filters changed → back to page 1
    setParams(next, { replace: true })
              }}
              aria-label="Party"
              style={{ maxWidth: 240 }}
            >
              <option value="">All parties</option>
              {parties.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <select className="select" value={po} onChange={(e) => setParam('po', e.target.value)} aria-label="PO number" style={{ maxWidth: 200 }}>
              <option value="">All POs</option>
              {pos.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <select className="select" value={sev} onChange={(e) => setParam('sev', e.target.value)} aria-label="Severity">
              <option value="">Any status</option>
              <option value="major">Has major</option>
              <option value="minor">Minor only</option>
              <option value="ok">Within tolerance</option>
              <option value="none">No batches</option>
            </select>
          </div>
        </div>

        {rows.length === 0 ? (
          <Empty title="No orders match">Try clearing filters.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>DO</th>
                  <th>PO</th>
                  <th>Product</th>
                  <th>Party</th>
                  <th>Firm</th>
                  <th style={{ minWidth: 130 }}>Produced / Ordered</th>
                  <th className="r">Batches</th>
                  <th>Composition</th>
                  <th style={{ minWidth: 100 }}>Batch status</th>
                  <th className="r">Avg shift</th>
                  <th>Overall</th>
                </tr>
              </thead>
              <tbody>
                {pg.slice(rows).map((o) => (
                  <tr key={o.key} className="clickable" onClick={() => navigate(`/orders/${encodeURIComponent(o.key)}`)}>
                    <td className="nowrap" style={{ fontWeight: 600 }}>
                      {o.doNo}
                    </td>
                    <td className="nowrap" title={o.poDate ? `PO date ${fmtDate(o.poDate)}` : undefined}>
                      {o.poNo || <span className="faint">—</span>}
                    </td>
                    <td className="truncate" style={{ maxWidth: 200 }} title={o.product}>
                      {o.product}
                    </td>
                    <td className="truncate muted" style={{ maxWidth: 200 }} title={o.party}>
                      {o.party || '—'}
                    </td>
                    <td>
                      <Badge>{firmLabel(o.firm)}</Badge>
                    </td>
                    <td>
                      <div className="num" style={{ fontSize: 12 }}>
                        {fmtNum(o.producedQty)} / {o.orderQty ? fmtNum(o.orderQty) : '—'} MT
                      </div>
                      {o.orderQty > 0 && <Progress value={o.producedQty} max={o.orderQty} />}
                    </td>
                    <td className="r num">{o.batches.length}</td>
                    <td className="nowrap">
                      {o.compositions.length === 0 ? (
                        <Badge tone="warning">Not linked</Badge>
                      ) : (
                        <>
                          {o.compositions[o.compositions.length - 1].no}
                          {o.compositions.length > 1 && (
                            <Badge tone="info" title="Composition was revised">
                              {o.compositions.length} rev
                            </Badge>
                          )}
                        </>
                      )}
                    </td>
                    <td>
                      <SevBar counts={o.batchCounts} />
                    </td>
                    <td className="r num">{o.batches.length ? `${o.avgShift.toFixed(1)}%` : '—'}</td>
                    <td>
                      <SeverityBadge severity={o.severity} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination pg={pg} label="orders" />
        <div className="faint" style={{ padding: '10px 16px', fontSize: 12, borderTop: '1px solid var(--border)' }}>
          {rows.length} orders · last batch {fmtDate(rows[0]?.lastBatchAt || null)}
        </div>
      </div>
    </div>
  )
}
