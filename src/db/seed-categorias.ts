import pool, { query } from "./pool.js";

const categoriasSeed = ["Musica en Vivo", "Fiestas", "Recreacion", "Danza"];

async function main(): Promise<void> {
  try {
    await query("BEGIN");

    for (const categoria of categoriasSeed) {
      await query(
        `INSERT INTO categorias (nombre)
         VALUES ($1)
         ON CONFLICT DO NOTHING`,
        [categoria],
      );
    }

    await query("COMMIT");
    console.log(
      `[seed:categorias] Seed completado con ${categoriasSeed.length} categorias`,
    );
  } catch (err) {
    await query("ROLLBACK");
    console.error("[seed:categorias] Error:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
