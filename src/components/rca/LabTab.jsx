import { useMemo } from 'react'
import { summarizeLab } from '../../lib/rca.js'
import { fmtNum } from '../../lib/format.js'
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

const dmy = (v, sep = '-') => {
  if (!v) return ''
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return String(v)
  return [String(d.getDate()).padStart(2, '0'), String(d.getMonth() + 1).padStart(2, '0'), d.getFullYear()].join(sep)
}
const up = (v) => (v === null || v === undefined ? '' : String(v).trim().toUpperCase())

// Column layout of the plant's "Production & Lab report sheet" (PDF). `key` = labCheck item → judged against target.
const LAB_SHEET_COLS = [
  { group: 1, label: 'Status', raw: (r) => up(r.Status2) },
  { group: 1, label: 'Date Of Test', raw: (r) => dmy(r.DateOfTest1, '/') },
  { group: 1, label: 'WC %', key: 'wc' },
  { group: 1, label: 'Initial Setting Time', key: 'ist' },
  { group: 1, label: 'Flow Of Material', key: 'flow' },
  { group: 1, label: 'Final Setting Time', key: 'fst' },
  { group: 1, label: 'Sieve Analysis', raw: (r) => up(r.SieveAnalysis) },
  { group: 2, label: 'Status', raw: (r) => up(r.Status3) },
  { group: 2, label: 'Date Of Test', raw: (r) => dmy(r.DateOfTest2, '/') },
  { group: 2, label: 'BD At 110C', key: 'bd110' },
  { group: 2, label: 'CCS At 110C', key: 'ccs110' },
  { group: 2, label: 'BD At 1100C', key: 'bd1100' },
  { group: 2, label: 'CCS At 1100C', key: 'ccs1100' },
  { group: 2, label: 'PLC At 1100C', key: 'plc' },
]

/**
 * Lab tab in the plant's report-sheet layout: one row per batch (grouped like the production sheet,
 * blank row between groups), LAB TEST 1 / LAB TEST 2 columns, a Target row from the composition, TOTAL qty.
 * Results outside the composition target are coloured (judging = batch.labCheck from rca.js).
 */
export default function LabTab({ order, onSelectBatch }) {
  const summary = useMemo(() => summarizeLab(order.batches), [order])
  const latest = order.compositions[order.compositions.length - 1]
  const latestItems = order.batches.find((b) => b.standard?.id === latest?.id)?.labCheck.items || order.batches[0]?.labCheck.items || []
  const targetOf = (key) => latestItems.find((i) => i.key === key)?.targetText || null

  const tested = order.batches.filter((b) => b.labCheck.tested)
  const judged = summary.reduce((s, p) => s + p.judged, 0)
  const matched = summary.reduce((s, p) => s + p.ok, 0)
  const groups = order.groups?.length ? order.groups : [{ id: 'all', batches: order.batches }]

  if (!tested.length)
    return (
      <div className="card">
        <Empty title="No lab results yet" icon={IconBeaker}>
          Lab Test 1 / 2 have not recorded results for these batches.
        </Empty>
      </div>
    )

  // serial numbers run across groups (S.N. column of the sheet), computed before render
  const serialOf = new Map()
  groups.flatMap((g) => g.batches).forEach((b, i) => serialOf.set(b, i + 1))
  const cell = (b, c) => {
    if (!c.key) {
      const v = c.raw(b.raw)
      return <td key={c.label + c.group}>{v || <span className="faint">·</span>}</td>
    }
    const it = b.labCheck.items.find((i) => i.key === c.key)
    const raw = it?.actualText !== null && it?.actualText !== undefined ? String(it.actualText).trim() : ''
    if (!raw)
      return (
        <td key={c.key}>
          <span className="faint">·</span>
        </td>
      )
    // no target to judge against → plain text (not greyed out)
    const cls = it.status === 'ok' ? 'match' : JUDGED.includes(it.status) ? it.status : ''
    return (
      <td key={c.key}>
        <span className={`cell ${cls}`} title={`${c.label}: ${raw}\nTarget (${b.standard?.no || '—'}): ${it.targetText || 'not set'}${offText(it) ? `\n${offText(it)} target` : it.status === 'ok' ? '\nMatched ✓' : ''}`}>
          {up(raw)}
          {offText(it) && <small>{offText(it)}</small>}
        </span>
      </td>
    )
  }

  return (
    <section className="card">
      <div className="card-head" style={{ alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <h3>
            {order.party ? `${order.party} · ` : ''}
            {order.product} · Order qty {fmtNum(order.orderQty, 0)} — Production &amp; lab report
          </h3>
          <div className="muted" style={{ fontSize: 13, marginTop: 3 }}>
            <b>Target</b> row = values entered while creating composition {latest ? <b>{latest.no}</b> : ''}. Results outside the target are{' '}
            <span style={{ color: 'var(--minor)', fontWeight: 600 }}>yellow</span> (slightly) or <span style={{ color: 'var(--major)', fontWeight: 600 }}>red</span>.
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

      <div className="table-wrap" style={{ maxHeight: '72vh' }}>
        <table className="tbl lab-sheet">
          <thead>
            <tr>
              <th colSpan={4} />
              <th colSpan={7} className="c lab-sheet-group">
                LAB TEST 1
              </th>
              <th colSpan={7} className="c lab-sheet-group">
                LAB TEST 2
              </th>
            </tr>
            <tr>
              <th className="c hd-base">S.N.</th>
              <th className="hd-base">Date of Production</th>
              <th className="hd-base">Job Card No.</th>
              <th className="r hd-base">Qty</th>
              {LAB_SHEET_COLS.map((c) => (
                // header colours as on the plant sheet: Status = orange, Lab Test 1 = green, Lab Test 2 = yellow
                <th key={c.label + c.group} className={c.label === 'Status' ? 'hd-status' : c.group === 1 ? 'hd-lt1' : 'hd-lt2'}>
                  {c.label}
                </th>
              ))}
            </tr>
            <tr className="lab-sheet-target">
              <td colSpan={4}>Target {latest ? `(${latest.no})` : ''}</td>
              {LAB_SHEET_COLS.map((c) => (
                <td key={c.label + c.group}>{c.key ? targetOf(c.key) || '—' : ''}</td>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g, gi) => [
              gi > 0 && (
                <tr key={`sep-${g.id}`} className="lab-sheet-sep">
                  <td colSpan={4 + LAB_SHEET_COLS.length} />
                </tr>
              ),
              ...g.batches.map((b) => {
                const sn = serialOf.get(b)
                return (
                  <tr key={b.id} className="clickable" onClick={() => onSelectBatch(b)}>
                    <td className="c">{sn}</td>
                    <td className="nowrap">{dmy(b.date)}</td>
                    <td className="nowrap" style={{ fontWeight: 600 }}>
                      {b.jobCard}
                    </td>
                    <td className="r num">{fmtNum(b.fgQty)}</td>
                    {LAB_SHEET_COLS.map((c) => cell(b, c))}
                  </tr>
                )
              }),
            ])}
          </tbody>
          <tfoot>
            <tr>
              <td />
              <td />
              <td style={{ fontWeight: 700 }}>TOTAL</td>
              <td className="r num" style={{ fontWeight: 700 }}>
                {fmtNum(order.producedQty)}
              </td>
              <td colSpan={LAB_SHEET_COLS.length} />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}
