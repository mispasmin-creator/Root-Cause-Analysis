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
  fn('search_orders', 'Find production orders by DO number, product, party or job card. Returns a short list with links.', {
    query: str('Text to search: DO number (DO-539), product (ZIRCAST 85), party name, JC number. null = all.'),
    firm: str('PMMPL, RKL or PURAB. null = all firms.'),
    severity: { type: ['string', 'null'], enum: ['major', 'minor', 'ok', 'none', null], description: 'Filter by overall batch status. null = any.' },
    sort: { type: ['string', 'null'], enum: ['recent', 'shift', 'batches', 'unreviewed', null], description: 'recent (default), highest mix shift, most batches, most unreviewed major.' },
    limit: int('Max rows (default 10, max 25).'),
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
      limit: int('Max rows for list sections (default 10, max 25).'),
    },
  ),
  fn('material_stats', 'How often raw materials are off their composition % across all batches (deviation rate, bias, substitutions).', {
    name: str('Material name to look up (partial match). null = top materials by deviation.'),
    limit: int('Max rows (default 10, max 25).'),
  }),
]
