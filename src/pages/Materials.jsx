import { useMemo, useState } from 'react'
import { useData } from '../context/DataContext.jsx'
import { exportCsv } from '../lib/exportCsv.js'
import { Badge, Empty } from '../components/ui.jsx'
import { IconDownload, IconSearch } from '../components/Icons.jsx'
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
  const [q, setQ] = useState('')
  const [sort, setSort] = useState({ key: 'deviationRate', dir: -1 })
  const [minBatches, setMinBatches] = useState(3)

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return model.materials
      .filter((m) => m.batches >= minBatches)
      .filter((m) => !needle || m.name.toLowerCase().includes(needle) || m.products.some((p) => String(p).toLowerCase().includes(needle)))
      .sort((a, b) => {
        const x = a[sort.key]
        const y = b[sort.key]
        return (typeof x === 'string' ? x.localeCompare(y) : x - y) * sort.dir
      })
  }, [model, q, sort, minBatches])

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
