import 'dotenv/config';
import { Pool } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error('Neon is not configured — set DATABASE_URL in api/.env');
}

// One pool shared by every function module: each Pool keeps its own set of
// Neon connections, so a pool per file would multiply the connection count for
// no benefit. Neon's Pool takes a config object, unlike `pg`, which also
// accepts a bare connection string.
export const pool = new Pool({ connectionString: DATABASE_URL });
