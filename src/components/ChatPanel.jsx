// Floating RCA chatbot. Talks to POST /api/chat (server/chatHandler.js) which holds the OpenAI key;
// tool calls are answered here from the in-memory, firm-filtered model (lib/chatTools.js).
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useData } from '../context/DataContext.jsx'
import { runTool, toolLabel } from '../lib/chatTools.js'
import { productionDb, TABLES } from '../lib/supabase.js'
import { IconX } from './Icons.jsx'

const MAX_TOOL_ROUNDS = 6

const newConversationId = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `c${Date.now()}${Math.random().toString(36).slice(2)}`)

/** Save one question + answer to rca_chat_logs (migration 002). Fire-and-forget: a missing table or network error
 *  must never affect the chat, so failures are only logged to the console. */
async function saveChatLog(row) {
  try {
    const { error } = await productionDb.from(TABLES.chatLogs).insert(row)
    if (error) console.warn('rca_chat_logs not saved:', error.message)
  } catch (e) {
    console.warn('rca_chat_logs not saved:', e.message)
  }
}

const SUGGESTIONS = [
  'What changed in batch 5 of DO-539?',
  'Which orders made the biggest loss?',
  'Which product has the lowest margin?',
  'Which lab test fails most often?',
  'Which orders are past their delivery date?',
]

/** POST to /api/chat and yield parsed NDJSON events. */
async function* chatRequest(body, signal) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok || !res.body) throw new Error(res.status === 404 ? 'Chat server not found (/api/chat).' : `Chat server error ${res.status}`)
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let i
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim()
      buf = buf.slice(i + 1)
      if (line) yield JSON.parse(line)
    }
  }
  if (buf.trim()) yield JSON.parse(buf)
}

// ---------------------------------------------------------------------------------------------
// tiny, safe markdown → React (bold, code, internal links, bullets, numbered lists, tables, headings)

function Inline({ text, onLink }) {
  const parts = []
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|_([^_]+)_/g
  let last = 0
  let m
  let k = 0
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    if (m[1]) parts.push(<b key={k++}>{m[1]}</b>)
    else if (m[2]) parts.push(<code key={k++}>{m[2]}</code>)
    else if (m[3]) {
      const href = m[4]
      // only in-app links are clickable; anything else is shown as text
      parts.push(
        href.startsWith('/') ? (
          <button key={k++} type="button" className="chat-link" onClick={() => onLink(href)}>
            {m[3]}
          </button>
        ) : (
          <span key={k++}>{m[3]}</span>
        ),
      )
    } else if (m[5]) parts.push(<i key={k++}>{m[5]}</i>)
    last = re.lastIndex
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

function Markdown({ text, onLink }) {
  const lines = text.replace(/\r/g, '').split('\n')
  const out = []
  let i = 0
  let k = 0
  while (i < lines.length) {
    const line = lines[i]
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const rows = []
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(lines[i++])
      const cells = rows.filter((r) => !/^\s*\|[\s:|-]+\|\s*$/.test(r)).map((r) => r.trim().slice(1, -1).split('|').map((c) => c.trim()))
      out.push(
        <div className="chat-table" key={k++}>
          <table>
            <tbody>
              {cells.map((row, ri) => (
                <tr key={ri}>
                  {row.map((c, ci) => (ri === 0 ? <th key={ci}><Inline text={c} onLink={onLink} /></th> : <td key={ci}><Inline text={c} onLink={onLink} /></td>))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      continue
    }
    if (/^\s*([-*•]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]/.test(line)
      const items = []
      while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*•]|\d+[.)])\s+/, ''))
      const L = ordered ? 'ol' : 'ul'
      out.push(
        <L key={k++}>
          {items.map((t, j) => (
            <li key={j}>
              <Inline text={t} onLink={onLink} />
            </li>
          ))}
        </L>,
      )
      continue
    }
    const h = line.match(/^#{1,4}\s+(.*)$/)
    if (h)
      out.push(
        <p key={k++} className="chat-h">
          <Inline text={h[1]} onLink={onLink} />
        </p>,
      )
    else if (line.trim())
      out.push(
        <p key={k++}>
          <Inline text={line} onLink={onLink} />
        </p>,
      )
    i++
  }
  return out
}

// ---------------------------------------------------------------------------------------------

export default function ChatPanel() {
  const { user } = useAuth()
  const { model, settings, status } = useData()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([]) // {role:'user'|'assistant', text, status?, error?}
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const prevId = useRef(null)
  const conversationId = useRef(newConversationId())
  const abort = useRef(null)
  const listRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages, open])
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const patchLast = (fn) =>
    setMessages((ms) => {
      const copy = ms.slice()
      copy[copy.length - 1] = fn({ ...copy[copy.length - 1] })
      return copy
    })

  const send = async (raw) => {
    const text = String(raw ?? input).trim()
    if (!text || busy || !model) return
    setInput('')
    setBusy(true)
    setMessages((ms) => [...ms, { role: 'user', text }, { role: 'assistant', text: '', status: 'Thinking…' }])
    const ctrl = new AbortController()
    abort.current = ctrl
    const ctx = { model, settings, todayMs: status.loadedAt?.getTime() ?? 0 }
    let body = { user: { id: user.id, username: user.username }, previous_response_id: prevId.current, message: text }
    // collected for the history row (rca_chat_logs)
    // oxlint-disable-next-line react/purity -- runs inside the send() event handler, not during render
    const startedAt = Date.now()
    const toolsUsed = []
    let answer = ''
    let logStatus = 'ok'
    let logError = null
    try {
      for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
        let next = null
        for await (const ev of chatRequest(body, ctrl.signal)) {
          if (ev.type === 'delta') {
            answer += ev.text
            patchLast((m) => ({ ...m, text: m.text + ev.text, status: null }))
          }
          else if (ev.type === 'error') throw new Error(ev.message)
          else if (ev.type === 'done') prevId.current = ev.response_id
          else if (ev.type === 'tool_calls') {
            if (round === MAX_TOOL_ROUNDS) throw new Error('Too many steps — please ask a more specific question.')
            const outputs = []
            for (const c of ev.calls) {
              let args = {}
              try {
                args = JSON.parse(c.arguments || '{}')
              } catch {
                // runTool reports the bad JSON back to the model
              }
              toolsUsed.push(c.name)
              patchLast((m) => ({ ...m, status: toolLabel(c.name, args) }))
              outputs.push({ call_id: c.call_id, output: runTool(c.name, c.arguments, ctx) })
            }
            patchLast((m) => ({ ...m, status: 'Writing the answer…' }))
            next = { user: body.user, previous_response_id: ev.response_id, tool_outputs: outputs }
          }
        }
        if (!next) break
        body = next
      }
      patchLast((m) => ({ ...m, status: null, text: m.text || '_(no answer received)_' }))
    } catch (e) {
      if (e.name === 'AbortError') {
        logStatus = 'stopped'
        patchLast((m) => ({ ...m, status: null, text: m.text || '_(stopped)_' }))
      } else {
        logStatus = 'error'
        logError = e.message
        patchLast((m) => ({ ...m, status: null, error: e.message }))
        prevId.current = null // start a fresh thread after an error
      }
    } finally {
      setBusy(false)
      abort.current = null
      saveChatLog({
        user_id: user.id ?? null,
        username: user.username ?? null,
        firm: user.firm || null,
        role: user.role || null,
        conversation_id: conversationId.current,
        question: text,
        answer: answer || null,
        tools_used: toolsUsed.length ? [...new Set(toolsUsed)] : null,
        status: logStatus,
        error: logError,
        duration_ms: Date.now() - startedAt,
        page: window.location.pathname + window.location.search,
      })
    }
  }

  const reset = () => {
    abort.current?.abort()
    prevId.current = null
    conversationId.current = newConversationId()
    setMessages([])
  }

  const goto = (href) => {
    navigate(href)
    if (window.matchMedia('(max-width: 640px)').matches) setOpen(false)
  }

  if (!user) return null

  return (
    <>
      {!open && (
        <button className="chat-fab" onClick={() => setOpen(true)} aria-label="Open RCA assistant" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span>Ask RCA</span>
        </button>
      )}
      {open && (
        <aside className="chat-panel" role="dialog" aria-label="RCA assistant">
          <div className="chat-head">
            <img src="/logo.png" alt="" className="brand-logo sm" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>RCA Assistant</div>
              <div className="faint" style={{ fontSize: 11 }}>
                Answers from this app’s data · check important numbers on the page
              </div>
            </div>
            {messages.length > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={reset} type="button" title="New chat">
                New
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} aria-label="Close" type="button">
              <IconX />
            </button>
          </div>

          <div className="chat-list" ref={listRef}>
            {messages.length === 0 && (
              <div className="chat-empty">
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Hi {user.username} 👋</div>
                <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
                  Ask anything about orders, batches, composition, lab, cost, profit or delivery — in English, Hinglish or Hindi.
                </div>
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="chat-suggest" onClick={() => send(s)} type="button" disabled={!model}>
                    {s}
                  </button>
                ))}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`chat-msg ${m.role}`}>
                {m.role === 'user' ? (
                  m.text
                ) : (
                  <>
                    {m.text && <Markdown text={m.text} onLink={goto} />}
                    {m.status && (
                      <div className="chat-status">
                        <span className="chat-dots">
                          <i />
                          <i />
                          <i />
                        </span>
                        {m.status}
                      </div>
                    )}
                    {m.error && <div className="chat-error">{m.error}</div>}
                  </>
                )}
              </div>
            ))}
          </div>

          <form
            className="chat-input"
            onSubmit={(e) => {
              e.preventDefault()
              send()
            }}
          >
            <textarea
              ref={inputRef}
              className="textarea"
              rows={1}
              placeholder={model ? 'Type your question… (Enter = send)' : 'Loading data…'}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              disabled={!model}
              aria-label="Question"
            />
            {busy ? (
              <button className="btn" type="button" onClick={() => abort.current?.abort()}>
                Stop
              </button>
            ) : (
              <button className="btn btn-primary" type="submit" disabled={!input.trim() || !model}>
                Send
              </button>
            )}
          </form>
        </aside>
      )}
    </>
  )
}
