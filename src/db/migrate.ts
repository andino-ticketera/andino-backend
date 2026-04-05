import { runMigrations } from './schema.js';
import pool from './pool.js';

async function main(): Promise<void> {
  try {
    await runMigrations();
    console.log('[migrate] Completado');
  } catch (err) {
    console.error('[migrate] Error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
