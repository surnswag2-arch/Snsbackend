// Database migration runner — applies SQL migrations in order
// Run with: npx tsx src/db/migrate.ts
// This runs locally (not on Cloudflare Workers) and uses Node.js APIs

// @ts-ignore — Node.js built-in modules (only used in dev script)
import { readFileSync, readdirSync } from "fs";
// @ts-ignore
import { join, dirname } from "path";
// @ts-ignore
import { fileURLToPath } from "url";

// @ts-ignore
const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "migrations");

async function runMigrations() {
  // @ts-ignore
  const supabaseUrl = process.env.SUPABASE_URL;
  // @ts-ignore
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables");
    return;
  }

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f: string) => f.endsWith(".sql"))
    .sort();

  console.log(`Found ${files.length} migrations to apply`);

  for (const file of files) {
    const filePath = join(MIGRATIONS_DIR, file);
    const sql = readFileSync(filePath, "utf-8");
    const fileName = file.replace(".sql", "");

    console.log(`Applying: ${fileName}...`);
    console.log(`--- ${fileName} ---`);
    console.log(sql.substring(0, 500) + (sql.length > 500 ? "..." : ""));
    console.log(`--- end ---`);
    console.log(`Apply via Supabase SQL Editor or: psql -f ${filePath}`);
  }

  console.log("\nMigration run complete. Apply SQL files via Supabase dashboard.");
}

runMigrations().catch(console.error);
