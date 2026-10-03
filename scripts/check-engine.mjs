import fs from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
// Usage: npm run check  — loads live data via REST and runs the RCA engine (read-only)
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(
  fs.readFileSync(path.join(APP, '.env'), 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)
const { buildModel } = await import(pathToFileURL(path.join(APP, 'src/lib/rca.js')).href)
const { DEFAULT_SETTINGS } = await import(pathToFileURL(path.join(APP, 'src/lib/settings.js')).href)

async function all(urlVar, keyVar, table) {
  const base = env[urlVar].replace(/\/rest\/v1\/?$/, '')
  const out = []
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${base}/rest/v1/${encodeURIComponent(table)}?select=*&order=id`, {
      headers: { apikey: env[keyVar], Authorization: `Bearer ${env[keyVar]}`, Range: `${from}-${from + 999}` },
    })
    const d = await r.json()
    if (!Array.isArray(d)) throw new Error(JSON.stringify(d))
    out.push(...d)
    if (d.length < 1000) break
  }
  return out
}
const P = ['VITE_PRODUCTION_SUPABASE_URL', 'VITE_PRODUCTION_SUPABASE_ANON_KEY']
const [production, compositions, jobcards, actuals, orderReceipts] = await Promise.all([
  all(...P, 'production'), all(...P, 'costing_response'), all(...P, 'jobcards'), all(...P, 'actual_production'),
  all('VITE_ORDER_SUPABASE_URL', 'VITE_ORDER_SUPABASE_ANON_KEY', 'ORDER RECEIPT'),
])
console.log('rows', production.length, compositions.length, jobcards.length, actuals.length, orderReceipts.length)
const t = Date.now()
const m = buildModel({ production, compositions, jobcards, actuals, orderReceipts, reviews: [] }, DEFAULT_SETTINGS)
console.log('built in', Date.now() - t, 'ms')
console.log('totals', m.totals)
const unlinked = m.orders.filter((o) => !o.productionId && o.batches.length)
console.log('unlinked orders with batches', unlinked.length, unlinked.slice(0, 5).map((o) => `${o.doNo}/${o.product}/${o.firm} (${o.batches.length})`))
const o = m.orders.find((x) => x.doNo === 'DO-539')
console.log('\nDO-539', o.product, 'comps', o.compositions.map((c) => c.no), 'batches', o.batches.length, 'severity', o.severity)
o.batches.forEach((b) => console.log(` B${b.seq} ${b.jobCard} ${b.severity} shift=${b.vsStandard?.shift.toFixed(1)} cov=${b.coverage?.toFixed(0)}`))
o.findings.forEach((f) => console.log(` [${f.severity}] ${f.title} :: ${f.detail}`))
console.log('\ntop materials', m.materials.slice(0, 5).map((x) => `${x.name} ${x.deviationRate.toFixed(0)}% of ${x.batches}`))
const multi = m.orders.filter((x) => x.compositions.length > 1).slice(0, 3)
multi.forEach((x) => console.log('multi-comp', x.doNo, x.product, x.compositions.map((c) => c.no)))
