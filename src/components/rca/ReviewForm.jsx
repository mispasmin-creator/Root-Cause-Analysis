import { useState } from 'react'
import { productionDb, TABLES } from '../../lib/supabase.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { Notice } from '../ui.jsx'
import { ROOT_CAUSE_CATEGORIES } from '../../lib/constants.js'

/** Records the human-confirmed root cause for one batch (actual_production row). */
export default function ReviewForm({ batch, order, onSaved }) {
  const { user } = useAuth()
  const [form, setForm] = useState({
    root_cause_category: '',
    root_cause_detail: '',
    corrective_action: '',
    preventive_action: '',
    status: 'Open',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    if (!form.root_cause_category) return setError('Choose a root-cause category')
    setSaving(true)
    setError(null)
    const { error: err } = await productionDb.from(TABLES.reviews).insert({
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
    })
    setSaving(false)
    if (err) return setError(err.message)
    setForm({ root_cause_category: '', root_cause_detail: '', corrective_action: '', preventive_action: '', status: 'Open' })
    onSaved?.()
  }

  return (
    <form onSubmit={submit} className="stack" style={{ gap: 12 }}>
      {error && <Notice kind="err">{error}</Notice>}
      <div className="field">
        <label htmlFor="rc-cat">Root cause *</label>
        <select id="rc-cat" className="select" value={form.root_cause_category} onChange={set('root_cause_category')}>
          <option value="">Select…</option>
          {ROOT_CAUSE_CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="rc-detail">What happened</label>
        <textarea
          id="rc-detail"
          className="textarea"
          placeholder="e.g. GBXT 80 (5-8) out of stock, replaced with (1-3) on supervisor instruction"
          value={form.root_cause_detail}
          onChange={set('root_cause_detail')}
        />
      </div>
      <div className="grid grid-2" style={{ gap: 12 }}>
        <div className="field">
          <label htmlFor="rc-ca">Corrective action</label>
          <textarea id="rc-ca" className="textarea" value={form.corrective_action} onChange={set('corrective_action')} />
        </div>
        <div className="field">
          <label htmlFor="rc-pa">Preventive action</label>
          <textarea id="rc-pa" className="textarea" value={form.preventive_action} onChange={set('preventive_action')} />
        </div>
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
