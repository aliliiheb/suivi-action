import { existsSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const config = '.env.plans.demo';
if (!existsSync(config))
  writeFileSync(
    config,
    `PLANS_DEMO_DIR=.plans-demo-data\nSESSION_SECRET=${randomBytes(48).toString('hex')}\nAPP_ORIGIN=http://localhost:3001\nADMIN_EMAIL=amel@example.test\nADMIN_PASSWORD=${randomBytes(18).toString('base64url')}\n`,
  );
process.loadEnvFile(config);
// Never direct the demonstration initializer towards a production connection.
if (process.env.DATABASE_URL || process.env.NODE_ENV === 'production')
  throw new Error('Retirez DATABASE_URL / NODE_ENV=production pour lancer la démonstration.');
if (!existsSync('.plans-demo-data')) {
  const initialized = spawnSync(
    process.execPath,
    ['--env-file=' + config, 'server/plans/setup.mjs', '--demo'],
    { stdio: 'inherit' },
  );
  if (initialized.status !== 0) process.exit(initialized.status || 1);
}
console.log(
  'Démonstration locale. Identifiants dans .env.plans.demo (ne pas partager ce fichier).',
);
await import('./start.mjs');
