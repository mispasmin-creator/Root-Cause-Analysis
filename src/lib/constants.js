// Shared constants. Kept out of .jsx files so React fast-refresh works.

/** Page ids in Production-FMS login.Pages that grant access to this app (admins always allowed). */
export const ACCESS_PAGE_IDS = ['rca', 'root-cause', 'composition-qc']

/** Must match the CHECK constraint in supabase/migrations/001_rca_reviews.sql */
export const ROOT_CAUSE_CATEGORIES = [
  'Planned composition change',
  'Raw material shortage / substitution',
  'Raw material quality (lot variation)',
  'Weighing / measurement error',
  'Operator / process error',
  'Data entry error (unit / qty)',
  'Lab instruction',
  'Other',
]

export const SEVERITY_LABEL = {
  ok: 'OK',
  minor: 'Minor',
  major: 'Major',
  none: 'No batches',
  added: 'Not in std',
  missing: 'Skipped',
  critical: 'Critical',
  warning: 'Warning',
  info: 'Info',
}
