import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useData } from '../context/DataContext.jsx'
import { analyseProduct, materialEffects, rndProducts, strength } from '../lib/rnd.js'
import { fmtDate, fmtInr, fmtNum, fmtPp } from '../lib/format.js'
import { firmLabel } from '../lib/normalize.js'
import { exportCsv } from '../lib/exportCsv.js'
import { Badge, Empty, Kpi, Notice } from '../components/ui.jsx'
import { IconBeaker, IconDownload } from '../components/Icons.jsx'
import PdfButton from '../components/PdfButton.jsx'

const pct = (v, d = 1) => (v === null || v === undefined ? '—' : `${v.toFixed(d)}%`)
const scoreTone = (s) => (s === null || s === undefined ? '' : s >= 75 ? 'ok' : s >= 50 ? 'minor' : 'major')
const orderLink = (o, b) => `/orders/${encodeURIComponent(o.key)}${b ? `?batch=${b.id}` : ''}`

/**
 * R&D insights — one product across all its orders: which batches came out best in the lab, how the mix of
 * good batches differs from weak ones, how often each lab test meets its target, which raw materials move a
 * lab result, and how each approved recipe version performed. Read-only; nothing is written anywhere.
 */
export default function RnD() {
  const { model } = useData()
  const [params, setParams] = useSearchParams()
  const firm = params.get('firm') || ''
  const setFilter = (key, value, clear = []) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    clear.forEach((k) => next.delete(k))
    setParams(next, { replace: true })
  }

  const firms = useMemo(
    () => [...new Set(model.orders.filter((o) => o.batches.length).map((o) => firmLabel(o.firm)))].filter((f) => f !== '—').sort(),
    [model],
  )
  const products = useMemo(() => rndProducts(model.orders, firm), [model, firm])
  const productKey = products.some((p) => p.key === params.get('product')) ? params.get('product') : products[0]?.key || ''
  const a = useMemo(() => (productKey ? analyseProduct(model.orders, productKey, firm) : null), [model, productKey, firm])

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>R&amp;D insights</h1>
          <p>Pick a product to see which recipes and batches work best in the lab, what good batches do differently, and what each raw material does to the result.</p>
        </div>
      </div>

      <section className="card">
        <div className="card-head" style={{ alignItems: 'flex-end' }}>
          <div className="field" style={{ minWidth: 180 }}>
            <label htmlFor="rnd-firm">Firm</label>
            <select id="rnd-firm" className="select" value={firm} onChange={(e) => setFilter('firm', e.target.value, ['product'])}>
              <option value="">All firms</option>
              {firms.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: 1, minWidth: 240 }}>
            <label htmlFor="rnd-product">Product</label>
            <select id="rnd-product" className="select" value={productKey} onChange={(e) => setFilter('product', e.target.value, ['lab'])}>
              {products.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name} ({p.batches} batches, {p.orders} orders)
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {!a ? (
        <div className="card">
          <Empty title="No products with batches" icon={IconBeaker} />
        </div>
      ) : (
        <ProductInsights a={a} labKey={params.get('lab') || ''} setLab={(v) => setFilter('lab', v)} productName={products.find((p) => p.key === productKey)?.name || ''} />
      )}
    </div>
  )
}

function ProductInsights({ a, labKey, setLab, productName }) {
  return (
    <>
      <div className="grid grid-kpi">
        <Kpi label="Batches" value={a.batches.length} sub={`${fmtNum(a.producedQty)} MT · ${a.orders.length} order${a.orders.length === 1 ? '' : 's'}`} />
        <Kpi label="Lab-checked batches" value={a.scored} sub={a.batches.length ? `${((a.scored / a.batches.length) * 100).toFixed(0)}% have tests with a target` : '—'} />
        <Kpi
          label="Tests within target"
          value={a.testsJudged ? pct((a.testsMet / a.testsJudged) * 100, 0) : '—'}
          sub={a.testsJudged ? `${a.testsMet} of ${a.testsJudged} lab tests` : 'no lab targets to judge'}
          tone={a.testsJudged ? scoreTone((a.testsMet / a.testsJudged) * 100) : undefined}
        />
        <Kpi label="Avg RM cost / MT" value={a.costMt !== null ? fmtInr(a.costMt) : '—'} sub={a.costMin !== null ? `range ${fmtInr(a.costMin)} – ${fmtInr(a.costMax)}` : 'no cost data'} />
        <Kpi label="Approved recipes" value={a.compositions} sub={a.latest ? `latest ${a.latest.no} · ${fmtDate(a.latest.date)}` : 'none linked'} />
      </div>

      <BestBatches a={a} />
      <GoodVsWeak a={a} productName={productName} />
      <LabPerformance a={a} />
      <MaterialEffects a={a} labKey={labKey} setLab={setLab} />
      <RecipeVersions a={a} />
    </>
  )
}

// ---------------------------------------------------------------------------------------------

function BestBatches({ a }) {
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h3>Best batches by lab result</h3>
          <div className="faint" style={{ fontSize: 12 }}>
            Ranked by lab score (share of lab tests inside the composition target), then cheaper RM cost. Use these as the reference mix.
          </div>
        </div>
        <PdfButton title="Best batches by lab result" />
      </div>
      {!a.best.length ? (
        <Empty title="No lab-checked batches">None of this product’s batches has a lab test with a target to judge against.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th className="c">#</th>
                <th>Batch</th>
                <th>Date</th>
                <th>Composition</th>
                <th>Lab score</th>
                <th className="r">RM cost / MT</th>
                <th className="r">Mix shift vs approved</th>
              </tr>
            </thead>
            <tbody>
              {a.best.map((x, i) => (
                <tr key={x.b.id}>
                  <td className="c">{i + 1}</td>
                  <td className="nowrap">
                    <Link className="chat-link" to={orderLink(x.o, x.b)}>
                      {x.o.doNo} · {x.b.jobCard}
                    </Link>
                  </td>
                  <td className="nowrap">{fmtDate(x.b.date)}</td>
                  <td className="nowrap">{x.b.standard?.no || <span className="faint">—</span>}</td>
                  <td className="nowrap">
                    <Badge tone={scoreTone(x.score)}>{x.score.toFixed(0)}%</Badge>{' '}
                    <span className="faint" style={{ fontSize: 12 }}>
                      {x.b.labCheck.checked - x.b.labCheck.out} of {x.b.labCheck.checked} tests
                    </span>
                  </td>
                  <td className="r num">{x.costMt !== null ? fmtInr(x.costMt) : <span className="faint">—</span>}</td>
                  <td className="r num">{x.b.vsStandard ? pct(x.b.vsStandard.shift) : <span className="faint">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function GoodVsWeak({ a, productName }) {
  const [all, setAll] = useState(false)
  const rows = all ? a.recipe : a.recipe.slice(0, 12)
  const doExport = () =>
    exportCsv(
      `rnd-good-vs-weak-${productName}.csv`.replace(/[^\w.-]+/g, '_'),
      a.recipe.map((r) => ({
        'Raw material': r.name,
        'Approved %': r.approved !== null ? r.approved.toFixed(2) : '',
        'Good batches avg %': r.passAvg !== null ? r.passAvg.toFixed(2) : '',
        'Weak batches avg %': r.failAvg !== null ? r.failAvg.toFixed(2) : '',
        'Weak - Good (pp)': r.delta !== null ? r.delta.toFixed(2) : '',
        'Good range low %': r.passLo !== null ? r.passLo.toFixed(2) : '',
        'Good range high %': r.passHi !== null ? r.passHi.toFixed(2) : '',
        'Used in batches': r.usedIn,
      })),
    )
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h3>What good batches do differently</h3>
          <div className="faint" style={{ fontSize: 12 }}>
            {a.split
              ? `Good = top 25 % of lab-checked batches (lab score ≥ ${a.hiCut.toFixed(0)}%, ${a.pass} batches) · Weak = bottom 25 % (≤ ${a.loCut.toFixed(0)}%, ${a.fail} batches). Average share of the mix, sorted by the biggest difference.`
              : 'Needs at least 4 lab-checked batches with different lab scores.'}
          </div>
        </div>
        <div className="row">
          <button className="btn btn-sm" onClick={doExport} disabled={!a.split}>
            <IconDownload /> CSV
          </button>
          <PdfButton title="What good batches do differently" />
        </div>
      </div>
      {!a.split ? (
        <Empty title="Not enough lab results to compare" icon={IconBeaker} />
      ) : (
        <>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Raw material</th>
                  <th className="r">Approved ({a.latest?.no || '—'})</th>
                  <th className="r">Good batches</th>
                  <th className="r">Weak batches</th>
                  <th className="r">Weak − Good</th>
                  <th className="r">Range in good batches</th>
                  <th>Reading</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const big = r.delta !== null && Math.abs(r.delta) >= 1
                  return (
                    <tr key={r.key}>
                      <td style={{ fontWeight: 600, minWidth: 150 }}>{r.name}</td>
                      <td className="r num">{r.approved ? pct(r.approved) : <span className="faint">—</span>}</td>
                      <td className="r num">{pct(r.passAvg)}</td>
                      <td className="r num">{pct(r.failAvg)}</td>
                      <td className="r num" style={{ fontWeight: 600, color: big ? (r.delta > 0 ? 'var(--major)' : 'var(--added)') : 'var(--text-2)' }}>
                        {r.delta !== null ? fmtPp(r.delta) : '—'}
                      </td>
                      <td className="r num nowrap">
                        {r.passUsed ? (
                          <>
                            {r.passLo.toFixed(1)} – {r.passHi.toFixed(1)}%
                            <span className="faint" style={{ fontSize: 11 }}>
                              {' '}
                              ({r.passUsed}/{a.pass})
                            </span>
                          </>
                        ) : (
                          <span className="faint">not used</span>
                        )}
                      </td>
                      <td className="muted" style={{ fontSize: 12 }}>
                        {!big ? 'Same in good and weak batches' : r.delta > 0 ? 'Weak batches use more — keep it lower' : 'Good batches use more — keep it higher'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {a.recipe.length > 12 && (
            <div style={{ padding: '8px 16px' }}>
              <button className="btn btn-sm" onClick={() => setAll((v) => !v)}>
                {all ? 'Show top 12' : `Show all ${a.recipe.length} materials`}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}

function LabPerformance({ a }) {
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h3>Lab tests — how often the target is met</h3>
          <div className="faint" style={{ fontSize: 12 }}>
            Each lab property across all batches of this product. “Mostly misses” shows whether results fall below or above the target.
          </div>
        </div>
        <PdfButton title="Lab tests — how often the target is met" />
      </div>
      {!a.lab.length ? (
        <Empty title="No lab results yet" icon={IconBeaker} />
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Lab test</th>
                <th>Usual target</th>
                <th className="r">Tested</th>
                <th style={{ minWidth: 160 }}>Within target</th>
                <th>Mostly misses</th>
                <th className="r">Average result</th>
                <th className="r">Lowest – highest</th>
              </tr>
            </thead>
            <tbody>
              {a.lab.map((l) => {
                const rate = l.judged ? (l.ok / l.judged) * 100 : null
                const miss = l.below > l.above ? `Below target (${l.below})` : l.above > l.below ? `Above target (${l.above})` : l.below ? `Both ways (${l.below} / ${l.above})` : null
                return (
                  <tr key={l.key}>
                    <td className="nowrap" style={{ fontWeight: 600 }}>{l.label}</td>
                    <td className="nowrap">{l.target || <span className="faint">no target</span>}</td>
                    <td className="r num">{l.tested}</td>
                    <td>
                      {rate === null ? (
                        <span className="faint">not judged</span>
                      ) : (
                        <div className="row" style={{ flexWrap: 'nowrap' }}>
                          <div className="progress" style={{ flex: 1 }}>
                            <span style={{ width: `${rate}%`, background: `var(--${scoreTone(rate)})` }} />
                          </div>
                          <span className="num" style={{ fontSize: 12, minWidth: 74, textAlign: 'right' }}>
                            {rate.toFixed(0)}% ({l.ok}/{l.judged})
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="nowrap">{miss ? <Badge tone={l.below > l.above ? 'minor' : 'major'}>{miss}</Badge> : <span className="faint">—</span>}</td>
                    <td className="r num">{l.avg !== null ? fmtNum(l.avg) : <span className="faint">—</span>}</td>
                    <td className="r num nowrap">{l.min !== null ? `${fmtNum(l.min)} – ${fmtNum(l.max)}` : <span className="faint">—</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function MaterialEffects({ a, labKey, setLab }) {
  const options = a.lab.filter((l) => l.kind !== 'text' && l.avg !== null)
  const key = options.some((l) => l.key === labKey) ? labKey : options[0]?.key || ''
  const eff = key ? materialEffects(a, key) : { rows: [], n: 0 }
  const label = options.find((l) => l.key === key)?.label || ''
  const rows = eff.rows.filter((r) => Math.abs(r.r) >= 0.2).slice(0, 10)

  return (
    <section className="card">
      <div className="card-head" style={{ alignItems: 'flex-end' }}>
        <div>
          <h3>Which raw material moves a lab result</h3>
          <div className="faint" style={{ fontSize: 12 }}>
            How a material’s share of the mix tracks the chosen lab result over {eff.n} batches. A pointer for trials — it shows a pattern, not proof.
          </div>
        </div>
        <div className="row">
          <select className="select" value={key} onChange={(e) => setLab(e.target.value)} aria-label="Lab test" disabled={!options.length}>
            {options.map((l) => (
              <option key={l.key} value={l.key}>
                {l.label}
              </option>
            ))}
          </select>
          <PdfButton title={`Which raw material moves ${label}`} />
        </div>
      </div>
      {!rows.length ? (
        <Empty title="No clear pattern" icon={IconBeaker}>
          {eff.n < 8 ? 'Needs lab results from at least 8 batches.' : `No raw material shows a clear link with ${label} for this product.`}
        </Empty>
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Raw material</th>
                <th style={{ minWidth: 180 }}>Effect on {label}</th>
                <th>Strength</th>
                <th>Reading</th>
                <th className="r">Used in</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const w = Math.abs(r.r) * 50
                return (
                  <tr key={r.key}>
                    <td style={{ fontWeight: 600, minWidth: 150 }}>{r.name}</td>
                    <td>
                      <div className="row" style={{ flexWrap: 'nowrap' }}>
                        <div style={{ position: 'relative', height: 10, flex: 1, background: 'var(--surface-2)', borderRadius: 3 }}>
                          <span style={{ position: 'absolute', left: '50%', top: -2, bottom: -2, width: 1, background: 'var(--border-strong)' }} />
                          <span
                            style={{
                              position: 'absolute',
                              top: 0,
                              bottom: 0,
                              borderRadius: 3,
                              width: `${w}%`,
                              left: r.r < 0 ? `${50 - w}%` : '50%',
                              background: r.r > 0 ? 'var(--added)' : 'var(--minor)',
                            }}
                          />
                        </div>
                        <span className="num" style={{ fontSize: 12, width: 42, textAlign: 'right' }}>
                          {r.r > 0 ? '+' : ''}
                          {r.r.toFixed(2)}
                        </span>
                      </div>
                    </td>
                    <td>
                      <Badge tone={Math.abs(r.r) >= 0.6 ? 'major' : Math.abs(r.r) >= 0.4 ? 'minor' : ''}>{strength(r.r)}</Badge>
                    </td>
                    <td className="muted" style={{ fontSize: 12 }}>
                      More {r.name} → {label} {r.r > 0 ? 'goes up' : 'goes down'}
                    </td>
                    <td className="r num">
                      {r.used}/{r.n}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function RecipeVersions({ a }) {
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h3>Recipe versions — how each approved composition performed</h3>
          <div className="faint" style={{ fontSize: 12 }}>
            Batches grouped by the approved composition they were made against. Best lab score first, then lower cost.
          </div>
        </div>
        <PdfButton title="Recipe versions" />
      </div>
      {!a.recipes.length ? (
        <Empty title="No batches" />
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Composition</th>
                <th>Order</th>
                <th>Created</th>
                <th className="r">Batches</th>
                <th className="r">Qty</th>
                <th>Avg lab score</th>
                <th className="r">Avg RM cost / MT</th>
                <th className="r">Avg mix shift</th>
              </tr>
            </thead>
            <tbody>
              {a.recipes.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }} className="nowrap">
                    {r.no}
                  </td>
                  <td className="nowrap">
                    <Link className="chat-link" to={orderLink(r.batches[0].o)}>
                      {r.doNo}
                    </Link>
                  </td>
                  <td className="nowrap">{fmtDate(r.date)}</td>
                  <td className="r num">{r.count}</td>
                  <td className="r num nowrap">{fmtNum(r.qty)} MT</td>
                  <td className="nowrap">
                    {r.score !== null ? (
                      <>
                        <Badge tone={scoreTone(r.score)}>{r.score.toFixed(0)}%</Badge>{' '}
                        <span className="faint" style={{ fontSize: 12 }}>
                          {r.judged} checked
                        </span>
                      </>
                    ) : (
                      <span className="faint">no lab target</span>
                    )}
                  </td>
                  <td className="r num">{r.costMt !== null ? fmtInr(r.costMt) : <span className="faint">—</span>}</td>
                  <td className="r num">{r.avgShift !== null ? pct(r.avgShift) : <span className="faint">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)' }}>
        <Notice kind="info">
          Lab score uses only tests whose composition has a target. RM cost leaves out batches whose saved cost is a data error (more than 3× or under ⅓ of the
          composition cost).
        </Notice>
      </div>
    </section>
  )
}
