import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { fetchAll, orderDb, productionDb, TABLES } from '../lib/supabase.js'
import { buildModel } from '../lib/rca.js'
import { DEFAULT_SETTINGS } from '../lib/settings.js'
import { userCanSeeFirm } from '../lib/normalize.js'
import { useAuth } from './AuthContext.jsx'

// One load of all source tables (~1.5k rows each) → in-memory model. See ARCHITECTURE.md §3.

const DataContext = createContext(null)

async function loadReviews() {
  const { data, error } = await productionDb.from(TABLES.reviews).select('*').order('created_at', { ascending: false })
  // PGRST205 / 42P01 = table not created yet → app works read-only until the migration is run
  if (error) return { available: false, rows: [], error: error.code === 'PGRST205' || error.code === '42P01' ? null : error.message }
  return { available: true, rows: data || [] }
}

export function DataProvider({ children }) {
  const { user } = useAuth()
  const [raw, setRaw] = useState(null)
  const [status, setStatus] = useState({ loading: true, error: null, loadedAt: null })
  const [reviews, setReviews] = useState({ available: false, rows: [] })
  // fixed analysis settings (no Settings page by user request) — change values in lib/settings.js
  const settings = DEFAULT_SETTINGS

  // fetch only — state is set after awaits, so it is safe to call from an effect
  const fetchData = useCallback(async () => {
    try {
      const [production, compositions, jobcards, actuals, kyc, orderReceipts, rv] = await Promise.all([
        fetchAll(productionDb, TABLES.production),
        fetchAll(productionDb, TABLES.compositions),
        fetchAll(productionDb, TABLES.jobcards),
        fetchAll(productionDb, TABLES.actuals),
        // RM rates (same source Production-FMS uses for expected/actual cost) — only for correcting kg entries
        fetchAll(productionDb, TABLES.kyc).catch(() => []),
        // ORDER RECEIPT is enrichment only — if the order DB is down, RCA still works
        fetchAll(orderDb, TABLES.orderReceipt, (q) => q.eq('check_delivery_in_stock_or_not', 'For Production Planning')).catch(
          () => [],
        ),
        loadReviews(),
      ])
      setRaw({ production, compositions, jobcards, actuals, kyc, orderReceipts })
      setReviews(rv)
      setStatus({ loading: false, error: null, loadedAt: new Date() })
    } catch (e) {
      setStatus({ loading: false, error: e.message || String(e), loadedAt: null })
    }
  }, [])

  // status starts as loading:true, so the first load needs no synchronous setState
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- async fetch from Supabase; state is set after await
    if (user) fetchData()
  }, [user, fetchData])

  const load = useCallback(() => {
    setStatus((s) => ({ ...s, loading: true, error: null }))
    return fetchData()
  }, [fetchData])

  const refreshReviews = useCallback(async () => setReviews(await loadReviews()), [])

  const model = useMemo(() => {
    if (!raw) return null
    const visible = (rows, firmCol) => rows.filter((r) => userCanSeeFirm(user, r[firmCol]))
    return buildModel(
      {
        production: visible(raw.production, 'Firm Name'),
        compositions: visible(raw.compositions, 'Firm Name'),
        jobcards: visible(raw.jobcards, 'Firm Name'),
        actuals: visible(raw.actuals, 'FIRM Name'),
        kyc: raw.kyc,
        orderReceipts: raw.orderReceipts,
        reviews: reviews.rows,
      },
      settings,
    )
  }, [raw, reviews.rows, settings, user])

  const value = useMemo(
    () => ({ model, status, reload: load, settings, reviews, refreshReviews }),
    [model, status, load, settings, reviews, refreshReviews],
  )
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

// eslint-disable-next-line react/only-export-components
export const useData = () => useContext(DataContext)
