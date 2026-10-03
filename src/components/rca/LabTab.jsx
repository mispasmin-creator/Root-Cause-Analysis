import { useMemo } from 'react'
import { summarizeLab } from '../../lib/rca.js'
import { fmtDate, fmtNum } from '../../lib/format.js'
import { Empty } from '../ui.jsx'
import { IconBeaker } from '../Icons.jsx'

const JUDGED = ['ok', 'minor', 'major']

/** "↓ 97 low" / "↑ 10 min high" — how far the result is outside the target */
const offText = (it) => {
  if (!it.diff) return null
  const v = Math.abs(it.diff)
  const unit = it.unit === 'min' ? ' min' : ''
  return `${it.diff > 0 ? '↑' : '↓'} ${fmtNum(v, v < 1 ? 2 : 1)}${unit} ${it.diff > 0 ? 'high' : 'low'}`
}

/**
 * Lab tab — ONE table answering: "the values I set when creating the composition — did the lab test match them?"
 * Rows = tests, first column = your target, then how many batches matched, then every batch's result.
 * All judging comes from batch.labCheck (rca.js compareLab).
 */
export default function LabTab({ order, onSelectBatch }) {
  const summary = useMemo(() => summarizeLab(order.batches), [order])
  const props = summary.filter((s) => s.tested > 0)
  const latest = order.compositions[order.compositions.length - 1]
  const latestItems = order.batches.find((b) => b.standard?.id === latest?.id)?.labCheck.items || order.batches[0]?.labCheck.items || []
  const targetOf = (key) => latestItems.find((i) => i.key === key)?.targetText || null

  const tested = order.batches.filter((b) => b.labCheck.tested)
  const judged = summary.reduce((s, p) => s + p.judged, 0)
  const matched = summary.reduce((s, p) => s + p.ok, 0)
  const anyTarget = props.some((p) => targetOf(p.key))

  if (!tested.length)
    return (
      <div className="card">
        <Empty title="No lab results yet" icon={IconBeaker}>
          Lab Test 1 / 2 have not recorded results for these batches.
        </Empty>
      </div>
    )

  return (
    <section className="card">
      <div className="card-head" style={{ alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <h3>Lab result vs your target</h3>
          <div className="muted" style={{ fontSize: 13, marginTop: 3 }}>
            <b>Your target</b> = values entered while creating composition {latest ? <b>{latest.no}</b> : ''}. Each batch shows its lab
            result: <span style={{ color: 'var(--ok)', fontWeight: 600 }}>✓ matched</span>, or how much it was{' '}
            <span style={{ color: 'var(--major)', fontWeight: 600 }}>low ↓ / high ↑</span>.
          </div>
        </div>
        <div className="row">
          <span className="badge">
            {tested.length}/{order.batches.length} batches tested
          </span>
          {judged > 0 && (
            <span className={`badge ${matched === judged ? 'b-ok' : matched / judged >= 0.5 ? 'b-minor' : 'b-major'}`}>
              {matched}/{judged} results matched ({((matched / judged) * 100).toFixed(0)}%)
            </span>
          )}
        </div>
      </div>

      {!anyTarget && (
        <div className="notice warn" style={{ margin: '12px 16px 0' }}>
          No target values were entered for {latest ? latest.no : 'this composition'}, so results can’t be matched. Fill “Expected …” values
          while creating the composition.
        </div>
      )}

      <div className="table-wrap" style={{ maxHeight: '72vh' }}>
        <table className="tbl matrix lab-grid">
          <thead>
            <tr>
              <th>Test</th>
              <th className="std-col" style={{ textAlign: 'left' }}>
                Your target
              </th>
              <th style={{ textAlign: 'left', minWidth: 120 }}>Matched</th>
              {order.batches.map((b) => (
                <th
                  key={b.id}
                  className="batch-col"
                  onClick={() => onSelectBatch(b)}
                  title={`${b.jobCard} · tested ${b.labCheck.tested ? fmtDate(b.raw.DateOfTest2 || b.raw.DateOfTest1 || b.date) : 'not yet'} — click for details`}
                >
                  B{b.seq}
                  <div className="faint" style={{ fontWeight: 500, fontSize: 10.5 }}>
                    {b.jobCard}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {props.map((p) => {
              const target = targetOf(p.key)
              const rate = p.judged ? (p.ok / p.judged) * 100 : null
              return (
                <tr key={p.key}>
                  <td style={{ fontWeight: 600 }}>{p.label}</td>
                  <td className="std-col nowrap" style={{ textAlign: 'left' }}>
                    {target || <span className="faint" style={{ fontWeight: 400 }}>not set</span>}
                  </td>
                  <td style={{ textAlign: 'left' }}>
                    {rate === null ? (
                      <span className="faint">—</span>
                    ) : (
                      <div title={`${p.ok} of ${p.judged} tested batches matched the target`}>
                        <div className="num" style={{ fontSize: 12, fontWeight: 600, color: rate === 100 ? 'var(--ok)' : rate >= 50 ? 'var(--minor)' : 'var(--major)' }}>
                          {p.ok}/{p.judged}
                        </div>
                        <div className="progress" style={{ marginTop: 3 }}>
                          <span style={{ width: `${rate}%`, background: rate === 100 ? 'var(--ok)' : rate >= 50 ? 'var(--minor)' : 'var(--major)' }} />
                        </div>
                      </div>
                    )}
                  </td>
                  {order.batches.map((b) => {
                    const it = b.labCheck.items.find((i) => i.key === p.key)
                    const raw = it?.actualText !== null && it?.actualText !== undefined ? String(it.actualText).trim() : ''
                    if (!raw)
                      return (
                        <td key={b.id} style={{ textAlign: 'center' }}>
                          <span className="cell blank" title="Not tested">
                            ·
                          </span>
                        </td>
                      )
                    const judgedCell = JUDGED.includes(it.status)
                    const cls = it.status === 'ok' ? 'match' : judgedCell ? it.status : 'blank'
                    return (
                      <td key={b.id} style={{ textAlign: 'center' }}>
                        <span
                          className={`cell ${cls}`}
                          title={`${p.label} · B${b.seq} (${b.jobCard})\nLab result: ${raw}\nYour target (${b.standard?.no || '—'}): ${it.targetText || 'not set'}\n${
                            it.status === 'ok' ? 'Matched ✓' : offText(it) || (judgedCell ? '' : 'Not compared')
                          }`}
                        >
                          {raw}
                          <small>{it.status === 'ok' ? '✓' : offText(it) || (it.status === 'notarget' ? 'no target' : it.status === 'major' && p.kind === 'text' ? '✗ not ok' : '')}</small>
                        </span>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
