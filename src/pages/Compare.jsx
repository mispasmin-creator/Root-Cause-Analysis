import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '../context/DataContext.jsx'
import { comparePercents, describeLine } from '../lib/rca.js'
import { fmtDate } from '../lib/format.js'
import { materialKey } from '../lib/normalize.js'
import CompareTable from '../components/rca/CompareTable.jsx'
import { Empty } from '../components/ui.jsx'

/**
 * Cross-order comparison: any two batches / compositions of the same product,
 * e.g. "Pasheat C batch for DO-592 vs the one for DO-621".
 */
export default function Compare() {
  const { model, settings } = useData()

  const products = useMemo(() => {
    const m = new Map()
    for (const o of model.orders) {
      if (!o.batches.length && !o.compositions.length) continue
      const k = materialKey(o.product)
      const e = m.get(k) || { key: k, name: o.product, orders: [], batches: 0 }
      e.orders.push(o)
      e.batches += o.batches.length
      m.set(k, e)
    }
    return [...m.values()].sort((a, b) => b.batches - a.batches)
  }, [model])

  const [productKey, setProductKey] = useState(products[0]?.key || '')
  const product = products.find((p) => p.key === productKey)

  const { sources, names } = useMemo(() => {
    const s = []
    const nm = {}
    for (const o of product?.orders || []) {
      Object.assign(nm, o.names)
      o.compositions.forEach((c) => s.push({ id: `c${c.id}-${o.key}`, group: o.doNo, label: `${o.doNo} · Standard ${c.no}`, percents: c.percents, order: o }))
      o.batches.forEach((b) =>
        s.push({
          id: `b${b.id}`,
          group: o.doNo,
          label: `${o.doNo} · B${b.seq} ${b.jobCard} · ${fmtDate(b.date)}`,
          percents: b.percents,
          order: o,
          batch: b,
          sortKey: b.sortKey,
        }),
      )
    }
    return { sources: s, names: nm }
  }, [product])

  const batchSources = sources.filter((s) => s.batch).sort((a, b) => a.sortKey - b.sortKey)
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const A = sources.find((s) => s.id === a) || batchSources[0] || sources[0]
  const B = sources.find((s) => s.id === b) || batchSources[batchSources.length - 1] || sources[1]
  const result = A && B && A !== B ? comparePercents(A.percents, B.percents, settings, names) : null

  const groups = [...new Set(sources.map((s) => s.group))]
  const select = (value, set, label) => (
    <div className="field" style={{ flex: 1, minWidth: 240 }}>
      <label>{label}</label>
      <select className="select" value={value?.id || ''} onChange={(e) => set(e.target.value)}>
        {groups.map((g) => (
          <optgroup key={g} label={g}>
            {sources
              .filter((s) => s.group === g)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
    </div>
  )

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Compare batches</h1>
          <p>Pick a product, then any two batches or compositions — across orders — to see exactly what changed.</p>
        </div>
      </div>

      <section className="card">
        <div className="card-head" style={{ alignItems: 'flex-end' }}>
          <div className="field" style={{ minWidth: 240 }}>
            <label>Product</label>
            <select
              className="select"
              value={productKey}
              onChange={(e) => {
                setProductKey(e.target.value)
                setA('')
                setB('')
              }}
            >
              {products.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name} ({p.batches} batches, {p.orders.length} orders)
                </option>
              ))}
            </select>
          </div>
          {sources.length > 1 && select(A, setA, 'Base')}
          {sources.length > 1 && select(B, setB, 'Compare')}
        </div>
        {!result ? (
          <Empty title="Need two different sources">This product has fewer than two batches/compositions, or both pickers point to the same one.</Empty>
        ) : (
          <>
            <div className="card-body" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="row" style={{ marginBottom: 6 }}>
                <Link className="btn btn-sm" to={`/orders/${encodeURIComponent(A.order.key)}${A.batch ? `?batch=${A.batch.id}` : ''}`}>
                  Open base
                </Link>
                <Link className="btn btn-sm" to={`/orders/${encodeURIComponent(B.order.key)}${B.batch ? `?batch=${B.batch.id}` : ''}`}>
                  Open compare
                </Link>
              </div>
              <b>What changed:</b>{' '}
              <span className="muted">
                {result.lines.filter((l) => l.status !== 'ok').length
                  ? result.lines
                      .filter((l) => l.status !== 'ok')
                      .slice(0, 8)
                      .map((l) => describeLine(l, (k) => names[k] || k))
                      .join('; ')
                  : `Nothing beyond ±${settings.minorTolerance} pp.`}
              </span>
            </div>
            <CompareTable result={result} baseLabel="Base" actualLabel="Compare" names={names} />
          </>
        )}
      </section>
    </div>
  )
}
