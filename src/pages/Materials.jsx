import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useData } from '../context/DataContext.jsx'
import { aggregateMaterials } from '../lib/rca.js'
import { firmLabel } from '../lib/normalize.js'
import { exportCsv } from '../lib/exportCsv.js'
import { Badge, Empty } from '../components/ui.jsx'
import { IconDownload, IconSearch } from '../components/Icons.jsx'
import PdfButton from '../components/PdfButton.jsx'
import Pagination from '../components/Pagination.jsx'
import { usePagination } from '../lib/pagination.js'

const COLS = [
  { key: 'name', label: 'Raw material' },
  { key: 'batches', label: 'Batches', r: true },
  { key: 'deviationRate', label: 'Off-standard', r: false },
  { key: 'avgAbsDev', label: 'Avg |Δ| pp', r: true },
  { key: 'avgDev', label: 'Bias pp', r: true },
  { key: 'added', label: 'Used, not in std', r: true },
  { key: 'missing', label: 'Skipped', r: true },
]

/** Which raw materials drive deviation across all orders — the "where to look first" list. */
export default function Materials() {
  const { model } = useData()
  // Firm + Raw material filters (kept in the URL); raw material list follows the firm filter
  const [params, setParams] = useSearchParams()
  const firm = params.get('firm') || ''
  const rm = params.get('rm') || ''
  const setFilter = (key, value, clear = []) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    clear.forEach((k) => next.delete(k))
    next.delete('page') // filters changed → back to page 1
    setParams(next, { replace: true })
  }
  const withBatches = useMemo(() => model.orders.filter((o) => o.batches.length > 0), [model])
  const firms = useMemo(() => [...new Set(withBatches.map((o) => firmLabel(o.firm)))].filter((f) => f !== '—').sort(), [withBatches])
  // no firm → the app-wide list exactly as before; with a firm → recomputed from that firm's orders only
  const materials = useMemo(
    () => (firm ? aggregateMaterials(withBatches.filter((o) => firmLabel(o.firm) === firm)) : model.materials),
    [model, withBatches, firm],
  )
  const rmOptions = useMemo(() => [...materials].sort((a, b) => a.name.localeCompare(b.name)), [materials])
  const [q, setQ] = useState('')
  const [sort, setSort] = useState({ key: 'deviationRate', dir: -1 })
  const [minBatches, setMinBatches] = useState(3)

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return materials
      .filter((m) => !rm || m.key === rm)
      .filter((m) => m.batches >= minBatches)
      .filter((m) => !needle || m.name.toLowerCase().includes(needle) || m.products.some((p) => String(p).toLowerCase().includes(needle)))
      .sort((a, b) => {
        const x = a[sort.key]
        const y = b[sort.key]
        return (typeof x === 'string' ? x.localeCompare(y) : x - y) * sort.dir
      })
  }, [materials, rm, q, sort, minBatches])

  const pg = usePagination(rows.length)

  const head = (c) => (
    <th
      key={c.key}
      className={`sortable ${c.r ? 'r' : ''}`}
      onClick={() => {
        setSort((s) => ({ key: c.key, dir: s.key === c.key ? -s.dir : -1 }))
        pg.setPage(1)
      }}
      aria-sort={sort.key === c.key ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}
    >
      {c.label} {sort.key === c.key ? (sort.dir > 0 ? '▲' : '▼') : ''}
    </th>
  )

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Raw materials</h1>
          <p>
            How often each raw material is off its standard % across all batches. <b>Bias</b> &gt; 0 means it is usually over-used.
          </p>
        </div>
        <div className="row">
        <button
          className="btn"
          onClick={() =>
            exportCsv(
              'rca-materials.csv',
              rows.map((m) => ({
                Material: m.name,
                Batches: m.batches,
                'Off-standard %': m.deviationRate.toFixed(1),
                'Avg |dev| pp': m.avgAbsDev.toFixed(2),
                'Bias pp': m.avgDev.toFixed(2),
                'Used not in std': m.added,
                Skipped: m.missing,
                Products: m.products.join(' | '),
              })),
            )
          }
          disabled={!rows.length}
        >
          <IconDownload /> Export CSV
        </button>
        <PdfButton
          small={false}
          label="Export PDF"
          title="Raw materials"
          filename="rca-materials"
          disabled={!rows.length}
          subtitle={`${rows.length} materials`}
          filters={[['Firm', firm], ['Raw material', rmOptions.find((m) => m.key === rm)?.name || ''], ['Search', q], ['Min batches', minBatches]]}
          getData={() => ({
            head: ['Raw material', 'Batches', 'Off-standard %', 'Avg |d| pp', 'Bias pp', 'Used, not in std', 'Skipped', 'Products'],
            align: [undefined, 'right', 'right', 'right', 'right', 'right', 'right'],
            body: rows.map((m) => [m.name, m.batches, m.deviationRate.toFixed(1), m.avgAbsDev.toFixed(2), (m.avgDev > 0 ? '+' : '') + m.avgDev.toFixed(2), m.added, m.missing, m.products.join(', ')]),
          })}
        />
        </div>
      </div>
      <section className="card">
        <div className="card-head">
          <div className="search">
            <IconSearch />
            <input className="input" placeholder="Search material or product…" value={q} onChange={(e) => {
              setQ(e.target.value)
              pg.setPage(1)
            }} aria-label="Search materials" />
          </div>
          <div className="row">
            <select className="select" value={firm} onChange={(e) => setFilter('firm', e.target.value, ['rm'])} aria-label="Firm">
              <option value="">All firms</option>
              {firms.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
            <select className="select" value={rm} onChange={(e) => setFilter('rm', e.target.value)} aria-label="Raw material" style={{ maxWidth: 240 }}>
              <option value="">All raw materials</option>
              {rmOptions.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.name}
                </option>
              ))}
            </select>
            <label className="row muted" style={{ fontSize: 13 }}>
              Min batches
              <select className="select" value={minBatches} onChange={(e) => {
                setMinBatches(Number(e.target.value))
                pg.setPage(1)
              }}>
                {[1, 3, 5, 10, 25].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
        {rows.length === 0 ? (
          <Empty title="No materials match" />
        ) : (
          <div className="table-wrap" style={{ maxHeight: 640 }}>
            <table className="tbl">
              <thead>
                <tr>
                  {COLS.map(head)}
                  <th>Products</th>
                </tr>
              </thead>
              <tbody>
                {pg.slice(rows).map((m) => (
                  <tr key={m.key}>
                    <td style={{ fontWeight: 600 }}>{m.name}</td>
                    <td className="r num">{m.batches}</td>
                    <td style={{ minWidth: 140 }}>
                      <div className="row" style={{ flexWrap: 'nowrap' }}>
                        <div className="progress" style={{ flex: 1 }}>
                          <span style={{ width: `${m.deviationRate}%`, background: m.deviationRate > 50 ? 'var(--major)' : 'var(--minor)' }} />
                        </div>
                        <span className="num" style={{ fontSize: 12, width: 34, textAlign: 'right' }}>
                          {m.deviationRate.toFixed(0)}%
                        </span>
                      </div>
                    </td>
                    <td className="r num">{m.avgAbsDev.toFixed(2)}</td>
                    <td className="r num" style={{ color: Math.abs(m.avgDev) > 1 ? (m.avgDev > 0 ? 'var(--added)' : 'var(--major)') : undefined }}>
                      {m.avgDev > 0 ? '+' : ''}
                      {m.avgDev.toFixed(2)}
                    </td>
                    <td className="r num">{m.added || <span className="faint">0</span>}</td>
                    <td className="r num">{m.missing || <span className="faint">0</span>}</td>
                    <td>
                      <div className="row" style={{ gap: 4 }}>
                        {m.products.slice(0, 3).map((p) => (
                          <Badge key={p}>{p}</Badge>
                        ))}
                        {m.products.length > 3 && <span className="faint" style={{ fontSize: 12 }}>+{m.products.length - 3}</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination pg={pg} label="materials" />
      </section>
    </div>
  )
}
