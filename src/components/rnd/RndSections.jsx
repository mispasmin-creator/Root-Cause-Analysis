// R&D building blocks: the root-cause popup (same form as the Batch drawer on Orders & batches) and a batch's
// lab report table.
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useData } from '../../context/DataContext.jsx'
import { fmtDate } from '../../lib/format.js'
import { Badge, Notice } from '../ui.jsx'
import { IconX } from '../Icons.jsx'
import ReviewForm from '../rca/ReviewForm.jsx'
import ReviewList from '../rca/ReviewList.jsx'

/**
 * Root-cause form in a popup (shared by both phases). Rendered outside the table and looked up from the full
 * list, so it stays open after saving even when the batch drops out of the current filter.
 */
export function RootCauseModal({ x, title, causeLabel, onClose, children }) {
  const { reviews, refreshReviews } = useData()
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden' // page behind the popup does not scroll
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [onClose])
  return createPortal(
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="drawer-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: 0 }}>{title}</h3>
            <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>
              {x.o.doNo} · {x.b.jobCard} · {x.o.product} · {fmtDate(x.b.date)} · {x.b.standard?.no || 'no composition'}
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close" type="button">
            <IconX />
          </button>
        </div>
        <div className="drawer-body">
          {children}
          {x.b.reviews.length > 0 && (
            <div className="stack" style={{ gap: 10 }}>
              <div className="psheet-remarks-h">Saved root causes ({x.b.reviews.length})</div>
              <ReviewList reviews={x.b.reviews} />
            </div>
          )}
          {reviews.available ? (
            <ReviewForm batch={x.b} order={x.o} onSaved={refreshReviews} causeLabel={causeLabel} />
          ) : (
            <Notice kind="warn">
              Root-cause recording is off: run <code>supabase/migrations/001_rca_reviews.sql</code> in the Production-FMS SQL editor.
            </Notice>
          )}
        </div>
      </div>
    </>,
    document.body,
  )
}

/** Lab report values vs target for one batch. */
export function LabTable({ items }) {
  return (
    <div className="table-wrap" style={{ border: '1px solid var(--border)', borderRadius: 8 }}>
      <table className="tbl">
        <thead>
          <tr>
            <th>Lab test</th>
            <th>Lab report value</th>
            <th>Target</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.key}>
              <td className="nowrap" style={{ fontWeight: 600 }}>
                {i.label}
              </td>
              <td className="nowrap">{i.actualText !== null && String(i.actualText).trim() ? String(i.actualText).trim() : <span className="faint">not entered</span>}</td>
              <td className="nowrap">{i.targetText || <span className="faint">no target</span>}</td>
              <td>
                {['ok', 'minor', 'major'].includes(i.status) ? (
                  <Badge tone={i.status}>{i.status === 'ok' ? 'Within target' : `${i.diff > 0 ? 'Above' : 'Below'} target`}</Badge>
                ) : (
                  <span className="faint">{i.status === 'notarget' ? 'cannot judge' : '—'}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
