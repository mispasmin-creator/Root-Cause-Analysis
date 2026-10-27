-- Root Cause Analysis — two more fields on the root-cause form (Batch drawer + R&D page "Failure & remarks").
-- Run ONCE in the Production-FMS Supabase project (ref bliuwvkdtvxmteyzuzds) → SQL editor, after 001.
-- Only ADDS columns to the app's own table rca_reviews. No DROP, no change to any Production-FMS table.
-- Running it twice is harmless ("if not exists").

alter table public.rca_reviews add column if not exists analytics_report text; -- what the data / lab analysis showed
alter table public.rca_reviews add column if not exists remarks text;          -- free remarks for the failed batch

-- make PostgREST see the new columns immediately
notify pgrst, 'reload schema';
