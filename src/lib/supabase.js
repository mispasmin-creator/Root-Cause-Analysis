import { createClient } from '@supabase/supabase-js'

// .env URLs are stored as "https://<ref>.supabase.co/rest/v1/" — supabase-js wants the bare project URL.
const baseUrl = (url) => String(url || '').trim().replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')

const make = (url, key) =>
  url && key ? createClient(baseUrl(url), key, { auth: { persistSession: false } }) : null

/** Production-FMS — compositions, job cards, actual batches, login, rca_reviews (read + rca_reviews write) */
export const productionDb = make(
  import.meta.env.VITE_PRODUCTION_SUPABASE_URL,
  import.meta.env.VITE_PRODUCTION_SUPABASE_ANON_KEY,
)

/** Order / Dispatch system — ORDER RECEIPT (read only) */
export const orderDb = make(
  import.meta.env.VITE_ORDER_SUPABASE_URL,
  import.meta.env.VITE_ORDER_SUPABASE_ANON_KEY,
)

/** Purchase FMS — LIFT-ACCOUNTS (read only, reserved for RM-lot root causes) */
export const purchaseDb = make(
  import.meta.env.VITE_PURCHASE_SUPABASE_URL,
  import.meta.env.VITE_PURCHASE_SUPABASE_ANON_KEY,
)

export const TABLES = {
  production: 'production',
  compositions: 'costing_response',
  jobcards: 'jobcards',
  actuals: 'actual_production',
  login: 'login',
  kyc: 'kyc',
  reviews: 'rca_reviews',
  orderReceipt: 'ORDER RECEIPT',
}

/**
 * PostgREST caps responses at 1000 rows — page through with .range() until a short page comes back.
 * `build` receives a fresh query builder each time so filters can be re-applied.
 */
export async function fetchAll(client, table, build = (q) => q, pageSize = 1000) {
  if (!client) throw new Error(`Supabase client for "${table}" is not configured — check .env`)
  const rows = []
  for (let from = 0; ; from += pageSize) {
    // order by id so pages are stable while paging
    const { data, error } = await build(client.from(table).select('*').order('id')).range(from, from + pageSize - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...(data || []))
    if (!data || data.length < pageSize) break
  }
  return rows
}
