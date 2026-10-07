import { useState } from 'react'
import { fmtDate } from '../../lib/format.js'
import { SEVERITY_LABEL } from '../../lib/constants.js'
import { Segmented } from '../ui.jsx'

/**
 * Core RCA view: raw materials (rows) × batches (columns).
 * Each cell is coloured by how far that batch's % is from the batch's own standard composition.
 */
export default function BatchMatrix({ order, onSelectBatch, selectedId }) {
  const [mode, setMode] = useState('actual')
  // grouped view first, like the plant sheet; "By batch" still available
  const [view, setView] = useState(order.groups?.length ? 'group' : 'batch')
  // "By group": one column per production group (batches with the same mix), as on the production sheet
  const groupCols = (order.groups || []).map((g) => ({
    ...g.batches[0],
    id: g.id,
    label: g.label,
    sub: `${g.batches.length} JC · ${g.qty} MT`,
    title: `${g.jobCards.join(' / ')} — ${g.qty} MT`,
    fgQty: g.qty,
    open: g.batches[0],
  }))
  const cols = view === 'group' ? groupCols : order.batches
  const latest = order.compositions[order.compositions.length - 1]
  const lineFor = (b, k) => b.vsStandard?.lines.find((l) => l.key === k)

  return (
    <div>
      <div className="row" style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: 'group', label: 'By composition' },
            { value: 'batch', label: 'By batch' },
          ]}
        />
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'actual', label: 'Actual %' },
            { value: 'dev', label: 'Deviation (pp)' },
          ]}
        />
        <span className="spacer" />
        <div className="legend">
          <span>
            <i style={{ background: 'var(--minor-bg)', border: '1px solid var(--minor)' }} />
            Minor
          </span>
          <span>
            <i style={{ background: 'var(--major-bg)', border: '1px solid var(--major)' }} />
            Major
          </span>
          <span>
            <i style={{ background: 'var(--added-bg)', border: '1px solid var(--added)' }} />
            Not in composition
          </span>
          <span>
            <i style={{ background: 'repeating-linear-gradient(135deg, var(--major-bg) 0 3px, transparent 3px 6px)', border: '1px solid var(--major)' }} />
            Skipped
          </span>
        </div>
      </div>
      <div className="table-wrap" style={{ maxHeight: '72vh' }}>
        <table className="tbl matrix">
          <thead>
            <tr>
              <th>Raw material</th>
              {latest && (
                <th className="std-col" title={`Latest composition ${latest.no}`}>
                  Std {latest.no}
                </th>
              )}
              {cols.map((b) => (
                <th
                  key={b.id}
                  className={`batch-col ${selectedId === b.id ? 'sel' : ''}`}
                  onClick={() => onSelectBatch(b.open || b)}
                  title={b.title || `${b.jobCard} · ${fmtDate(b.date)} · ${b.fgQty} MT — click for details`}
                >
                  {b.label || `B${b.seq}`}
                  <div className="faint" style={{ fontWeight: 500, fontSize: 10.5 }}>
                    {b.sub || b.jobCard}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {order.materialKeys.map((k) => (
              <tr key={k}>
                <td className="truncate" title={order.names[k]}>
                  {order.names[k]}
                </td>
                {latest && (
                  <td className="std-col">{latest.percents[k] > 0 ? latest.percents[k].toFixed(latest.percents[k] < 1 ? 2 : 1) : <span className="faint">—</span>}</td>
                )}
                {cols.map((b) => {
                  const l = lineFor(b, k)
                  const actual = b.percents[k] || 0
                  // no comparison line and not used → material belongs to another batch/revision
                  const status = l ? l.status : actual > 0 ? 'ok' : null
                  if (!status)
                    return (
                      <td key={b.id}>
                        <span className="cell blank">·</span>
                      </td>
                    )
                  const fixed = b.unitFixes?.some((x) => x.key === k)
                  return (
                    <td key={b.id}>
                      <span
                        className={`cell ${status}`}
                        title={`${order.names[k]} · B${b.seq}\nActual ${actual.toFixed(2)}%${l ? `\nStd (${b.standard.no}) ${l.base.toFixed(2)}%\nΔ ${l.dev.toFixed(2)} pp · ${SEVERITY_LABEL[status]}` : ''}${fixed ? '\nEntered in kg → converted' : ''}`}
                      >
                        {/* small additives (<1%) need 2 decimals or they all read "0.0" */}
                        {mode === 'actual'
                          ? status === 'missing'
                            ? '0'
                            : actual.toFixed(actual < 1 ? 2 : 1)
                          : l
                            ? `${l.dev > 0 ? '+' : ''}${l.dev.toFixed(Math.abs(l.dev) < 1 ? 2 : 1)}`
                            : '—'}
                        {fixed && <span className="unit-tag">kg</span>}
                      </span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>FG produced (MT)</td>
              {latest && <td className="std-col" />}
              {cols.map((b) => (
                <td key={b.id}>{b.fgQty}</td>
              ))}
            </tr>
            <tr>
              <td title="Σ|Δ| ÷ 2 — share of the mix that differs from the standard">Mix shift %</td>
              {latest && <td className="std-col" />}
              {cols.map((b) => (
                <td key={b.id} style={{ color: `var(--${b.severity})` }}>
                  {b.vsStandard ? b.vsStandard.shift.toFixed(1) : '—'}
                </td>
              ))}
            </tr>
            <tr>
              <td title="RM entered ÷ FG produced">RM ÷ FG %</td>
              {latest && <td className="std-col" />}
              {cols.map((b) => (
                <td key={b.id}>{b.coverage !== null ? b.coverage.toFixed(0) : '—'}</td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
