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

function titleKey(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[’`]/gu, "'")
    .replace(/\s+/gu, ' ')
    .trim();
}

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
  if (/미정/i.test(name)) return 'provisional';
  if (/미분류/i.test(name)) return 'uncategorized';
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
      chart_key: `${tableKey}|${titleKey(title)}|${type}`,
      table_key: tableKey,
      table_title: `IIDX INFINITAS SP ☆${level} Hard Gauge Rank`,
      level,
      song_title: title,
      normalized_title: titleKey(title),
      chart_type: type,
      category: '미분류',
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
        const chartKey = `${tableKey}|${titleKey(title)}|${type}`;
        const existing = rowMap.get(chartKey);
        const radar = data.radar || {};
        const next = {
          chart_key: chartKey,
          table_key: tableKey,
          table_title: table?.tableinfo?.title || existing?.table_title || tableKey,
          level: Number(/^SP(\d+)H$/i.exec(tableKey)?.[1] || existing?.level || 0),
          song_title: title,
          normalized_title: titleKey(title),
          chart_type: type,
          category: String(category.category || '').trim() || '미분류',
          source_sort_index: Number(category.sortindex || existing?.source_sort_index || 999),
          classification_status: inferClassificationStatus(category.category),
          bpm: String(data.bpm || existing?.bpm || ''),
          note_count: Number(data.atwikiNotes || data.notes || existing?.note_count || 0),
          type_info: String(data.typeInfo || existing?.type_info || dominantAxis(radar)),
          radar_notes: Number(radar.NOTES || existing?.radar_notes || 0),
          radar_peak: Number(radar.PEAK || existing?.radar_peak || 0),
          radar_scratch: Number(radar.SCRATCH || existing?.radar_scratch || 0),
          radar_soflan: Number(radar.SOFLAN || existing?.radar_soflan || 0),
          radar_charge: Number(radar.CHARGE || existing?.radar_charge || 0),
          radar_chord: Number(radar.CHORD || existing?.radar_chord || 0),
          radar_top: String(data.radarTop || existing?.radar_top || dominantAxis(radar)),
          source: 'rankTablesCache.source.json',
          is_deleted: false
        };
        rowMap.set(chartKey, next);
      });
    });
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
const mergedRows = sortRows(overlayRankTables(buildRadarRowsFromCsv(csvText), rankTablesPayload));
fs.mkdirSync(SEED_DIR, { recursive: true });
fs.writeFileSync(OUTPUT_PATH, JSON.stringify({
  generatedAt: new Date().toISOString(),
  rowCount: mergedRows.length,
  charts: mergedRows
}, null, 2));
console.log(`Wrote ${mergedRows.length} chart metadata rows to ${OUTPUT_PATH}`);
