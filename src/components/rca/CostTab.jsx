import { useMemo } from 'react'
import { summarizeCost } from '../../lib/rca.js'
import { fmtDate, fmtInr, fmtNum } from '../../lib/format.js'
import { Empty, Kpi, Notice } from '../ui.jsx'

const diffColor = (d) => (d > 0 ? 'var(--major)' : d < 0 ? 'var(--ok)' : undefined)
const signedInr = (d) => (d === null || !Number.isFinite(d) ? '—' : `${d > 0 ? '+' : d < 0 ? '−' : ''}${fmtInr(Math.abs(d))}`)
const signedPct = (d) => (d === null || !Number.isFinite(d) ? '—' : `${d > 0 ? '+' : ''}${d.toFixed(1)}%`)

/**
 * Cost tab — cost only (no selling price / profit).
 * Expected = composition % × RM rate × FG; Actual = RM actually used × rate (both saved by Production entry);
 * Final costing = ₹/MT from the Costing stage.
 */
export default function CostTab({ order, onSelectBatch }) {
  const s = useMemo(() => summarizeCost(order.batches), [order])

  if (!s.batches)
    return (
      <div className="card">
        <Empty title="No cost recorded">Production entries for these batches have no expected / actual cost.</Empty>
      </div>
    )

  return (
    <div className="stack">
      <div className="grid grid-kpi">
        <Kpi label="Expected RM cost" value={fmtInr(s.expected)} sub={`as per composition · ${fmtInr(s.expectedPerMt)}/MT`} />
        <Kpi label="Actual RM cost" value={fmtInr(s.actual)} sub={`as used · ${fmtInr(s.actualPerMt)}/MT`} />
        <Kpi
          label="Difference"
          value={signedInr(s.diff)}
          sub={`${signedPct(s.diffPct)} vs expected · ${s.diff > 0 ? 'costlier' : s.diff < 0 ? 'cheaper' : 'same'}`}
          tone={s.diff > 0 ? 'major' : s.diff < 0 ? 'ok' : undefined}
        />
        <Kpi
          label="Final costing"
          value={s.costingPerMt === null ? 'Pending' : `${fmtInr(s.costingPerMt)}/MT`}
          sub={`Costing stage · ${s.costedBatches} of ${order.batches.length} batches done`}
        />
      </div>

      <section className="card">
        <div className="card-head">
          <h3>Batch-wise cost</h3>
          <span className="faint" style={{ fontSize: 12 }}>
            red = costlier than composition · green = cheaper
          </span>
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Batch</th>
                <th>Date</th>
                <th className="r">FG (MT)</th>
                <th className="r">Expected RM cost</th>
                <th className="r">Actual RM cost</th>
                <th className="r">Difference</th>
                <th className="r">Diff %</th>
                <th className="r">Expected ₹/MT</th>
                <th className="r">Actual ₹/MT</th>
                <th className="r">Final costing ₹/MT</th>
              </tr>
            </thead>
            <tbody>
              {order.batches.map((b) => {
                const { expected, costingPerMt, kgExcess } = b.cost
                const actual = b.cost.actualCorrected ?? b.cost.actual
                const d = expected !== null && actual !== null ? actual - expected : null
                return (
                  <tr key={b.id} className="clickable" onClick={() => onSelectBatch(b)}>
                    <td className="nowrap" style={{ fontWeight: 600 }}>
                      B{b.seq} · {b.jobCard}
                    </td>
                    <td className="nowrap">{fmtDate(b.date)}</td>
                    <td className="r num">{fmtNum(b.fgQty)}</td>
                    <td className="r num">{fmtInr(expected)}</td>
                    <td className="r num nowrap">
                      {fmtInr(actual)}
                      {kgExcess > 0 && (
                        <span className="unit-tag" title={`Production-FMS saved ${fmtInr(b.cost.actual)} — kg entries priced as MT (${b.unitFixes.map((x) => x.name).join(", ")}). Corrected by ${fmtInr(kgExcess)}.`}>
                          kg fix
                        </span>
                      )}
                    </td>
                    <td className="r num nowrap" style={{ color: diffColor(d), fontWeight: 600 }}>
                      {signedInr(d)}
                    </td>
                    <td className="r num" style={{ color: diffColor(d) }}>
                      {d !== null && expected ? signedPct((d / expected) * 100) : '—'}
                    </td>
                    <td className="r num">{expected !== null && b.fgQty ? fmtInr(expected / b.fgQty) : '—'}</td>
                    <td className="r num">{actual !== null && b.fgQty ? fmtInr(actual / b.fgQty) : '—'}</td>
                    <td className="r num">{costingPerMt === null ? <span className="faint">pending</span> : fmtInr(costingPerMt)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td style={{ fontWeight: 600 }} colSpan={2}>
                  Total ({s.batches} batches)
                </td>
                <td className="r num" style={{ fontWeight: 600 }}>
                  {fmtNum(s.fg)}
                </td>
                <td className="r num" style={{ fontWeight: 600 }}>
                  {fmtInr(s.expected)}
                </td>
                <td className="r num" style={{ fontWeight: 600 }}>
                  {fmtInr(s.actual)}
                </td>
                <td className="r num nowrap" style={{ fontWeight: 700, color: diffColor(s.diff) }}>
                  {signedInr(s.diff)}
                </td>
                <td className="r num" style={{ fontWeight: 600, color: diffColor(s.diff) }}>
                  {signedPct(s.diffPct)}
                </td>
                <td className="r num" style={{ fontWeight: 600 }}>
                  {fmtInr(s.expectedPerMt)}
                </td>
                <td className="r num" style={{ fontWeight: 600 }}>
                  {fmtInr(s.actualPerMt)}
                </td>
                <td className="r num" style={{ fontWeight: 600 }}>
                  {s.costingPerMt === null ? '—' : fmtInr(s.costingPerMt)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {s.kgFixedBatches > 0 && (
        <Notice kind="warn">
          In {s.kgFixedBatches} batch{s.kgFixedBatches === 1 ? "" : "es"} an additive was entered in kg, so Production-FMS priced it as MT
          and saved an actual cost {fmtInr(s.kgExcess)} too high. The <b>kg fix</b> tag marks those batches; their actual cost here is
          corrected (same KYC rate, quantity ÷ 1000). Hover the tag to see the saved value.
        </Notice>
      )}

      <Notice kind="info">
        <b>Expected RM cost</b> = composition % × FG × RM rate, <b>Actual RM cost</b> = RM actually entered × rate (both calculated by
        Production-FMS at production entry, KYC rates). <b>Final costing</b> = ₹/MT approved in the Costing stage (RM + manufacturing).
      </Notice>
    </div>
  )
}
