import { useRef, useState } from 'react'
import { IconDownload } from './Icons.jsx'
import { exportDataPdf, exportElementPdf } from '../lib/exportPdf.js'

/**
 * "PDF" download button, styled like the existing CSV buttons.
 *  - `getData` → () => { head, body, foot?, align? }: exports exactly those rows (use for paginated / filtered tables so the whole list is exported).
 *  - otherwise the tables inside the closest `.card` (or `scope` selector) are read from the page.
 */
export default function PdfButton({ title, filename, getData, scope = '.card', subtitle, filters, disabled, small = true, label = 'PDF' }) {
  const ref = useRef(null)
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    try {
      if (getData) await exportDataPdf({ title, filename, subtitle, filters, ...getData() })
      else await exportElementPdf(ref.current.closest(scope) || document.body, { title, filename, subtitle, filters })
    } catch (e) {
      console.error('PDF export failed', e)
      alert('Could not create the PDF: ' + (e?.message || e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <button ref={ref} type="button" className={`btn ${small ? 'btn-sm' : ''}`} onClick={run} disabled={disabled || busy} title="Download as PDF">
      <IconDownload /> {busy ? 'Preparing…' : label}
    </button>
  )
}
