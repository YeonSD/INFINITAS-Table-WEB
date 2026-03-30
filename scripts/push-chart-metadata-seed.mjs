import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalEnv } from './env-utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
loadLocalEnv(ROOT);
const SEED_PATH = path.join(ROOT, 'supabase', 'seeds', 'chart_metadata.seed.json');

const args = new Set(process.argv.slice(2));
const batchSizeArgIndex = process.argv.indexOf('--batch-size');
const batchSize = batchSizeArgIndex >= 0 ? Number(process.argv[batchSizeArgIndex + 1]) : 250;
const baseUrl = process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!baseUrl || !serviceRole) {
  throw new Error('SUPABASE_URL (or PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY are required');
}

if (!Number.isInteger(batchSize) || batchSize <= 0) {
  throw new Error(`invalid batch size: ${batchSize}`);
}

if (!fs.existsSync(SEED_PATH)) {
  throw new Error(`seed file missing: ${SEED_PATH}`);
}

const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
const charts = Array.isArray(seed?.charts) ? seed.charts : [];

if (!charts.length) {
  console.log('No chart metadata rows found in seed.');
  process.exit(0);
}

async function upsertBatch(batch, batchIndex, totalBatches) {
  const url = new URL(`${baseUrl}/rest/v1/chart_metadata`);
  url.searchParams.set('on_conflict', 'chart_key');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify(batch)
  });

  if (!response.ok) {
    throw new Error(
      `Supabase upsert failed for batch ${batchIndex + 1}/${totalBatches}: ${response.status} ${await response.text()}`
    );
  }
}

const totalBatches = Math.ceil(charts.length / batchSize);

for (let batchIndex = 0; batchIndex < totalBatches; batchIndex += 1) {
  const start = batchIndex * batchSize;
  const batch = charts.slice(start, start + batchSize);
  await upsertBatch(batch, batchIndex, totalBatches);
  console.log(`Upserted batch ${batchIndex + 1}/${totalBatches} (${batch.length} rows)`);
}

console.log(`Upserted ${charts.length} chart metadata rows from ${SEED_PATH}`);
