import { connectDatabase } from './db.mjs';
import { createApp } from './app.mjs';
import path from 'node:path';
const db = await connectDatabase();
const app = createApp(db, { staticDir: path.resolve('dist') });
const port = Number(process.env.PORT || process.env.PLANS_PORT || 3001);
const host = process.env.PLANS_HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
const server = app.listen(
  port,
  host,
  () => console.log(`Plans d’actions : port ${port} /plans`),
);
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () =>
    server.close(async () => {
      await db.close();
      process.exit(0);
    }),
  );
