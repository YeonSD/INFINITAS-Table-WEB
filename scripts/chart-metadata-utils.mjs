import fs from 'node:fs';

export const TITLE_CHAR_FOLD_MAP = new Map([
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

export function titleKey(value) {
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

export function chartKey(tableKey, title, type) {
  return `${String(tableKey || '').trim()}|${titleKey(title)}|${String(type || '').trim().toUpperCase()}`;
}

export function readSeedCharts(seedPath) {
  if (!seedPath || !fs.existsSync(seedPath)) return [];
  const payload = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  return Array.isArray(payload?.charts) ? payload.charts : [];
}

function classificationScore(status) {
  const value = String(status || '').trim().toLowerCase();
  if (value === 'classified') return 30;
  if (value === 'provisional') return 20;
  return 0;
}

function sourceScore(source) {
  const value = String(source || '').trim();
  if (value === 'manual_chart_metadata_override') return 60;
  if (value === 'admin_update_chart_metadata_rpc') return 55;
  if (value === 'admin_chart_metadata_rpc') return 55;
  if (value === 'rankTablesCache.source.json') return 50;
  if (value === 'song-radar-sp.source.csv') return 40;
  return 0;
}

function rowScore(row, seedRow) {
  const radarScore = Number(row?.radar_notes || 0)
    + Number(row?.radar_peak || 0)
    + Number(row?.radar_scratch || 0)
    + Number(row?.radar_soflan || 0)
    + Number(row?.radar_charge || 0)
    + Number(row?.radar_chord || 0);
  return (seedRow && String(row?.song_title || '') === String(seedRow.song_title || '') ? 1000 : 0)
    + sourceScore(row?.source)
    + classificationScore(row?.classification_status)
    + (Number(row?.source_sort_index || 999) < 900 ? 10 : 0)
    + (Number(row?.note_count || 0) > 0 ? 5 : 0)
    + (radarScore > 0 ? 5 : 0);
}

export function canonicalizeChartMetadataRows(rows, options = {}) {
  const inputRows = Array.isArray(rows) ? rows : [];
  const seedCharts = Array.isArray(options.seedCharts) ? options.seedCharts : [];
  const restrictToSeed = options.restrictToSeed === true && seedCharts.length > 0;
  const seedMap = new Map(seedCharts.map((row) => [chartKey(row?.table_key, row?.song_title, row?.chart_type), row]));
  const deduped = new Map();

  inputRows.forEach((row) => {
    if (!row || row.is_deleted === true) return;
    const key = chartKey(row.table_key, row.song_title, row.chart_type);
    const seedRow = seedMap.get(key);
    if (restrictToSeed && !seedRow) return;
    const current = deduped.get(key);
    if (!current || rowScore(row, seedRow) > rowScore(current, seedRow)) {
      deduped.set(key, row);
    }
  });

  return [...deduped.entries()].map(([key, row]) => {
    const seedRow = seedMap.get(key);
    if (!seedRow) return row;
    return {
      ...row,
      song_title: seedRow.song_title,
      normalized_title: seedRow.normalized_title || titleKey(seedRow.song_title)
    };
  });
}
