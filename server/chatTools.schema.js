// Tool definitions sent to OpenAI (Responses API function tools). The implementations live in
// src/lib/chatTools.js and run in the browser — keep names and parameters in sync with that file.
// All parameters are required (strict mode); "optional" ones accept null.

const str = (description) => ({ type: ['string', 'null'], description })
const int = (description) => ({ type: ['integer', 'null'], description })

const fn = (name, description, properties) => ({
  type: 'function',
  name,
  description,
  strict: true,
  parameters: { type: 'object', properties, required: Object.keys(properties), additionalProperties: false },
})

export const TOOL_DEFS = [
  fn('search_orders', 'Find production orders by DO number, customer PO number, product, party (customer) or job card. Returns a short list with links.', {
    query: str('Text to search: DO number (DO-539), PO number, product (ZIRCAST 85), party name, JC number. null = all.'),
    firm: str('PMMPL, RKL or PURAB. null = all firms.'),
    severity: { type: ['string', 'null'], enum: ['major', 'minor', 'ok', 'none', null], description: 'Filter by overall batch status. null = any.' },
    sort: { type: ['string', 'null'], enum: ['recent', 'shift', 'batches', 'unreviewed', null], description: 'recent (default), highest mix shift, most batches, most unreviewed major.' },
    limit: int('Max rows (default 10, max 50).'),
  }),
  fn(
    'get_order',
    'Full RCA of one order: composition(s), batch list with status and biggest change, root-cause findings, lab vs target summary, cost.',
    {
      do_no: { type: 'string', description: 'DO number, e.g. DO-539' },
      product: str('Product name if the DO has several products. null if unknown.'),
    },
  ),
  fn('get_batch', 'One batch in detail: material lines vs composition and vs previous batch, lab results vs target, cost, recorded root causes.', {
    do_no: { type: 'string', description: 'DO number' },
    batch: int('Batch number within the order (B5 → 5). null if job_card is given.'),
    job_card: str('Job card number, e.g. JC-668. null if batch is given.'),
    product: str('Product name if the DO has several products. null otherwise.'),
  }),
  fn('compare_batches', 'Compare the raw-material mix of two batches (can be from different orders of the same product).', {
    a_do_no: { type: 'string' },
    a_batch: { type: 'integer', description: 'Batch number in order A' },
    b_do_no: { type: 'string' },
    b_batch: { type: 'integer', description: 'Batch number in order B' },
    product: str('Product name if a DO has several products. null otherwise.'),
  }),
  fn(
    'business_summary',
    'Company-level figures. section: overview (KPIs), profit (sales/profit/margin/deviation loss), loss_orders, product_margin, lab_quality, monthly_trend, supervisors, firms, delivery (overdue orders), data_quality.',
    {
      section: {
        type: 'string',
        enum: ['overview', 'profit', 'loss_orders', 'product_margin', 'lab_quality', 'monthly_trend', 'supervisors', 'firms', 'delivery', 'data_quality'],
      },
      limit: int('Max rows for list sections (default 10, max 50).'),
    },
  ),
  fn('material_stats', 'How often raw materials are off their composition % across all batches (deviation rate, bias, substitutions).', {
    name: str('Material name to look up (partial match). null = top materials by deviation.'),
    limit: int('Max rows (default 10, max 50).'),
  }),
  fn(
    'export_data',
    `Create a downloadable Excel (default) or CSV file when the user asks to export / download / "excel" / "csv" / "sheet".
The file appears as a download button in the chat. Pick the dataset that matches the app view the user means:
- order_report: everything for one order (Production sheet, Batch matrix, Deviation, Batches, Lab report, Cost) — "full / complete / summary of all batches"
- production_sheet: the plant production sheet (compositions + production groups with remarks) — "production sheet", "groups"
- order_matrix: "all batches" / "batch data" / "batch matrix" of one order — materials × batches like the app, coloured by status
- batch_compare: two batches compared (do_no+batch vs b_do_no+b_batch) — Raw material | Base | Compare | Δ | Deviation | Status
- batch_lines: one batch vs its composition (same columns as batch_compare)
- order_lab: production & lab report sheet (row per batch, LAB TEST 1 / 2, target row, total); order_cost: cost per batch like the Cost tab
- order_batches: simple batch list; lab_results: long list of every lab result
- company-wide: orders, loss_orders, product_margin, monthly_trend, supervisors, firms, delivery_overdue, lab_by_test, materials, cost_errors`,
    {
      dataset: {
        type: 'string',
        enum: ['order_report', 'production_sheet', 'order_matrix', 'batch_compare', 'batch_lines', 'order_lab', 'order_cost', 'order_batches', 'lab_results', 'orders', 'loss_orders', 'product_margin', 'monthly_trend', 'supervisors', 'firms', 'delivery_overdue', 'lab_by_test', 'materials', 'cost_errors'],
      },
      format: { type: 'string', enum: ['xlsx', 'csv'], description: 'xlsx for Excel (default; keeps colours and multiple sheets), csv only when the user says CSV.' },
      do_no: str('DO number for order-level datasets (order A for batch_compare). null otherwise.'),
      product: str('Product if the DO has several products. null otherwise.'),
      batch: int('Batch number (A for batch_compare, or the batch for batch_lines). null otherwise.'),
      job_card: str('Job card instead of batch number. null otherwise.'),
      b_do_no: str('batch_compare: DO of batch B (null = same DO as A).'),
      b_batch: int('batch_compare: batch number B. null if b_job_card is given.'),
      b_job_card: str('batch_compare: job card of batch B. null if b_batch is given.'),
      query: str('Search text for orders (DO, PO, product, party) / materials. null = all.'),
      firm: str('PMMPL, RKL or PURAB filter. null = all.'),
      severity: { type: ['string', 'null'], enum: ['major', 'minor', 'ok', 'none', null], description: 'Order status filter for orders. null = any.' },
      filename: str('Short file name without extension. null = automatic.'),
    },
  ),
]
