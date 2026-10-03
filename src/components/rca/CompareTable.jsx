import { fmtPp } from '../../lib/format.js'
import { SEVERITY_LABEL } from '../../lib/constants.js'
import { Badge } from '../ui.jsx'

/**
 * Side-by-side diff of two mixes. `result` = comparePercents(base, actual) output.
 * Deviation bar: left = less than base, right = more than base, scaled to the largest |Δ|.
 */
export default function CompareTable({ result, baseLabel, actualLabel, names = {}, unitFixed = new Set() }) {
  const maxDev = Math.max(1, ...result.lines.map((l) => Math.abs(l.dev)))
  const counts = result.lines.reduce((m, l) => ((m[l.status] = (m[l.status] || 0) + 1), m), {})

  return (
    <div>
      <div className="row" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        <span className="muted">
          Total mix shift <b className="num" style={{ color: 'var(--text)' }}>{result.shift.toFixed(1)}%</b>
        </span>
        <span className="spacer" />
        {['major', 'minor', 'added', 'missing', 'ok'].map((s) =>
          counts[s] ? (
            <Badge key={s} tone={s}>
              {counts[s]} {SEVERITY_LABEL[s]}
            </Badge>
          ) : null,
        )}
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Raw material</th>
              <th className="r">{baseLabel}</th>
              <th className="r">{actualLabel}</th>
              <th className="r">Δ</th>
              <th style={{ minWidth: 110 }}>Deviation</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {result.lines.map((l) => {
              const w = (Math.abs(l.dev) / maxDev) * 50
              const color = l.status === 'ok' ? 'var(--ok)' : l.status === 'minor' ? 'var(--minor)' : l.status === 'added' ? 'var(--added)' : 'var(--major)'
              return (
                <tr key={l.key}>
                  <td style={{ minWidth: 150 }}>
                    {names[l.key] || l.key}
                    {unitFixed.has(l.key) && (
                      <span className="unit-tag" title="Entered in kg — converted to MT">
                        kg→MT
                      </span>
                    )}
                  </td>
                  <td className="r num nowrap">{l.base > 0 ? `${l.base.toFixed(2)}%` : <span className="faint">—</span>}</td>
                  <td className="r num nowrap">{l.actual > 0 ? `${l.actual.toFixed(2)}%` : <span className="faint">—</span>}</td>
                  <td className="r num nowrap" style={{ color: l.status === 'ok' ? 'var(--text-2)' : color, fontWeight: 600 }}>
                    {fmtPp(l.dev)}
                  </td>
                  <td>
                    <div style={{ position: 'relative', height: 10, background: 'var(--surface-2)', borderRadius: 3 }}>
                      <span style={{ position: 'absolute', left: '50%', top: -2, bottom: -2, width: 1, background: 'var(--border-strong)' }} />
                      <span
                        style={{
                          position: 'absolute',
                          top: 0,
                          bottom: 0,
                          borderRadius: 3,
                          background: color,
                          width: `${w}%`,
                          left: l.dev < 0 ? `${50 - w}%` : '50%',
                        }}
                      />
                    </div>
                  </td>
                  <td>
                    <Badge tone={l.status}>{SEVERITY_LABEL[l.status]}</Badge>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
