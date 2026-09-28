// One-shot additive migration: presence timestamp for the locations table.
// Safe to re-run (IF NOT EXISTS). Kept as the schema-change record for the
// api's first migration; run with: node migrations/001_add_last_shared.mjs
import { pool } from '../db.js';

await pool.query('ALTER TABLE locations ADD COLUMN IF NOT EXISTS last_shared TIMESTAMPTZ');
const cols = await pool.query(
  'SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position',
  ['locations']
);
console.table(cols.rows);
await pool.end();
