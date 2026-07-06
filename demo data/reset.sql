-- Run in Supabase SQL Editor immediately before (and right after any dry-run before) recording.
-- Clears run history and any invoice_history rows accumulated from prior test/demo runs,
-- restoring the database to the same state as a fresh db/seed.sql load.

TRUNCATE pipeline_runs;
DELETE FROM invoice_history WHERE invoice_number != 'INV-7788';

-- Verify afterwards:
-- SELECT * FROM invoice_history;   -- should show exactly 1 row: Global Parts Co. / INV-7788
-- SELECT count(*) FROM pipeline_runs;   -- should be 0