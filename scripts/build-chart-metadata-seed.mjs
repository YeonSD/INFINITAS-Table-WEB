import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chartKey, titleKey } from './chart-metadata-utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'supabase', 'source');
const SEED_DIR = path.join(ROOT, 'supabase', 'seeds');
const SOURCE_RANK_PATH = path.join(SOURCE_DIR, 'rankTablesCache.source.json');
const SOURCE_RADAR_PATH = path.join(SOURCE_DIR, 'song-radar-sp.source.csv');
const OUTPUT_PATH = path.join(SEED_DIR, 'chart_metadata.seed.json');

const RADAR_AXES = ['NOTES', 'PEAK', 'SCRATCH', 'SOFLAN', 'CHARGE', 'CHORD'];
const CATEGORY_UNCLASSIFIED = '\uBBF8\uBD84\uB958';
const CATEGORY_INFINITAS_ONLY = 'INFINITAS \uC804\uC6A9\uACE1';
const CATEGORY_GIRYOKU_S_PLUS = '\uC9C0\uB825S+';
const CATEGORY_GIRYOKU_B_PLUS = '\uC9C0\uB825B+';
const CATEGORY_GIRYOKU_B = '\uC9C0\uB825B';
const CATEGORY_GIRYOKU_C = '\uC9C0\uB825C';
const CATEGORY_GIRYOKU_A = '\uC9C0\uB825A';
const RELEASE_STATUS_LIVE = 'live';
const RELEASE_STATUS_PENDING = 'pending_release';
const MANUAL_CATEGORY_OVERRIDES = new Map([
  [chartKey('SP11H', 'ABSOLUTE (kors k Remix)', 'A'), { category: CATEGORY_UNCLASSIFIED, source_sort_index: 999, classification_status: 'uncategorized' }],
  [chartKey('SP11H', 'MA・TSU・RI', 'A'), { category: CATEGORY_UNCLASSIFIED, source_sort_index: 999, classification_status: 'uncategorized' }],
  [chartKey('SP12H', 'Chronoxia', 'A'), { category: CATEGORY_INFINITAS_ONLY, source_sort_index: 20, classification_status: 'classified' }],
  [chartKey('SP12H', '\u30dd\u30c1\u30b3\u306e\u5e78\u305b\u306a\u65e5\u5e38', 'A'), { category: CATEGORY_INFINITAS_ONLY, source_sort_index: 20, classification_status: 'classified' }],
  [chartKey('SP12H', 'If', 'L'), { category: CATEGORY_INFINITAS_ONLY, source_sort_index: 20, classification_status: 'classified' }],
  [chartKey('SP12H', 'Reflux', 'L'), { category: CATEGORY_INFINITAS_ONLY, source_sort_index: 20, classification_status: 'classified' }],
  [chartKey('SP12H', 'ACT\u00d8', 'A'), { category: CATEGORY_GIRYOKU_C, source_sort_index: 13, classification_status: 'classified' }],
  [chartKey('SP12H', '3y3s(Long ver.)', 'A'), { category: CATEGORY_GIRYOKU_S_PLUS, source_sort_index: 1, classification_status: 'classified' }],
  [chartKey('SP12H', 'Hollywood Galaxy(DJ NAGAI Remix)', 'A'), { category: CATEGORY_INFINITAS_ONLY, source_sort_index: 20, classification_status: 'classified' }],
  [chartKey('SP12H', '\u30d4\u30a2\u30ce\u5354\u594f\u66f2\u7b2c1\u756a\"\u880d\u706b\"', 'A'), { category: CATEGORY_GIRYOKU_A, source_sort_index: 7, classification_status: 'classified' }]
]);
const MANUAL_PENDING_RELEASE_ROWS = [
  {
    chart_key: chartKey('SP11H', 'BLUST OF WIND', 'L'),
    table_key: 'SP11H',
    table_title: 'IIDX INFINITAS SP \u260611 Hard Gauge Rank',
    level: 11,
    song_title: 'BLUST OF WIND',
    normalized_title: titleKey('BLUST OF WIND'),
    chart_type: 'L',
    category: '\uBBF8\uC815',
    source_sort_index: 0,
    classification_status: 'provisional',
    release_status: RELEASE_STATUS_PENDING,
    bpm: '145',
    note_count: 1335,
    type_info: 'CHORD',
    radar_notes: 0,
    radar_peak: 0,
    radar_scratch: 0,
    radar_soflan: 0,
    radar_charge: 0,
    radar_chord: 0,
    radar_top: 'CHORD',
    source: 'manual_pending_release_override',
    is_deleted: false
  },
  {
    chart_key: chartKey('SP11H', 'Buffalo', 'L'),
    table_key: 'SP11H',
    table_title: 'IIDX INFINITAS SP \u260611 Hard Gauge Rank',
    level: 11,
    song_title: 'Buffalo',
    normalized_title: titleKey('Buffalo'),
    chart_type: 'L',
    category: CATEGORY_GIRYOKU_B,
    source_sort_index: 7,
    classification_status: 'classified',
    release_status: RELEASE_STATUS_PENDING,
    bpm: '108',
    note_count: 1287,
    type_info: 'NOTES',
    radar_notes: 0,
    radar_peak: 0,
    radar_scratch: 0,
    radar_soflan: 0,
    radar_charge: 0,
    radar_chord: 0,
    radar_top: 'NOTES',
    source: 'manual_pending_release_override',
    is_deleted: false
  },
  {
    chart_key: chartKey('SP12H', 'Override', 'L'),
    table_key: 'SP12H',
    table_title: 'IIDX INFINITAS SP \u260612 Hard Gauge Rank',
    level: 12,
    song_title: 'Override',
    normalized_title: titleKey('Override'),
    chart_type: 'L',
    category: '\uC9C0\uB825S',
    source_sort_index: 3,
    classification_status: 'classified',
    release_status: RELEASE_STATUS_PENDING,
    bpm: '175',
    note_count: 2204,
    type_info: 'CHORD',
    radar_notes: 0,
    radar_peak: 0,
    radar_scratch: 0,
    radar_soflan: 0,
    radar_charge: 0,
    radar_chord: 0,
    radar_top: 'CHORD',
    source: 'manual_pending_release_override',
    is_deleted: false
  },
  {
    chart_key: chartKey('SP12H', '\u304a\u7c73\u306e\u7f8e\u5473\u3057\u3044\u708a\u304d\u65b9\u3001\u305d\u3057\u3066\u304a\u7c73\u3092\u98df\u3079\u308b\u3053\u3068\u306b\u3088\u308b\u305d\u306e\u52b9\u679c\u3002', 'L'),
    table_key: 'SP12H',
    table_title: 'IIDX INFINITAS SP \u260612 Hard Gauge Rank',
    level: 12,
    song_title: '\u304a\u7c73\u306e\u7f8e\u5473\u3057\u3044\u708a\u304d\u65b9\u3001\u305d\u3057\u3066\u304a\u7c73\u3092\u98df\u3079\u308b\u3053\u3068\u306b\u3088\u308b\u305d\u306e\u52b9\u679c\u3002',
    normalized_title: titleKey('\u304a\u7c73\u306e\u7f8e\u5473\u3057\u3044\u708a\u304d\u65b9\u3001\u305d\u3057\u3066\u304a\u7c73\u3092\u98df\u3079\u308b\u3053\u3068\u306b\u3088\u308b\u305d\u306e\u52b9\u679c\u3002'),
    chart_type: 'L',
    category: '\uBBF8\uC815',
    source_sort_index: 0,
    classification_status: 'provisional',
    release_status: RELEASE_STATUS_PENDING,
    bpm: '',
    note_count: 1907,
    type_info: 'NOTES',
    radar_notes: 0,
    radar_peak: 0,
    radar_scratch: 0,
    radar_soflan: 0,
    radar_charge: 0,
    radar_chord: 0,
    radar_top: 'NOTES',
    source: 'manual_pending_release_override',
    is_deleted: false
  }
];

function parseCsvLine(line) {
  const out = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === ',') {
      out.push(current);
      current = '';
    } else if (ch === '"') {
      inQuotes = true;
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out;
}

function mapCsvChartType(chartName, chartIndexRaw) {
  const name = String(chartName || '').trim().toUpperCase();
  const match = name.match(/^SP([BNHAL])$/);
  if (match) return match[1];
  const index = Number(chartIndexRaw);
  if (index === 0) return 'B';
  if (index === 1) return 'N';
  if (index === 2) return 'H';
  if (index === 3) return 'A';
  if (index === 4) return 'L';
  return '';
}

function toRadarScale100(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(200, Math.round(n * 10000) / 100);
}

function dominantAxis(radar) {
  let bestAxis = '';
  let bestValue = -1;
  for (const axis of RADAR_AXES) {
    const v = Number(radar?.[axis] || 0);
    if (v > bestValue) {
      bestValue = v;
      bestAxis = axis;
    }
  }
  return bestAxis;
}

function inferClassificationStatus(category) {
  const name = String(category || '').trim();
  if (/\uBBF8\uC815/i.test(name)) return 'provisional';
  if (/\uBBF8\uBD84\uB958/i.test(name)) return 'uncategorized';
  return 'classified';
}

function buildRadarRowsFromCsv(csvText) {
  const lines = String(csvText || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/g)
    .filter((line) => line.trim().length > 0);
  if (!lines.length) return [];
  const header = parseCsvLine(lines[0]).map((value) => String(value || '').trim());
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    const raw = {};
    header.forEach((key, index) => {
      raw[key] = String(cols[index] || '').trim();
    });
    const type = mapCsvChartType(raw.chart_name || raw.chart, raw.chart_index);
    if (!['H', 'A', 'L'].includes(type)) continue;
    const level = Number(raw.level || raw.rating);
    if (![10, 11, 12].includes(level)) continue;
    const tableKey = `SP${level}H`;
    const title = String(raw.title_ascii || raw.title || '').normalize('NFKC').trim();
    if (!title) continue;
    const radar = {
      NOTES: toRadarScale100(raw.radar_notes),
      PEAK: toRadarScale100(raw.radar_peak),
      SCRATCH: toRadarScale100(raw.radar_scratch),
      SOFLAN: toRadarScale100(raw.radar_soflan),
      CHARGE: toRadarScale100(raw.radar_charge),
      CHORD: toRadarScale100(raw.radar_chord)
    };
    rows.push({
      chart_key: chartKey(tableKey, title, type),
      table_key: tableKey,
      table_title: `IIDX INFINITAS SP \u2606${level} Hard Gauge Rank`,
      level,
      song_title: title,
      normalized_title: titleKey(title),
      chart_type: type,
      category: CATEGORY_UNCLASSIFIED,
      source_sort_index: 999,
      classification_status: 'uncategorized',
      bpm: '',
      note_count: Number(String(raw.note_count || '').replace(/[^\d]/g, '')) || 0,
      type_info: dominantAxis(radar),
      radar_notes: radar.NOTES,
      radar_peak: radar.PEAK,
      radar_scratch: radar.SCRATCH,
      radar_soflan: radar.SOFLAN,
      radar_charge: radar.CHARGE,
      radar_chord: radar.CHORD,
      radar_top: dominantAxis(radar),
      source: 'song-radar-sp.source.csv',
      release_status: RELEASE_STATUS_LIVE,
      is_deleted: false
    });
  }
  return rows;
}

function overlayRankTables(rows, rankTablesPayload) {
  const tables = rankTablesPayload?.tables || {};
  const rowMap = new Map(rows.map((row) => [row.chart_key, row]));
  Object.entries(tables).forEach(([tableKey, table]) => {
    (table?.categories || []).forEach((category) => {
      (category?.items || []).forEach((item) => {
        const data = item?.data || {};
        const title = String(data.title || '').trim();
        const type = String(data.type || '').trim().toUpperCase();
        if (!title || !['H', 'A', 'L'].includes(type)) return;
        const key = chartKey(tableKey, title, type);
        const existing = rowMap.get(key);
        if (!existing) return;
        const radar = data.radar || {};
        rowMap.set(key, {
          chart_key: key,
          table_key: tableKey,
          table_title: table?.tableinfo?.title || existing.table_title || tableKey,
          level: Number(/^SP(\d+)H$/i.exec(tableKey)?.[1] || existing.level || 0),
          // Keep the radar CSV title as the canonical display string.
          song_title: existing.song_title || title,
          normalized_title: existing.normalized_title || titleKey(existing.song_title || title),
          chart_type: type,
          category: String(category.category || '').trim() || CATEGORY_UNCLASSIFIED,
          source_sort_index: Number(category.sortindex || existing.source_sort_index || 999),
          classification_status: inferClassificationStatus(category.category),
          bpm: String(data.bpm || existing.bpm || ''),
          note_count: Number(data.atwikiNotes || data.notes || existing.note_count || 0),
          type_info: String(data.typeInfo || existing.type_info || dominantAxis(radar)),
          radar_notes: Number(radar.NOTES || existing.radar_notes || 0),
          radar_peak: Number(radar.PEAK || existing.radar_peak || 0),
          radar_scratch: Number(radar.SCRATCH || existing.radar_scratch || 0),
          radar_soflan: Number(radar.SOFLAN || existing.radar_soflan || 0),
          radar_charge: Number(radar.CHARGE || existing.radar_charge || 0),
          radar_chord: Number(radar.CHORD || existing.radar_chord || 0),
          radar_top: String(data.radarTop || existing.radar_top || dominantAxis(radar)),
          source: 'rankTablesCache.source.json',
          release_status: existing.release_status || RELEASE_STATUS_LIVE,
          is_deleted: false
        });
      });
    });
  });
  return [...rowMap.values()];
}

function applyManualOverrides(rows) {
  const mappedRows = rows.map((row) => {
    const override = MANUAL_CATEGORY_OVERRIDES.get(row.chart_key);
    if (!override) {
      return {
        ...row,
        release_status: row.release_status || RELEASE_STATUS_LIVE
      };
    }
    return {
      ...row,
      ...override,
      release_status: row.release_status || RELEASE_STATUS_LIVE,
      source: 'manual_chart_metadata_override'
    };
  });
  const rowMap = new Map(mappedRows.map((row) => [row.chart_key, row]));
  MANUAL_PENDING_RELEASE_ROWS.forEach((row) => {
    rowMap.set(row.chart_key, row);
  });
  return [...rowMap.values()];
}

function sortRows(rows) {
  return [...rows].sort((a, b) => {
    if (a.table_key !== b.table_key) return a.table_key.localeCompare(b.table_key);
    if (Number(a.source_sort_index || 999) !== Number(b.source_sort_index || 999)) {
      return Number(a.source_sort_index || 999) - Number(b.source_sort_index || 999);
    }
    const titleDiff = String(a.song_title || '').localeCompare(String(b.song_title || ''), 'ko');
    if (titleDiff !== 0) return titleDiff;
    return String(a.chart_type || '').localeCompare(String(b.chart_type || ''));
  });
}

if (!fs.existsSync(SOURCE_RANK_PATH) || !fs.existsSync(SOURCE_RADAR_PATH)) {
  throw new Error('source files missing: expected supabase/source/rankTablesCache.source.json and song-radar-sp.source.csv');
}

const rankTablesPayload = JSON.parse(fs.readFileSync(SOURCE_RANK_PATH, 'utf8'));
const csvText = fs.readFileSync(SOURCE_RADAR_PATH, 'utf8');
const mergedRows = sortRows(
  applyManualOverrides(
    overlayRankTables(buildRadarRowsFromCsv(csvText), rankTablesPayload)
  )
);
fs.mkdirSync(SEED_DIR, { recursive: true });
fs.writeFileSync(OUTPUT_PATH, JSON.stringify({
  generatedAt: new Date().toISOString(),
  rowCount: mergedRows.length,
  charts: mergedRows
}, null, 2));
console.log(`Wrote ${mergedRows.length} chart metadata rows to ${OUTPUT_PATH}`);
