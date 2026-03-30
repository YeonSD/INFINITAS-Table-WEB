import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalEnv, readRequiredEnv } from './env-utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const OUTPUT_PATH = path.join(ROOT, 'runtime-config.js');

loadLocalEnv(ROOT);

const runtimeConfig = {
  supabaseUrl: readRequiredEnv('PUBLIC_SUPABASE_URL', ['SUPABASE_URL']),
  supabasePublishableKey: readRequiredEnv('PUBLIC_SUPABASE_PUBLISHABLE_KEY')
};

const content = `window.__ITM_RUNTIME_CONFIG__ = ${JSON.stringify(runtimeConfig, null, 2)};\n`;
fs.writeFileSync(OUTPUT_PATH, content, 'utf8');
console.log(`Generated runtime config: ${OUTPUT_PATH}`);
