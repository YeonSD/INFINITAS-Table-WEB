import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadLocalEnv } from './env-utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
loadLocalEnv(ROOT);
const SEED_PATH = path.join(ROOT, 'supabase', 'seeds', 'chart_metadata.seed.json');
const OUTPUT_DIR = path.join(ROOT, 'assets', 'data');
const SNAPSHOT_PATH = path.join(OUTPUT_DIR, 'app-snapshot.json');
const VERSION_PATH = path.join(OUTPUT_DIR, 'snapshot-version.json');
const args = new Set(process.argv.slice(2));
const sourceMode = args.has('--source') ? process.argv[process.argv.indexOf('--source') + 1] : 'seed';

function titleKey(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[’`]/gu, "'")
    .replace(/\s+/gu, ' ')
    .trim();
}

function chartDataFromRow(row) {
  return {
    title: row.song_title,
    type: row.chart_type,
    implicitType: false,
    bpm: row.bpm || '',
    atwikiNotes: Number(row.note_count || 0),
    typeInfo: row.type_info || row.radar_top || '',
    radar: {
      NOTES: Number(row.radar_notes || 0),
      PEAK: Number(row.radar_peak || 0),
      SCRATCH: Number(row.radar_scratch || 0),
      SOFLAN: Number(row.radar_soflan || 0),
      CHARGE: Number(row.radar_charge || 0),
      CHORD: Number(row.radar_chord || 0)
    },
    radarTop: row.radar_top || ''
  };
}

function buildSnapshot(rows) {
  const rankTables = {};
  const songRadarCatalogMap = new Map();
  rows
    .filter((row) => row && row.is_deleted !== true)
    .forEach((row) => {
      const tableKey = String(row.table_key || '').trim();
      if (!tableKey) return;
      if (!rankTables[tableKey]) {
        rankTables[tableKey] = {
          tableinfo: { title: row.table_title || tableKey },
          categories: []
        };
      }
      const categoryName = String(row.category || '').trim() || '미분류';
      let category = rankTables[tableKey].categories.find((item) => item.category === categoryName);
      if (!category) {
        category = {
          category: categoryName,
          sortindex: Number(row.source_sort_index || 999),
          items: []
        };
        rankTables[tableKey].categories.push(category);
      }
      category.items.push({ data: chartDataFromRow(row) });

      const radarKey = `${titleKey(row.song_title)}|${String(row.chart_type || '').trim().toUpperCase()}`;
      if (!songRadarCatalogMap.has(radarKey)) {
        songRadarCatalogMap.set(radarKey, {
          title: row.song_title,
          type: String(row.chart_type || '').trim().toUpperCase(),
          notes: Number(row.note_count || 0),
          radar: {
            NOTES: Number(row.radar_notes || 0),
            PEAK: Number(row.radar_peak || 0),
            SCRATCH: Number(row.radar_scratch || 0),
            SOFLAN: Number(row.radar_soflan || 0),
            CHARGE: Number(row.radar_charge || 0),
            CHORD: Number(row.radar_chord || 0)
          },
          radarTop: row.radar_top || row.type_info || ''
        });
      }
    });

  Object.values(rankTables).forEach((table) => {
    table.categories.sort((a, b) => Number(a.sortindex || 999) - Number(b.sortindex || 999));
    table.categories.forEach((category) => {
      category.items.sort((a, b) => String(a?.data?.title || '').localeCompare(String(b?.data?.title || ''), 'ko'));
    });
  });

  return {
    publishedAt: new Date().toISOString(),
    rankTables,
    songRadarCatalog: {
      charts: [...songRadarCatalogMap.values()]
    }
  };
}

async function loadRowsFromSupabase() {
  const baseUrl = process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const pageSize = 1000;
  if (!baseUrl || !serviceRole) {
    throw new Error('SUPABASE_URL (or PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY are required for --source supabase');
  }
  const select = [
    'chart_key',
    'table_key',
    'table_title',
    'level',
    'song_title',
    'normalized_title',
    'chart_type',
    'category',
    'source_sort_index',
    'classification_status',
    'bpm',
    'note_count',
    'type_info',
    'radar_notes',
    'radar_peak',
    'radar_scratch',
    'radar_soflan',
    'radar_charge',
    'radar_chord',
    'radar_top',
    'is_deleted'
  ].join(',');
  const rows = [];

  for (let offset = 0; ; offset += pageSize) {
    const url = new URL(`${baseUrl}/rest/v1/chart_metadata`);
    url.searchParams.set('select', select);
    url.searchParams.set('is_deleted', 'eq.false');
    url.searchParams.set('order', 'table_key.asc,source_sort_index.asc,song_title.asc,chart_type.asc');
    url.searchParams.set('limit', String(pageSize));
    url.searchParams.set('offset', String(offset));

    const response = await fetch(url, {
      headers: {
        apikey: serviceRole,
        Authorization: `Bearer ${serviceRole}`
      }
    });
    if (!response.ok) {
      throw new Error(`Supabase snapshot fetch failed: ${response.status} ${await response.text()}`);
    }

    const batch = await response.json();
    rows.push(...batch);
    if (batch.length < pageSize) {
      break;
    }
  }

  return rows;
}

async function loadRows() {
  if (sourceMode === 'supabase') {
    return await loadRowsFromSupabase();
  }
  if (!fs.existsSync(SEED_PATH)) {
    throw new Error(`seed file missing: ${SEED_PATH}`);
  }
  const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
  return Array.isArray(seed?.charts) ? seed.charts : [];
}

const rows = await loadRows();
const snapshot = buildSnapshot(rows);
const payload = JSON.stringify(snapshot, null, 2);
const hash = crypto.createHash('sha1').update(payload).digest('hex').slice(0, 12);
const version = `${snapshot.publishedAt.replace(/[-:.TZ]/g, '').slice(0, 14)}-${hash}`;
fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify({ ...snapshot, version }, null, 2));
fs.writeFileSync(VERSION_PATH, JSON.stringify({
  version,
  publishedAt: snapshot.publishedAt,
  snapshotPath: './assets/data/app-snapshot.json'
}, null, 2));
console.log(`Wrote snapshot ${version} to ${SNAPSHOT_PATH}`);
