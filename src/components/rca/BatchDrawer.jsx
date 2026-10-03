import { useEffect } from 'react'
import { useData } from '../../context/DataContext.jsx'
import { fmtDate, fmtInr, fmtMt, fmtNum } from '../../lib/format.js'
import { LAB_FIELDS } from '../../lib/rca.js'
import { IconX } from '../Icons.jsx'
import { Badge, Notice, SeverityBadge } from '../ui.jsx'
import CompareTable from './CompareTable.jsx'
import ReviewForm from './ReviewForm.jsx'

/** Everything about one batch: what was used, how it differs, lab/cost, and the recorded root cause. */
export default function BatchDrawer({ order, batch, onClose }) {
  const { reviews, refreshReviews, reload } = useData()

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const prev = batch.seq > 1 ? order.batches[batch.seq - 2] : null
  const fixedKeys = new Set((batch.unitFixes || []).map((x) => x.key))
  const labs = LAB_FIELDS.filter((f) => batch.lab[f.key] !== null)

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={`Batch ${batch.seq} details`}>
        <div className="drawer-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="faint" style={{ fontSize: 12 }}>
              {order.doNo} · {order.product}
            </div>
            <div className="row" style={{ marginTop: 2 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>
                Batch {batch.seq} · {batch.jobCard}
              </h2>
              <SeverityBadge severity={batch.severity} />
              {batch.reviewed && <Badge tone="brand">Reviewed</Badge>}
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">
            <IconX />
          </button>
        </div>

        <div className="drawer-body">
          <div className="card card-body kv">
            <div>
              <span>Production date</span>
              <b>{fmtDate(batch.date)}</b>
            </div>
            <div>
              <span>Supervisor</span>
              <b>{batch.supervisor}</b>
            </div>
            <div>
              <span>FG produced</span>
              <b>{fmtMt(batch.fgQty)}</b>
            </div>
            <div>
              <span>RM used</span>
              <b>
                {fmtMt(batch.rmTotal)} {batch.coverage !== null && <span className="faint">({batch.coverage.toFixed(0)}%)</span>}
              </b>
            </div>
            <div>
              <span>Standard used</span>
              <b>{batch.standard?.no || '—'}</b>
            </div>
            <div>
              <span>Mix shift</span>
              <b>{batch.vsStandard ? `${batch.vsStandard.shift.toFixed(1)}%` : '—'}</b>
            </div>
            <div>
              <span>Machine hours</span>
              <b>{fmtNum(batch.machineHours)}</b>
            </div>
            <div>
              <span>Lab status</span>
              <b>{batch.labStatus || 'Pending'}</b>
            </div>
          </div>

          {batch.unitFixes?.length > 0 && (
            <Notice kind="info">
              Entered in kg and converted to MT for comparison:{' '}
              {batch.unitFixes.map((x) => `${x.name} (${x.enteredQty} → ${x.value.toFixed(3)} MT)`).join(', ')}
            </Notice>
          )}

          <section className="card">
            <div className="card-head">
              <h3>vs standard composition {batch.standard ? `(${batch.standard.no})` : ''}</h3>
            </div>
            {batch.vsStandard ? (
              <CompareTable
                result={batch.vsStandard}
                baseLabel={`Std ${batch.standard.no}`}
                actualLabel={`B${batch.seq}`}
                names={order.names}
                unitFixed={fixedKeys}
              />
            ) : (
              <div className="card-body muted">No composition linked to this order.</div>
            )}
          </section>

          {prev && batch.vsPrev && (
            <section className="card">
              <div className="card-head">
                <h3>
                  vs previous batch (B{prev.seq} · {prev.jobCard})
                </h3>
              </div>
              <CompareTable result={batch.vsPrev} baseLabel={`B${prev.seq}`} actualLabel={`B${batch.seq}`} names={order.names} unitFixed={fixedKeys} />
            </section>
          )}

          <section className="card">
            <div className="card-head">
              <h3>Lab results & cost</h3>
            </div>
            <div className="card-body kv">
              {labs.length === 0 && <div className="muted">No lab values recorded yet.</div>}
              {labs.map((f) => (
                <div key={f.key}>
                  <span>{f.label}</span>
                  <b>{fmtNum(batch.lab[f.key])}</b>
                </div>
              ))}
              <div>
                <span>Expected RM cost</span>
                <b>{fmtInr(batch.cost.expected)}</b>
              </div>
              <div>
                <span>Actual RM cost</span>
                <b>{fmtInr(batch.cost.actual)}</b>
              </div>
              <div>
                <span>Profit variance</span>
                <b style={{ color: batch.cost.variance < 0 ? 'var(--major)' : undefined }}>{fmtInr(batch.cost.variance)}</b>
              </div>
            </div>
            {batch.packaging.length > 0 && (
              <div className="faint" style={{ padding: '0 16px 14px', fontSize: 12 }}>
                Packaging (excluded from mix): {batch.packaging.map((p) => `${p.name} × ${p.qty}`).join(', ')}
              </div>
            )}
          </section>

          <section className="card">
            <div className="card-head">
              <h3>Root cause</h3>
              <span className="faint" style={{ fontSize: 12 }}>
                {batch.reviews.length} recorded
              </span>
            </div>
            <div className="card-body stack">
              {batch.reviews.map((r) => (
                <div key={r.id} style={{ borderLeft: '3px solid var(--brand)', paddingLeft: 12 }}>
                  <div className="row">
                    <b>{r.root_cause_category}</b>
                    <Badge tone={r.status === 'Closed' ? 'ok' : 'warning'}>{r.status}</Badge>
                  </div>
                  {r.root_cause_detail && <div style={{ marginTop: 4 }}>{r.root_cause_detail}</div>}
                  {r.corrective_action && (
                    <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                      <b>Corrective:</b> {r.corrective_action}
                    </div>
                  )}
                  {r.preventive_action && (
                    <div className="muted" style={{ fontSize: 13 }}>
                      <b>Preventive:</b> {r.preventive_action}
                    </div>
                  )}
                  <div className="faint" style={{ fontSize: 11.5, marginTop: 4 }}>
                    {r.reviewed_by || '—'} · {fmtDate(r.created_at)}
                  </div>
                </div>
              ))}
              {reviews.available ? (
                <ReviewForm batch={batch} order={order} onSaved={refreshReviews} />
              ) : (
                <Notice kind="warn">
                  Root-cause recording is off: table <code>rca_reviews</code> does not exist yet. Run{' '}
                  <code>supabase/migrations/001_rca_reviews.sql</code> in the Production-FMS SQL editor, then{' '}
                  <button className="btn btn-sm" onClick={reload} type="button">
                    reload
                  </button>
                  .
                </Notice>
              )}
            </div>
          </section>
        </div>
      </aside>
    </>
  )
}
