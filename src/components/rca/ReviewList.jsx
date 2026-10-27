import { fmtDate } from '../../lib/format.js'
import { Badge } from '../ui.jsx'

/** Root causes already saved for a batch (Batch drawer + R&D "Failure & remarks"). */
export default function ReviewList({ reviews }) {
  return reviews.map((r) => (
    <div key={r.id} style={{ borderLeft: '3px solid var(--brand)', paddingLeft: 12 }}>
      <div className="row">
        <b>{r.root_cause_category}</b>
        <Badge tone={r.status === 'Closed' ? 'ok' : 'warning'}>{r.status}</Badge>
      </div>
      {r.root_cause_detail && <div style={{ marginTop: 4 }}>{r.root_cause_detail}</div>}
      {r.analytics_report && (
        <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
          <b>Analytics &amp; report:</b> {r.analytics_report}
        </div>
      )}
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
      {r.remarks && (
        <div className="muted" style={{ fontSize: 13 }}>
          <b>Remarks:</b> {r.remarks}
        </div>
      )}
      <div className="faint" style={{ fontSize: 11.5, marginTop: 4 }}>
        {r.reviewed_by || '—'} · {fmtDate(r.created_at)}
      </div>
    </div>
  ))
}
