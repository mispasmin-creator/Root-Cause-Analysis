import { fmtNum } from '../../lib/format.js'
import { Badge, Empty } from '../ui.jsx'
import { SEVERITY_LABEL } from '../../lib/constants.js'

const d2 = (ms) => {
  if (!ms) return '—'
  const d = new Date(ms)
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`
}

/**
 * Plant-style production sheet (same layout as the PDF the team uses):
 * compositions side by side, then one row per production group — batches with the same mix.
 * "Production" = the mix exactly as entered for the group's largest batch (kg / bags as typed).
 * Remarks: what people actually typed (verbatim) + auto remarks in English vs the composition.
 */
export default function ProductionSheet({ order, onSelectBatch }) {
  const groups = order.groups || []
  if (!groups.length) return <div className="card"><Empty title="No batches produced yet" /></div>

  return (
    <section className="card">
      <div className="card-head">
        <h3>
          {order.party ? `${order.party} · ` : ''}
          {order.product} · Order qty {fmtNum(order.orderQty, 0)} — Production sheet
        </h3>
        <div className="row">
          <Badge>{groups.length} production group{groups.length === 1 ? '' : 's'}</Badge>
          <Badge tone="brand">Total {fmtNum(order.producedQty)} MT</Badge>
        </div>
      </div>

      {/* one composition per production group, side by side — exactly like the plant sheet header */}
      <div className="table-wrap">
        <table className="tbl psheet-comp">
          <thead>
            <tr>
              {groups.map((g) => (
                <th key={g.id}>{g.label.toUpperCase()}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {groups.map((g) => (
                <td key={g.id} style={{ verticalAlign: 'top' }}>
                  {g.composition.map((it) => (
                    <div key={it.key} className="nowrap">
                      {it.name}: {it.pct}%
                    </div>
                  ))}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      {order.compositions.length > 0 && (
        <div className="faint" style={{ padding: '8px 16px', fontSize: 12, borderBottom: '1px solid var(--border)' }}>
          Approved composition (reference for remarks):{' '}
          {order.compositions.map((c) => (
            <span key={c.id} title={c.items.map((it) => `${it.name}: ${it.value}%`).join('\n')} style={{ fontWeight: 600, marginRight: 8 }}>
              {c.no}
            </span>
          ))}
        </div>
      )}

      <div className="table-wrap">
        <table className="tbl psheet">
          <thead>
            <tr>
              <th className="c">S.N.</th>
              <th>Date of production</th>
              <th>Job card no.</th>
              <th>Product</th>
              <th className="r">Quantity</th>
              <th>Production</th>
              <th>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.id}>
                <td className="c" style={{ fontWeight: 600 }}>
                  {g.sn}
                  <div>
                    <span className={`badge b-${g.severity}`} title={`${g.label}: ${SEVERITY_LABEL[g.severity]} vs ${g.standard?.no || 'approved composition'}`}>
                      {g.label}
                    </span>
                  </div>
                </td>
                <td className="nowrap">{g.dateFrom === g.dateTo ? d2(g.dateFrom) : `${d2(g.dateFrom)} to ${d2(g.dateTo)}`}</td>
                <td>
                  <div className="psheet-jcs">
                    {g.batches.map((b, i) => (
                      <button key={b.id} type="button" className="chat-link" onClick={() => onSelectBatch(b)} title={`B${b.seq} · ${b.fgQty} MT`}>
                        {b.jobCard}
                        {i < g.batches.length - 1 ? ' /' : ''}
                      </button>
                    ))}
                  </div>
                  <div className="faint" style={{ fontWeight: 600, marginTop: 4 }}>
                    TOTAL QTY - {fmtNum(g.qty)}
                  </div>
                </td>
                <td className="nowrap">{order.product}</td>
                <td className="r num" style={{ fontWeight: 600 }}>
                  {fmtNum(g.qty)}
                </td>
                <td>
                  {g.entered.map((e, i) => (
                    <div key={i} className="nowrap">
                      {e.name}: {fmtNum(e.qty, 3)}
                    </div>
                  ))}
                  <div className="faint" style={{ fontSize: 11, marginTop: 4 }}>
                    as entered for {g.rep.jobCard} ({fmtNum(g.rep.fgQty)} MT)
                  </div>
                </td>
                <td style={{ minWidth: 220 }}>
                  {g.remarksActual.map((r, i) => (
                    <div key={`a${i}`} style={{ whiteSpace: 'pre-wrap' }}>
                      {r}
                    </div>
                  ))}
                  {g.remarksAuto.map((r, i) => (
                    <div key={`r${i}`} className="psheet-auto">
                      {r}
                    </div>
                  ))}
                  {!g.remarksActual.length && !g.remarksAuto.length && <span className="faint">As per composition</span>}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} />
              <td style={{ fontWeight: 700 }}>TOTAL QTY</td>
              <td className="r num" style={{ fontWeight: 700 }}>
                {fmtNum(order.producedQty)} MT
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="faint" style={{ padding: '10px 16px', fontSize: 12, borderTop: '1px solid var(--border)' }}>
        Each composition above = one production group (batches with the same mix), % of the batch quantity. Remarks in normal text are as typed in Production-FMS / RCA; remarks in <i>italic</i> are generated
        (English) by comparing the group’s mix with {order.compositions.length ? `composition ${order.compositions[order.compositions.length - 1].no}` : 'the composition'}.
      </div>
    </section>
  )
}
