import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
const TITLE_CHAR_FOLD_MAP = new Map([
  ['\u00f8', 'o'],
  ['\u00d8', 'o'],
  ['\u00e6', 'ae'],
  ['\u00c6', 'ae'],
  ['\u0153', 'oe'],
  ['\u0152', 'oe'],
  ['\u00df', 'ss'],
  ['\u00f0', 'd'],
  ['\u00d0', 'd'],
  ['\u0111', 'd'],
  ['\u0110', 'd'],
  ['\u0142', 'l'],
  ['\u0141', 'l'],
  ['\u00fe', 'th'],
  ['\u00de', 'th']
]);

function titleKey(value) {
  const normalized = String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u2018\u2019\u0060\u00b4]/gu, "'")
    .replace(/[\u201c\u201d\u301d\u301e\uff02]/gu, '"')
    .replace(/\ufe0f/gu, '')
    .replace(/[\u2661\u2665\u2764]/gu, '')
    .replace(/[\u2020\u2021]/gu, '')
    .replace(/\uff01/gu, '!')
    .replace(/\uff1f/gu, '?')
    .replace(/[\u301c\uff5e]/gu, '~')
    .replace(/\s*~\s*/gu, '~')
    .replace(/\s*\(\s*/gu, '(')
    .replace(/\s*\)\s*/gu, ')')
    .replace(/\.\s+/gu, '.')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/\u00a0/gu, ' ');
  return [...normalized]
    .map((ch) => TITLE_CHAR_FOLD_MAP.get(ch) || ch)
    .join('')
    .replace(/\s+/gu, ' ')
    .trim();
}

function chartKey(tableKey, title, type) {
  return `${tableKey}|${titleKey(title)}|${type}`;
}

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
          song_title: title,
          normalized_title: titleKey(title),
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
          is_deleted: false
        });
      });
    });
  });
  return [...rowMap.values()];
}

function applyManualOverrides(rows) {
  return rows.map((row) => {
    const override = MANUAL_CATEGORY_OVERRIDES.get(row.chart_key);
    if (!override) return row;
    return {
      ...row,
      ...override,
      source: 'manual_chart_metadata_override'
    };
  });
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
