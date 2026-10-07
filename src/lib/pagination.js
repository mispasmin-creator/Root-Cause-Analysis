// Shared pagination state. Page + page size live in the URL (?page=2&size=500) so refresh / share keeps them.
// `prefix` lets one page hold several independent tables (e.g. Dashboard: ?dpage=…).
import { useSearchParams } from 'react-router-dom'

export const PAGE_SIZES = [100, 500, 1000]
export const DEFAULT_PAGE_SIZE = 100

export function usePagination(total, prefix = '') {
  const [params, setParams] = useSearchParams()
  const pKey = `${prefix}page`
  const sKey = `${prefix}size`
  const rawSize = Number(params.get(sKey))
  const size = PAGE_SIZES.includes(rawSize) ? rawSize : DEFAULT_PAGE_SIZE
  const pages = Math.max(1, Math.ceil(total / size))
  // clamp: a filter change can shrink the list below the current page
  const page = Math.min(pages, Math.max(1, Math.floor(Number(params.get(pKey)) || 1)))
  const start = (page - 1) * size
  const end = Math.min(total, start + size)

  const update = (changes) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === undefined || v === '' || (k === pKey && v === 1) || (k === sKey && v === DEFAULT_PAGE_SIZE)) next.delete(k)
      else next.set(k, String(v))
    }
    setParams(next, { replace: true })
  }

  return {
    page,
    size,
    pages,
    start,
    end,
    total,
    setPage: (p) => update({ [pKey]: Math.min(pages, Math.max(1, p)) }),
    setSize: (s) => update({ [sKey]: s, [pKey]: 1 }),
    /** slice the list for the current page */
    slice: (list) => list.slice(start, end),
  }
}

/** Page numbers to show: 1 … 4 5 [6] 7 8 … 20 */
export function pageWindow(page, pages) {
  const set = new Set([1, pages, page - 1, page, page + 1])
  if (page <= 3) [2, 3, 4].forEach((p) => set.add(p))
  if (page >= pages - 2) [pages - 1, pages - 2, pages - 3].forEach((p) => set.add(p))
  const list = [...set].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b)
  const out = []
  list.forEach((p, i) => {
    if (i && p - list[i - 1] > 1) out.push('…')
    out.push(p)
  })
  return out
}
