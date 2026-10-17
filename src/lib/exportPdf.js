// PDF export for every table in the app. jsPDF + autotable are loaded on demand so they stay out of the main bundle.
// Two entry points:
//   exportDataPdf({ title, head, body, … })  – explicit rows (used by paginated tables, so ALL filtered rows are exported)
//   exportElementPdf(el, { title })           – scrapes the <table>s inside a card / page section (small, unpaginated tables)

const COMPANY = 'Passary'
const APP = 'Root Cause Analysis'

// Built-in PDF fonts are WinAnsi only — swap the few symbols the UI uses, drop anything else unprintable.
const SWAP = { '₹': 'Rs ', 'Δ': 'd', '→': '->', '←': '<-', '≥': '>=', '≤': '<=', '▲': '^', '▼': 'v', '‹': '<', '›': '>', '✓': 'OK', '✕': 'x', '−': '-', ' ': ' ' }
export function pdfText(v) {
  const s = v === null || v === undefined ? '' : String(v)
  return s
    .replace(/[₹Δ→←≥≤▲▼‹›✓✕− ]/g, (c) => SWAP[c])
    .replace(/[^\x20-\x7e\xa1-\xff–—‘’“”•…€™]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const slug = (s) => pdfText(s).replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'export'
const stamp = () => new Date().toISOString().slice(0, 10)
const spanOf = (r) => r.reduce((n, c) => n + (c?.colSpan || 1), 0)

/** Page format + orientation chosen from the column count so text never gets squeezed. */
function layoutFor(cols) {
  if (cols <= 6) return { format: 'a4', orientation: 'portrait', font: 9 }
  if (cols <= 11) return { format: 'a4', orientation: 'landscape', font: cols > 9 ? 7.5 : 8.5 }
  if (cols <= 18) return { format: 'a3', orientation: 'landscape', font: 7.5 }
  return { format: 'a3', orientation: 'landscape', font: 7, wide: true } // very wide matrices also split across pages horizontally
}

/**
 * sections: [{ heading?, head: [[cell]], body: [[cell]], foot?, align?: ['left'|'right'|'center'] }]
 * A cell is a string/number or { content, colSpan, rowSpan, halign }.
 */
async function render({ title, subtitle, filters = [], sections, filename }) {
  const [{ jsPDF }, at] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const autoTable = typeof at.default === 'function' ? at.default : at.default?.default || at.autoTable // CJS/ESM interop
  const widest = Math.max(1, ...sections.map((s) => Math.max(1, ...[...(s.head || []), ...s.body.slice(0, 50)].map(spanOf))))
  const lay = layoutFor(widest)
  const doc = new jsPDF({ orientation: lay.orientation, unit: 'pt', format: lay.format, compress: true })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 36
  const generated = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })

  const drawHeader = () => {
    doc.setFillColor(15, 76, 129)
    doc.rect(0, 0, W, 6, 'F')
    doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(20, 30, 45)
    doc.text(COMPANY, M, 28)
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(100, 110, 125)
    doc.text(APP, M, 39)
    doc.text(`Generated ${generated}`, W - M, 28, { align: 'right' })
    doc.setDrawColor(210, 215, 222).line(M, 46, W - M, 46)
  }

  // title block (first page only)
  drawHeader()
  let y = 66
  doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(20, 30, 45)
  const titleLines = doc.splitTextToSize(pdfText(title), W - 2 * M)
  doc.text(titleLines, M, y)
  y += titleLines.length * 17
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(100, 110, 125)
  const meta = [subtitle, ...filters.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`)].filter(Boolean).map(pdfText)
  if (meta.length) {
    const lines = doc.splitTextToSize(meta.join('   |   '), W - 2 * M)
    doc.text(lines, M, y)
    y += lines.length * 11
  }
  y += 8

  for (const s of sections) {
    if (s.heading) {
      if (y > H - 110) {
        doc.addPage()
        drawHeader()
        y = 66
      }
      doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(20, 30, 45)
      doc.text(pdfText(s.heading), M, y)
      y += 8
    }
    const cols = Math.max(1, ...[...(s.head || []), ...s.body].map(spanOf))
    const { font, wide } = layoutFor(cols)
    const fix = (c) => (c && typeof c === 'object' ? { ...c, content: pdfText(c.content) } : pdfText(c))
    const columnStyles = {}
    ;(s.align || []).forEach((a, i) => {
      if (a && a !== 'left') columnStyles[i] = { halign: a }
    })
    autoTable(doc, {
      startY: y,
      head: (s.head || []).map((r) => r.map(fix)),
      body: s.body.map((r) => r.map(fix)),
      foot: (s.foot || []).map((r) => r.map(fix)),
      showHead: 'everyPage', // table headings repeat on every page
      showFoot: 'lastPage',
      margin: { top: 60, left: M, right: M, bottom: 40 },
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: font, cellPadding: { top: 3.5, bottom: 3.5, left: 4, right: 4 }, overflow: 'linebreak', valign: 'middle', lineColor: [215, 220, 228], lineWidth: 0.4, textColor: [30, 40, 55] },
      headStyles: { fillColor: [15, 76, 129], textColor: 255, fontStyle: 'bold', halign: 'left' },
      footStyles: { fillColor: [238, 241, 246], textColor: [20, 30, 45], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [247, 249, 252] },
      columnStyles,
      rowPageBreak: 'avoid',
      horizontalPageBreak: !!wide,
      horizontalPageBreakRepeat: 0,
      didParseCell: (d) => {
        if (d.section !== 'body' && columnStyles[d.column.index]?.halign && d.cell.colSpan === 1) d.cell.styles.halign = columnStyles[d.column.index].halign
      },
      didDrawPage: (d) => {
        if (d.pageNumber > 1) drawHeader()
      },
    })
    y = doc.lastAutoTable.finalY + 22
    if (y > H - 80 && s !== sections[sections.length - 1]) {
      doc.addPage()
      drawHeader()
      y = 66
    }
  }

  // footer with page numbers (needs the final page count)
  const n = doc.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i)
    doc.setDrawColor(210, 215, 222).line(M, H - 28, W - M, H - 28)
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(120, 130, 145)
    doc.text(pdfText(title).slice(0, 90), M, H - 16)
    doc.text(`Page ${i} of ${n}`, W - M, H - 16, { align: 'right' })
  }
  doc.save(`${slug(filename || title)}-${stamp()}.pdf`)
}

/** Export explicit rows – pass the full filtered list, not the current page. */
export function exportDataPdf({ title, subtitle, filters, head, body, foot, align, filename }) {
  return render({ title, subtitle, filters, filename, sections: [{ head: [head], body, foot: foot ? [foot] : undefined, align }] })
}

const cellText = (el) => {
  const clone = el.cloneNode(true)
  clone.querySelectorAll('script,style,svg,.progress,.sevbar').forEach((n) => n.remove())
  clone.querySelectorAll('input,select,textarea').forEach((n) => n.replaceWith(document.createTextNode(n.value ?? '')))
  clone.querySelectorAll('br,div,p,li').forEach((n) => n.append(' '))
  return clone.textContent.replace(/\s+/g, ' ').trim()
}
const rowCells = (tr) =>
  [...tr.children].map((c) => ({
    content: cellText(c),
    colSpan: c.colSpan || 1,
    rowSpan: c.rowSpan || 1,
    halign: c.classList.contains('r') || c.style.textAlign === 'right' ? 'right' : undefined,
  }))

/** Read a rendered <table> into a PDF section. */
export function tableSection(table, heading) {
  const head = [...(table.tHead?.rows || [])].map(rowCells)
  const body = [...table.tBodies].flatMap((b) => [...b.rows]).map(rowCells)
  const foot = [...(table.tFoot?.rows || [])].map(rowCells)
  const align = []
  const ref = body[0] || head[head.length - 1] || []
  ref.forEach((c, i) => (align[i] = c.halign))
  return { heading, head, body, foot, align }
}

/** Export every table found inside `root` (a card/section). */
export function exportElementPdf(root, { title, subtitle, filters, filename } = {}) {
  const tables = [...root.querySelectorAll('table')].filter((t) => t.rows.length)
  if (!tables.length) return Promise.resolve(false)
  const headingOf = (t) => (t.closest('.card')?.querySelector('h2,h3')?.textContent || '').trim()
  const pdfTitle = title || headingOf(tables[0]) || document.title
  const sections = tables.map((t) => {
    const h = headingOf(t)
    return tableSection(t, h && h !== pdfTitle ? h : undefined)
  })
  return render({ title: pdfTitle, subtitle, filters, filename, sections })
}
