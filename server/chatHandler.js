// RCA chatbot — server side. Runs ONLY on the server (Vite dev middleware locally, /api/chat on Vercel).
// Holds the OpenAI key, model, instructions and tool list; the browser can only send the user's text or
// tool results. Tools themselves run in the browser on the already-loaded, firm-filtered RCA model
// (src/lib/chatTools.js) — this file never reads production data except the login check.
//
// Wire protocol (POST /api/chat, JSON body → NDJSON stream back):
//   body  { user: {id, username}, previous_response_id?, message?: string, tool_outputs?: [{call_id, output}] }
//   lines { type: 'delta', text } | { type: 'tool_calls', response_id, calls: [{call_id, name, arguments}] }
//         | { type: 'done', response_id } | { type: 'error', message }

import { TOOL_DEFS } from './chatTools.schema.js'

const OPENAI_URL = 'https://api.openai.com/v1/responses'
// generous ceiling so summaries / reports are never cut; the instructions keep normal answers short
const MAX_OUTPUT_TOKENS = 8000
const MAX_MESSAGE_CHARS = 2000

const INSTRUCTIONS = `You are the assistant inside "Root Cause Analysis", an internal app of Passary (refractory / castable manufacturer).
The app compares every production batch's actual raw-material mix with the lab's approved composition (CN-###) and tracks
lab results, cost, profit and delivery.

Language: reply in the SAME language and script as the user's latest message.
- English question → answer in English.
- Hinglish (Hindi words in Roman script, e.g. "DO-539 me kya badla?") → answer in Hinglish, Roman script only.
- Hindi in Devanagari (e.g. "DO-539 में क्या बदला?") → answer in Hindi (Devanagari).
Keep DO numbers, JC numbers, material names, units and ₹ figures exactly as the tools return them, in every language.
Length — match what the user asked for:
- Quick question → short and scannable: 2-6 bullets or a small table, key numbers in bold.
- "summary", "report", "detail", "explain", "analysis", "overview" → a complete structured answer: short headings,
  the key numbers, top issues / causes, and 2-4 recommended actions. Call as many tools as needed to cover it.
- When the user asks for a list, give the full list they asked for (up to ~50 rows in a table); for more rows, or
  whenever they say export / download / Excel / CSV / sheet, call export_data and tell them the file is ready below.
- Never stop mid-sentence; if the topic is very large, summarise and offer an export or a follow-up question.

Data rules:
- Every number, order, batch, material or person you mention MUST come from a tool result in this conversation. Never guess.
- If the tools don't have it, say clearly that this data is not in the app (in the user's language) and suggest where to look.
- Use the fewest tool rounds: pick the most specific tool first and call independent tools together in one turn.
  If the user names a DO and a batch/JC, call get_batch directly (it already includes the composition, changes, lab and cost);
  use get_order only for order-level questions. Prefer search_orders when the user gives a product or party instead of a DO.
- When a tool returns "link", add it as a markdown link, e.g. [Open DO-539](/orders/p373) (link text in the user's language). Only use links returned by tools.
- Money: totals in ₹ lakh/crore (₹1.79 L, ₹9.89 Cr); per-MT rates in full rupees (₹54,028/MT). Deviation is in "pp".

Glossary (explain in simple words when relevant):
- Composition / standard = recipe the lab approved (raw material + %). Batch = one production entry (job card, JC-###).
- Mix shift % = how much of the batch mix differs from the composition (0 = same, 100 = nothing common).
- Status: OK (within ±1 pp), Minor (1-3 pp), Major (>3 pp), "Not in std" = material used but not in composition,
  "Skipped" = material in composition but not used. Material substitution = one skipped + another added.
- Lab target = "Expected" values the lab typed while creating the composition; lab result = Lab Test 1/2.
- Cost errors: some batches have impossible saved cost and are excluded from profit figures.

Stay within this app's data (production, composition, batches, lab, cost, profit, delivery). Politely decline unrelated topics.`

/** Minimal login check against Production-FMS `login` (same table the app uses). */
async function verifyUser(user, env) {
  if (!user?.id || !user?.username) return false
  const base = String(env.VITE_PRODUCTION_SUPABASE_URL || '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
  const key = env.VITE_PRODUCTION_SUPABASE_ANON_KEY
  if (!base || !key) return true // cannot verify (misconfigured) — don't block local use
  const url = `${base}/rest/v1/login?select=ID&ID=eq.${encodeURIComponent(user.id)}&${encodeURIComponent('User name')}=ilike.${encodeURIComponent(user.username)}&limit=1`
  try {
    const r = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
    if (!r.ok) return false
    const rows = await r.json()
    return Array.isArray(rows) && rows.length > 0
  } catch {
    return false
  }
}

/**
 * @param body  parsed JSON request body
 * @param env   environment (process.env on Vercel, loadEnv() in Vite dev)
 * @param write (obj) => void — writes one NDJSON line to the client
 */
export async function handleChat(body, env, write) {
  const key = env.OPENAI_API_KEY
  const model = env.OPENAI_MODEL || 'gpt-6.1-sol'
  const effort = env.OPENAI_REASONING || 'low'
  if (!key) return write({ type: 'error', message: 'OPENAI_API_KEY is not set on the server (.env / Vercel env).' })

  if (!(await verifyUser(body?.user, env))) return write({ type: 'error', message: 'Could not verify your login — please log in again.' })

  // build input: either a new user message or the tool outputs for the previous response
  let input
  if (Array.isArray(body.tool_outputs) && body.tool_outputs.length) {
    if (!body.previous_response_id) return write({ type: 'error', message: 'previous_response_id missing' })
    input = body.tool_outputs.slice(0, 10).map((t) => ({
      type: 'function_call_output',
      call_id: String(t.call_id),
      output: String(t.output ?? '').slice(0, 60000),
    }))
  } else {
    const text = String(body.message ?? '').trim().slice(0, MAX_MESSAGE_CHARS)
    if (!text) return write({ type: 'error', message: 'Empty question' })
    input = [{ role: 'user', content: text }]
  }

  const payload = {
    model,
    instructions: INSTRUCTIONS,
    input,
    tools: TOOL_DEFS,
    reasoning: { effort },
    max_output_tokens: MAX_OUTPUT_TOKENS,
    stream: true,
  }
  if (body.previous_response_id) payload.previous_response_id = String(body.previous_response_id)

  let r
  try {
    r = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch (e) {
    return write({ type: 'error', message: `Could not reach OpenAI: ${e.message}` })
  }
  if (!r.ok) {
    let msg = `OpenAI error ${r.status}`
    try {
      msg += `: ${(await r.json()).error?.message || ''}`
    } catch {
      // ignore
    }
    return write({ type: 'error', message: msg })
  }

  // parse the SSE stream from OpenAI and forward only what the UI needs
  const calls = []
  let responseId = null
  let buf = ''
  const dec = new TextDecoder()
  for await (const chunk of r.body) {
    buf += dec.decode(chunk, { stream: true })
    let i
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const raw = buf.slice(0, i)
      buf = buf.slice(i + 2)
      const line = raw.split('\n').find((l) => l.startsWith('data: '))
      if (!line) continue
      let ev
      try {
        ev = JSON.parse(line.slice(6))
      } catch {
        continue
      }
      if (ev.type === 'response.created') responseId = ev.response?.id || responseId
      else if (ev.type === 'response.output_text.delta') write({ type: 'delta', text: ev.delta })
      else if (ev.type === 'response.output_item.done' && ev.item?.type === 'function_call')
        calls.push({ call_id: ev.item.call_id, name: ev.item.name, arguments: ev.item.arguments })
      else if (ev.type === 'response.completed') responseId = ev.response?.id || responseId
      else if (ev.type === 'response.failed' || ev.type === 'error')
        return write({ type: 'error', message: ev.response?.error?.message || ev.message || 'OpenAI response failed' })
      else if (ev.type === 'response.incomplete')
        write({ type: 'delta', text: '\n\n_(Answer was cut off because it was too long — try a narrower question.)_' })
    }
  }
  if (calls.length) write({ type: 'tool_calls', response_id: responseId, calls })
  else write({ type: 'done', response_id: responseId })
}

/** Node request → parsed JSON (Vercel may already have parsed it into req.body). */
export async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body
  let data = ''
  for await (const c of req) data += c
  try {
    return JSON.parse(data || '{}')
  } catch {
    return {}
  }
}

/** Shared Node (req, res) adapter used by both Vercel and the Vite dev server. */
export async function nodeChatHandler(req, res, env) {
  if (req.method !== 'POST') {
    res.statusCode = 405
    return res.end('POST only')
  }
  res.statusCode = 200
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('X-Accel-Buffering', 'no')
  const write = (obj) => res.write(`${JSON.stringify(obj)}\n`)
  try {
    await handleChat(await readJson(req), env, write)
  } catch (e) {
    write({ type: 'error', message: `Server error: ${e.message}` })
  }
  res.end()
}
