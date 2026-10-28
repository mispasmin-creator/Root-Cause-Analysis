import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useData } from '../context/DataContext.jsx'
import { labFailures, remarkCheck } from '../lib/rnd.js'
import { fmtDate } from '../lib/format.js'
import { firmLabel } from '../lib/normalize.js'
import { CHECK, pct } from '../lib/rndFormat.js'
import { usePagination } from '../lib/pagination.js'
import { Badge, Empty, Kpi, Segmented } from '../components/ui.jsx'
import { IconBeaker, IconSearch } from '../components/Icons.jsx'
import PdfButton from '../components/PdfButton.jsx'
import Pagination from '../components/Pagination.jsx'
import { LabTable, RootCauseModal } from '../components/rnd/RndSections.jsx'

/**
 * R&D — kept simple, in the user's order:
 *  1. Data quality check: for every batch, the system's own remark (mix vs composition, kg entries, lab tests outside
 *     target) next to the remark the user wrote (root cause) → Matches / Mismatch / No user remark.
 *  2. The user writes their concern in the root-cause form — the same form as the Batch drawer on Orders & batches,
 *     so a remark added there shows up here too (one table: rca_reviews).
 *  3. Remarks: every saved root cause with all its fields.
 */
export default function RnD() {
  const { model } = useData()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') || ''
  const firm = params.get('firm') || ''
  const tab = params.get('tab') === 'remarks' ? 'remarks' : 'quality'
  const check = params.get('check') || 'attention'
  const [qInput, setQInput] = useState(q)
  const setParam = (k, v, clear = []) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    ;['fpage', 'rpage', ...clear].forEach((c) => next.delete(c)) // filters changed → back to page 1
    setParams(next, { replace: true })
  }

  const firms = useMemo(
    () => [...new Set(model.orders.filter((o) => o.batches.length).map((o) => firmLabel(o.firm)))].filter((f) => f !== '—').sort(),
    [model],
  )
  // every batch of the chosen firm matching the search (DO, PO, product, party, job card)
  const batches = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return model.orders
      .filter((o) => !firm || firmLabel(o.firm) === firm)
      .flatMap((o) => o.batches.map((b) => ({ b, o })))
      .filter(({ b, o }) => !needle || [o.doNo, o.poNo, o.product, o.party, b.jobCard].join(' ').toLowerCase().includes(needle))
  }, [model, firm, q])
  const rc = useMemo(() => remarkCheck({ batches }), [batches])
  const lab = useMemo(() => labFailures({ batches }), [batches])
  const remarks = useMemo(
    () =>
      batches
        .flatMap((x) => x.b.reviews.map((r) => ({ ...x, r })))
        .sort((p, s) => String(s.r.created_at).localeCompare(String(p.r.created_at))),
    [batches],
  )

  const openId = Number(params.get('batch')) || null
  const close = useCallback(() => {
    const next = new URLSearchParams(params)
    next.delete('batch')
    setParams(next, { replace: true })
  }, [params, setParams])
  const open = (id) => {
    const next = new URLSearchParams(params)
    next.set('batch', String(id))
    setParams(next, { replace: true })
  }
  const openX = openId ? batches.find((x) => x.b.id === openId) : null
  const openRc = openX ? rc.rows.find((r) => r.b.id === openX.b.id) : null
  const openLab = openX ? lab.find((r) => r.b.id === openX.b.id) : null

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>R&amp;D insights</h1>
          <p>Check the data (system remark vs user remark), write the concern in the root-cause form, and see all remarks in one place.</p>
        </div>
      </div>

      <div className="grid grid-kpi">
        <Kpi
          label="Remarks agree with system"
          value={rc.score === null ? '—' : pct(rc.score, 0)}
          sub={rc.score === null ? 'no user remarks to check yet' : `${rc.match} of ${rc.match + rc.mismatch} user remarks`}
          tone={rc.score === null ? undefined : rc.score >= 75 ? 'ok' : rc.score >= 50 ? 'minor' : 'major'}
        />
        <Kpi label="Mismatch" value={rc.mismatch} sub="user remark ≠ system finding" tone={rc.mismatch ? 'major' : 'ok'} />
        <Kpi label="No user remark" value={rc.missing} sub="system found a difference" tone={rc.missing ? 'minor' : 'ok'} />
        <Kpi label="Remarks written" value={remarks.length} sub={`on ${new Set(remarks.map((x) => x.b.id)).size} batches`} />
      </div>

      <div>
        <div className="tabs" role="tablist">
          <button className={tab === 'quality' ? 'on' : ''} onClick={() => setParam('tab', '')} role="tab" type="button">
            1 · Data quality check
            {rc.missing + rc.mismatch > 0 && <span className="count">{rc.missing + rc.mismatch}</span>}
          </button>
          <button className={tab === 'remarks' ? 'on' : ''} onClick={() => setParam('tab', 'remarks')} role="tab" type="button">
            2 · Remarks
            {remarks.length > 0 && <span className="count">{remarks.length}</span>}
          </button>
        </div>

        <section className="card">
          <div className="card-head">
            <div className="search">
              <IconSearch />
              <input
                className="input"
                placeholder="Search DO, PO, product, party, JC…"
                value={qInput}
                onChange={(e) => {
                  setQInput(e.target.value)
                  setParam('q', e.target.value)
                }}
                aria-label="Search"
              />
            </div>
            <div className="row">
              <select className="select" value={firm} onChange={(e) => setParam('firm', e.target.value)} aria-label="Firm">
                <option value="">All firms</option>
                {firms.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
              {tab === 'quality' && (
                <Segmented
                  value={check}
                  onChange={(v) => setParam('check', v === 'attention' ? '' : v)}
                  options={[
                    { value: 'attention', label: `Needs attention (${rc.missing + rc.mismatch})` },
                    { value: 'mismatch', label: `Mismatch (${rc.mismatch})` },
                    { value: 'match', label: `Matches (${rc.match})` },
                    { value: 'all', label: `All (${rc.rows.length})` },
                  ]}
                />
              )}
              <PdfButton title={tab === 'quality' ? 'R&D — data quality check' : 'R&D — remarks'} />
            </div>
          </div>
          {tab === 'quality' ? <QualityTable rc={rc} check={check} onOpen={open} /> : <RemarksTable remarks={remarks} onOpen={open} />}
        </section>
      </div>

      {openX && (
        <RootCauseModal
          x={openX}
          title={openX.b.reviews.length ? 'Correct / add remark' : 'Add remark'}
          causeLabel={openLab?.failed.length ? 'Failure reason (root cause) *' : undefined}
          onClose={close}
        >
          <div className="card">
            <div className="card-head">
              <h3>System remark</h3>
              {openRc && <Badge tone={CHECK[openRc.check].tone}>{CHECK[openRc.check].label}</Badge>}
            </div>
            <div className="card-body" style={{ fontSize: 13 }}>
              {openRc?.system.length ? (
                openRc.system.map((s, i) => (
                  <div key={i} className="psheet-auto">
                    {s}
                  </div>
                ))
              ) : (
                <span className="faint">As per composition and lab</span>
              )}
              {openRc?.typed.map((t, i) => (
                <div key={`t${i}`} className="faint" style={{ marginTop: 2 }}>
                  FMS: {t}
                </div>
              ))}
              {openRc && (
                <div className="faint" style={{ marginTop: 8, fontSize: 12 }}>
                  {openRc.reason}
                </div>
              )}
            </div>
          </div>
          {openX.b.labCheck?.tested && (
            <div className="card">
              <div className="card-head">
                <h3>Lab report</h3>
                {openLab?.issues.length > 0 && <Badge tone="minor">Lab data not proper</Badge>}
              </div>
              {openLab?.issues.length > 0 && (
                <div className="muted" style={{ padding: '8px 16px', fontSize: 12.5 }}>
                  {openLab.issues.join(' · ')}
                </div>
              )}
              <LabTable items={openX.b.labCheck.items} />
            </div>
          )}
        </RootCauseModal>
      )}
    </div>
  )
}

// clicking the batch opens its popup on this page (no jump to Orders & batches)
const BatchCell = ({ x, onOpen }) => (
  <td className="nowrap">
    <button type="button" className="chat-link" onClick={() => onOpen(x.b.id)}>
      {x.o.doNo} · {x.b.jobCard}
    </button>
    <div className="faint truncate" style={{ fontSize: 12, maxWidth: 220 }} title={x.o.product}>
      {x.o.product} · {fmtDate(x.b.date)}
    </div>
  </td>
)

/** Step 1 — system remark vs user remark, one row per batch. */
function QualityTable({ rc, check, onOpen }) {
  const rows = rc.rows.filter((r) => (check === 'all' ? true : check === 'attention' ? r.check === 'mismatch' || r.check === 'missing' : r.check === check))
  const pg = usePagination(rows.length, 'f')
  if (!rows.length) return <Empty title="Nothing here" icon={IconBeaker} />
  return (
    <>
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Batch</th>
              <th style={{ minWidth: 260 }}>System remark</th>
              <th style={{ minWidth: 220 }}>User remark (root cause)</th>
              <th>Check</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {pg.slice(rows).map((x) => {
              const r = x.reviews[0]
              return (
                <tr key={x.b.id}>
                  <BatchCell x={x} onOpen={onOpen} />
                  <td style={{ fontSize: 12.5 }}>
                    {x.system.length ? (
                      x.system.slice(0, 3).map((s, i) => (
                        <div key={i} className="psheet-auto">
                          {s}
                        </div>
                      ))
                    ) : (
                      <span className="faint">As per composition and lab</span>
                    )}
                    {x.system.length > 3 && <div className="faint">+{x.system.length - 3} more</div>}
                  </td>
                  <td style={{ fontSize: 12.5 }}>
                    {r ? (
                      <>
                        <b>{r.root_cause_category}</b>
                        {r.root_cause_detail && <div>{r.root_cause_detail}</div>}
                      </>
                    ) : (
                      <span className="faint">—</span>
                    )}
                  </td>
                  <td>
                    <Badge tone={CHECK[x.check].tone}>{CHECK[x.check].label}</Badge>
                    <div className="faint" style={{ fontSize: 11.5, marginTop: 2, maxWidth: 220 }}>
                      {x.reason}
                    </div>
                  </td>
                  <td className="r">
                    <button className={`btn btn-sm ${r ? '' : 'btn-primary'}`} onClick={() => onOpen(x.b.id)} type="button">
                      {r ? 'Correct / add' : 'Add remark'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <Pagination pg={pg} label="batches" />
    </>
  )
}

/** Step 3 — every saved root cause (from this page or the Batch drawer on Orders & batches), newest first. */
function RemarksTable({ remarks, onOpen }) {
  const pg = usePagination(remarks.length, 'r')
  if (!remarks.length)
    return (
      <Empty title="No remarks yet" icon={IconBeaker}>
        Add one from “1 · Data quality check” or from a batch on Orders &amp; batches.
      </Empty>
    )
  const cell = (v) => (v ? <div style={{ whiteSpace: 'pre-wrap' }}>{v}</div> : <span className="faint">—</span>)
  return (
    <>
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Date</th>
              <th>Batch</th>
              <th style={{ minWidth: 160 }}>Root cause</th>
              <th style={{ minWidth: 200 }}>What happened</th>
              <th style={{ minWidth: 200 }}>Analytics &amp; report</th>
              <th style={{ minWidth: 180 }}>Corrective action</th>
              <th style={{ minWidth: 180 }}>Preventive action</th>
              <th style={{ minWidth: 160 }}>Remarks</th>
              <th>Status</th>
              <th>By</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {pg.slice(remarks).map((x) => (
              <tr key={x.r.id} style={{ verticalAlign: 'top' }}>
                <td className="nowrap">{fmtDate(x.r.created_at)}</td>
                <BatchCell x={x} onOpen={onOpen} />
                <td style={{ fontWeight: 600 }}>{x.r.root_cause_category}</td>
                <td>{cell(x.r.root_cause_detail)}</td>
                <td>{cell(x.r.analytics_report)}</td>
                <td>{cell(x.r.corrective_action)}</td>
                <td>{cell(x.r.preventive_action)}</td>
                <td>{cell(x.r.remarks)}</td>
                <td>
                  <Badge tone={x.r.status === 'Closed' ? 'ok' : 'warning'}>{x.r.status}</Badge>
                </td>
                <td className="nowrap">{x.r.reviewed_by || '—'}</td>
                <td className="r">
                  <button className="btn btn-sm" onClick={() => onOpen(x.b.id)} type="button">
                    Open
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination pg={pg} label="remarks" />
    </>
  )
}
