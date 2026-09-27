import { defineConfig } from 'drizzle-kit';

// Generates SQL migrations from src/db/schema.ts into src/db/migrations.
// The same generated SQL is applied by every driver (sql.js, tauri-plugin-sql).
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  strict: true,
});
