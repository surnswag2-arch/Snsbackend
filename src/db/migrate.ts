// Database migration runner — applies SQL migrations in order
// Run with: npx tsx src/db/migrate.ts

import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "migrations");

async function runMigrations() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables");
    process.exit(1);
  }

  // Get all .sql files sorted
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  console.log(`Found ${files.length} migrations to apply`);

  for (const file of files) {
    const filePath = join(MIGRATIONS_DIR, file);
    const sql = readFileSync(filePath, "utf-8");
    const fileName = file.replace(".sql", "");

    console.log(`Applying: ${fileName}...`);

    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ query: sql }),
    });

    if (!response.ok) {
      // Use the SQL endpoint directly (requires pg_execute or similar)
      console.warn(`[WARN] Could not apply ${fileName} via REST API.`);
      console.warn(`Apply manually via Supabase SQL Editor or psql.`);
      console.log(`--- ${fileName} ---`);
      console.log(sql.substring(0, 500) + "...");
      console.log(`--- end ---`);
    } else {
      console.log(`✓ ${fileName} applied`);
    }
  }

  console.log("\nMigration run complete.");
}

runMigrations().catch(console.error);
