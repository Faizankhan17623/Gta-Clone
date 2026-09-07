// Local development can use server/.env. Hosting-provided variables take
// precedence. Test processes opt out so they never contact real SMTP/Databases.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const filename = fileURLToPath(new URL('.env', import.meta.url));
if (process.env.ARENA_SKIP_DOTENV !== '1' && existsSync(filename)) {
  if (typeof process.loadEnvFile !== 'function') throw new Error('Local .env loading requires Node 20.12+');
  process.loadEnvFile(filename);
}
