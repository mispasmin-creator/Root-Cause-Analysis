import { Empty } from '../ui.jsx'
import { IconAlert, IconCheck, IconFlame, IconInfo } from '../Icons.jsx'

const FINDING_ICON = { critical: IconFlame, warning: IconAlert, info: IconInfo }

const TONE = {
  critical: { bg: 'var(--major-bg)', fg: 'var(--major)' },
  warning: { bg: 'var(--minor-bg)', fg: 'var(--minor)' },
  info: { bg: 'var(--info-bg)', fg: 'var(--info)' },
}

/** Auto-generated root-cause findings. Clicking a batch chip opens that batch. */
export default function FindingsList({ findings, batches, onSelectBatch, limit }) {
  if (!findings.length)
    return (
      <Empty title="No root-cause signals" icon={IconCheck}>
        All batches follow the approved composition within tolerance.
      </Empty>
    )
  const shown = limit ? findings.slice(0, limit) : findings
  return (
    <div>
      {shown.map((f, i) => {
        const Icon = FINDING_ICON[f.severity]
        const t = TONE[f.severity]
        return (
          <div className="finding" key={i}>
            <div className="finding-icon" style={{ background: t.bg, color: t.fg }}>
              <Icon />
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="finding-title">{f.title}</div>
              <div className="finding-detail">{f.detail}</div>
              {f.batches?.length > 0 && onSelectBatch && (
                <div className="chips">
                  {f.batches.slice(0, 16).map((seq) => (
                    <button key={seq} className="chip" onClick={() => onSelectBatch(batches[seq - 1])} type="button">
                      B{seq}
                    </button>
                  ))}
                  {f.batches.length > 16 && <span className="faint" style={{ fontSize: 11 }}>+{f.batches.length - 16}</span>}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
