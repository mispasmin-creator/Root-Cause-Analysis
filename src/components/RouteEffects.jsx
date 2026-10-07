import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const TITLES = [
  [/^\/$/, 'Dashboard'],
  [/^\/orders\/[^/]+/, 'Order'],
  [/^\/orders/, 'Orders & Batches'],
  [/^\/compare/, 'Compare Batches'],
  [/^\/materials/, 'Raw Materials'],
  [/^\/login/, 'Sign in'],
]

/** Per-route side effects: scroll to top on a new page (not on filter/query changes) and set the tab title. */
export default function RouteEffects() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
    const t = TITLES.find(([re]) => re.test(pathname))?.[1] || 'Page not found'
    document.title = `${t} · Root Cause Analysis · Passary`
  }, [pathname])
  return null
}
