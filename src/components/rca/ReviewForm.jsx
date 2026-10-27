import { useState } from 'react'
import { productionDb, TABLES } from '../../lib/supabase.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { Notice } from '../ui.jsx'
import { ROOT_CAUSE_CATEGORIES } from '../../lib/constants.js'

const EMPTY = {
  root_cause_category: '',
  root_cause_detail: '',
  analytics_report: '',
  corrective_action: '',
  preventive_action: '',
  remarks: '',
  status: 'Open',
}
// columns added by 003_rca_reviews_remarks.sql — older databases may not have them yet
const NEW_COLS = ['analytics_report', 'remarks']

/** Records the human-confirmed root cause for one batch (actual_production row). */
export default function ReviewForm({ batch, order, onSaved, causeLabel = 'Root cause *' }) {
  const { user } = useAuth()
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [warn, setWarn] = useState(null)
  const [saved, setSaved] = useState(false) // explicit confirmation — the form clearing alone looked like "nothing happened"
  const set = (k) => (e) => {
    setSaved(false)
    setForm((f) => ({ ...f, [k]: e.target.value }))
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!form.root_cause_category) return setError('Choose a root-cause category')
    setSaving(true)
    setError(null)
    setWarn(null)
    setSaved(false)
    const row = {
      ...form,
      actual_production_id: batch.id,
      job_card_no: batch.jobCard,
      firm_name: batch.firm,
      order_no: order.doNo,
      product_name: order.product,
      production_id: order.productionId,
      composition_no: batch.standard?.no || null,
      deviation_severity: batch.severity,
      mix_shift: batch.vsStandard ? Number(batch.vsStandard.shift.toFixed(2)) : null,
      reviewed_by: user?.username || null,
    }
    let { error: err } = await productionDb.from(TABLES.reviews).insert(row)
    // new columns not created yet → save the rest so nothing typed in the main fields is lost
    if (err && NEW_COLS.some((c) => String(err.message).includes(c))) {
      const lost = NEW_COLS.filter((c) => String(row[c] || '').trim())
      NEW_COLS.forEach((c) => delete row[c])
      ;({ error: err } = await productionDb.from(TABLES.reviews).insert(row))
      if (!err && lost.length)
        setWarn('Saved, but “Analytics & report” / “Remarks” were not stored: run supabase/migrations/003_rca_reviews_remarks.sql once in the Production-FMS SQL editor.')
    }
    setSaving(false)
    if (err) return setError(err.message)
    setForm(EMPTY)
    setSaved(true)
    onSaved?.()
  }

  return (
    <form onSubmit={submit} className="stack" style={{ gap: 12 }}>
      {error && <Notice kind="err">{error}</Notice>}
      {warn && <Notice kind="warn">{warn}</Notice>}
      {saved && <Notice kind="info">Root cause saved ✓ — it is listed above and the batch is now marked Reviewed.</Notice>}
      <div className="field">
        <label htmlFor={`rc-cat-${batch.id}`}>{causeLabel}</label>
        <select id={`rc-cat-${batch.id}`} className="select" value={form.root_cause_category} onChange={set('root_cause_category')}>
          <option value="">Select…</option>
          {ROOT_CAUSE_CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`rc-detail-${batch.id}`}>What happened</label>
        <textarea
          id={`rc-detail-${batch.id}`}
          className="textarea"
          placeholder="e.g. GBXT 80 (5-8) out of stock, replaced with (1-3) on supervisor instruction"
          value={form.root_cause_detail}
          onChange={set('root_cause_detail')}
        />
      </div>
      <div className="field">
        <label htmlFor={`rc-ar-${batch.id}`}>Analytics &amp; report</label>
        <textarea
          id={`rc-ar-${batch.id}`}
          className="textarea"
          placeholder="e.g. CCS 110°C 680 vs target 850-950; GBXT 80 (3-5) +4 pp above good batches; lab re-test confirmed"
          value={form.analytics_report}
          onChange={set('analytics_report')}
        />
      </div>
      <div className="grid grid-2" style={{ gap: 12 }}>
        <div className="field">
          <label htmlFor={`rc-ca-${batch.id}`}>Corrective action</label>
          <textarea id={`rc-ca-${batch.id}`} className="textarea" value={form.corrective_action} onChange={set('corrective_action')} />
        </div>
        <div className="field">
          <label htmlFor={`rc-pa-${batch.id}`}>Preventive action</label>
          <textarea id={`rc-pa-${batch.id}`} className="textarea" value={form.preventive_action} onChange={set('preventive_action')} />
        </div>
      </div>
      <div className="field">
        <label htmlFor={`rc-rm-${batch.id}`}>Remarks</label>
        <textarea id={`rc-rm-${batch.id}`} className="textarea" placeholder="Any other note for this batch" value={form.remarks} onChange={set('remarks')} />
      </div>
      <div className="row">
        <select className="select" value={form.status} onChange={set('status')} aria-label="Status">
          <option>Open</option>
          <option>Closed</option>
        </select>
        <span className="spacer" />
        <button className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save root cause'}
        </button>
      </div>
    </form>
  )
}
