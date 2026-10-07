import { PAGE_SIZES, pageWindow } from '../lib/pagination.js'

/** Footer for a paginated table. `pg` = return value of usePagination(). */
export default function Pagination({ pg, label = 'rows' }) {
  if (!pg.total) return null
  return (
    <div className="pager">
      <span className="faint">
        Showing <b className="num">{pg.start + 1}</b>–<b className="num">{pg.end}</b> of <b className="num">{pg.total}</b> {label}
      </span>
      <span className="spacer" />
      <label className="row faint" style={{ gap: 6, flexWrap: 'nowrap' }}>
        Rows per page
        <select className="select select-sm" value={pg.size} onChange={(e) => pg.setSize(Number(e.target.value))} aria-label="Rows per page">
          {PAGE_SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      {pg.pages > 1 && (
        <nav className="pager-pages" aria-label="Pagination">
          <button type="button" className="btn btn-sm" onClick={() => pg.setPage(pg.page - 1)} disabled={pg.page === 1} aria-label="Previous page">
            ‹ Prev
          </button>
          {pageWindow(pg.page, pg.pages).map((p, i) =>
            p === '…' ? (
              <span key={`e${i}`} className="faint">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                className={`btn btn-sm ${p === pg.page ? 'btn-primary' : ''}`}
                onClick={() => pg.setPage(p)}
                aria-current={p === pg.page ? 'page' : undefined}
              >
                {p}
              </button>
            ),
          )}
          <button type="button" className="btn btn-sm" onClick={() => pg.setPage(pg.page + 1)} disabled={pg.page === pg.pages} aria-label="Next page">
            Next ›
          </button>
        </nav>
      )}
    </div>
  )
}
