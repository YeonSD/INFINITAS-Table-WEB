import {
  CLEAR_SORT_ORDER,
  DEFAULT_SOCIAL_SETTINGS,
  GOAL_RANK_ORDER,
  RADAR_ORDER,
  SCORE_GRAPH_ORDER,
  SCORE_SUMMARY_ORDER
} from './constants.js';
import {
  aliasTitleCandidates,
  buildRowIndex,
  dominantRadarAxis,
  findRowByTitle,
  foldedAsciiTitle,
  goalAchieved,
  goalLabel,
  looseTitle,
  normalizeChartType,
  normalizeRadarData,
  normalizeSocialSettings,
  num,
  radarScoreRatio,
  rowStats,
  titleKey,
  truncate2
} from './utils.js';

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function isUncategorizedCategoryName(name) {
  return /\uBBF8\uC815|\uBBF8\uBD84\uB958/i.test(String(name || '').trim());
}

function mergeUncategorizedCategories(categories) {
  const kept = [];
  const mergedItems = [];
  let mergedSortIndex = 999;
  (categories || []).forEach((category) => {
    if (isUncategorizedCategoryName(category?.name)) {
      mergedItems.push(...(category?.items || []));
      mergedSortIndex = Math.max(mergedSortIndex, Number(category?.sortindex || 999));
      return;
    }
    kept.push(category);
  });
  if (mergedItems.length) {
    mergedItems.sort((a, b) => String(a?.title || '').localeCompare(String(b?.title || ''), 'ko'));
    kept.push({
      name: '\uBBF8\uC815 / \uBBF8\uBD84\uB958',
      sortindex: mergedSortIndex,
      items: mergedItems
    });
  }
  return kept;
}

function normalizeGoalSnapshot(rawGoal) {
  if (!rawGoal || typeof rawGoal !== 'object') return null;
  const table = String(rawGoal.table || '').trim();
  const title = String(rawGoal.title || '').trim();
  const chartType = normalizeChartType(rawGoal.chartType || rawGoal.type || 'A');
  const kind = String(rawGoal.kind || 'CLEAR').trim().toUpperCase();
  if (!table || !title || !['CLEAR', 'SCORE', 'RANK', 'RATE'].includes(kind)) return null;
  const snapshot = {
    id: String(rawGoal.id || '').trim(),
    table,
    title,
    chartType,
    kind,
    source: String(rawGoal.source || '').trim()
  };
  if (kind === 'SCORE') {
    snapshot.targetScore = Math.max(0, Number(rawGoal.targetScore || 0));
  } else if (kind === 'RATE') {
    snapshot.targetRate = Math.max(0, Math.min(100, Math.round(Number(rawGoal.targetRate || 0) * 100) / 100));
  } else if (kind === 'RANK') {
    snapshot.targetRank = String(rawGoal.targetRank || 'AA').trim().toUpperCase() || 'AA';
  } else {
    snapshot.targetLamp = String(rawGoal.targetLamp || 'HC').trim().toUpperCase() || 'HC';
  }
  return snapshot;
}

function normalizeBingoSize(rawSize) {
  const size = Number(rawSize || 3);
  return [3, 4, 5].includes(size) ? size : 3;
}

function createBingoCells(size) {
  return Array.from({ length: size * size }, () => null);
}

function normalizeBingoCells(rawCells, size) {
  const cells = Array.isArray(rawCells) ? rawCells.slice(0, size * size).map(normalizeGoalSnapshot) : [];
  while (cells.length < size * size) cells.push(null);
  return cells;
}

function normalizeBingoDraft(rawDraft) {
  const size = normalizeBingoSize(rawDraft?.size);
  return {
    size,
    cells: normalizeBingoCells(rawDraft?.cells, size),
    updatedAt: String(rawDraft?.updatedAt || '').trim()
  };
}

function normalizeBingoPublished(rawPublished) {
  if (!rawPublished || typeof rawPublished !== 'object') return null;
  const size = normalizeBingoSize(rawPublished.size);
  return {
    id: String(
      rawPublished.id
      || rawPublished.savedAt
      || `${String(rawPublished.name || 'bingo').trim()}-${size}`
    ).trim(),
    name: String(rawPublished.name || '').trim(),
    size,
    cells: normalizeBingoCells(rawPublished.cells, size),
    savedAt: String(rawPublished.savedAt || '').trim(),
    sharedFromUserId: String(rawPublished.sharedFromUserId || '').trim(),
    sharedFromDjName: String(rawPublished.sharedFromDjName || '').trim(),
    sharedFromInfinitasId: String(rawPublished.sharedFromInfinitasId || '').trim(),
    completionNotifiedAt: String(rawPublished.completionNotifiedAt || '').trim()
  };
}

export function createEmptyBingoState(size = 3) {
  const normalizedSize = normalizeBingoSize(size);
  return {
    draft: {
      size: normalizedSize,
      cells: createBingoCells(normalizedSize),
      updatedAt: ''
    },
    savedBoards: [],
    activeBoardId: '',
    published: null,
    selectedGoalId: '',
    selectedCellIndex: -1
  };
}

export function normalizeBingoState(rawState) {
  const src = rawState && typeof rawState === 'object' ? rawState : {};
  const draft = normalizeBingoDraft(src.draft);
  const rawSavedBoards = Array.isArray(src.savedBoards) ? src.savedBoards : [];
  const normalizedSavedBoards = rawSavedBoards
    .map(normalizeBingoPublished)
    .filter(Boolean)
    .slice(0, 5);
  const legacyPublished = normalizeBingoPublished(src.published);
  if (legacyPublished && !normalizedSavedBoards.some((board) => board.id === legacyPublished.id)) {
    normalizedSavedBoards.unshift(legacyPublished);
  }
  if (normalizedSavedBoards.length > 5) normalizedSavedBoards.length = 5;
  const hasActiveBoardId = Object.prototype.hasOwnProperty.call(src, 'activeBoardId');
  const activeBoardId = hasActiveBoardId
    ? String(src.activeBoardId || '').trim()
    : String(normalizedSavedBoards[0]?.id || '').trim();
  const activeBoard = activeBoardId
    ? normalizedSavedBoards.find((board) => board.id === activeBoardId) || null
    : null;
  return {
    draft,
    savedBoards: normalizedSavedBoards,
    activeBoardId: activeBoard?.id || '',
    published: activeBoard,
    selectedGoalId: String(src.selectedGoalId || '').trim(),
    selectedCellIndex: Number.isInteger(src.selectedCellIndex) ? src.selectedCellIndex : -1
  };
}

export function buildSongRadarCatalogIndex(catalog) {
  const idx = new Map();
  const idxLoose = new Map();
  const idxAscii = new Map();
  (catalog?.charts || []).forEach((row) => {
    const title = String(row?.title || '').trim();
    const type = String(row?.type || '').trim().toUpperCase();
    if (!title || !/^[BNHAL]$/.test(type)) return;
    idx.set(`${titleKey(title)}|${type}`, row);
    idxLoose.set(`${looseTitle(title)}|${type}`, row);
    idxAscii.set(`${foldedAsciiTitle(title)}|${type}`, row);
  });
  return { idx, idxLoose, idxAscii };
}

export function findSongRadarCatalogEntry(catalog, title, type) {
  const chartType = String(type || 'A').trim().toUpperCase();
  if (!catalog || !/^[BNHAL]$/.test(chartType)) return null;
  const indexes = catalog._indexes || (catalog._indexes = buildSongRadarCatalogIndex(catalog));
  return indexes.idx.get(`${titleKey(title)}|${chartType}`)
    || indexes.idxLoose.get(`${looseTitle(title)}|${chartType}`)
    || indexes.idxAscii.get(`${foldedAsciiTitle(title)}|${chartType}`)
    || null;
}

export function applySongRadarOverrides(baseCatalog, overrideData) {
  const catalog = { charts: Array.isArray(baseCatalog?.charts) ? cloneJson(baseCatalog.charts) : [] };
  const overrides = Array.isArray(overrideData?.charts) ? overrideData.charts : [];
  if (!overrides.length) return catalog;
  const byKey = new Map();
  catalog.charts.forEach((row, index) => {
    byKey.set(`${titleKey(row?.title || '')}|${String(row?.type || '').trim().toUpperCase()}`, index);
  });
  overrides.forEach((override) => {
    const title = String(override?.title || '').trim();
    const type = String(override?.type || '').trim().toUpperCase();
    if (!title || !/^[BNHAL]$/.test(type)) return;
    const key = `${titleKey(title)}|${type}`;
    const nextRow = {
      ...(catalog.charts[byKey.get(key)] || {}),
      ...(override && typeof override === 'object' ? cloneJson(override) : {}),
      title,
      type
    };
    if (byKey.has(key)) {
      catalog.charts[byKey.get(key)] = nextRow;
    } else {
      byKey.set(key, catalog.charts.length);
      catalog.charts.push(nextRow);
    }
  });
  return catalog;
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else if (ch === '"') {
      inQuotes = true;
    } else {
      cur += ch;
    }
  }
  out.push(cur);
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

function normalizeRadarTitle(title) {
  return String(title || '')
    .normalize('NFKC')
    .replace(/[’`]/gu, "'")
    .replace(/\s+/gu, ' ')
    .trim();
}

function toRadarScale100(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(200, Math.round(n * 10000) / 100);
}

export function buildSongRadarCatalogFromCsv(csvText) {
  const lines = String(csvText || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/g)
    .filter((line) => line.trim().length > 0);
  if (!lines.length) return { charts: [] };
  const header = parseCsvLine(lines[0]).map((value) => String(value || '').trim());
  if (!header.length) return { charts: [] };
  const charts = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    if (!cols.length) continue;
    const row = {};
    header.forEach((key, index) => {
      row[key] = String(cols[index] || '').trim();
    });
    const title = normalizeRadarTitle(row.title_ascii || row.title || '');
    const type = mapCsvChartType(row.chart_name || row.chart, row.chart_index);
    if (!title || !type) continue;
    const radar = {
      NOTES: toRadarScale100(row.radar_notes),
      PEAK: toRadarScale100(row.radar_peak),
      SCRATCH: toRadarScale100(row.radar_scratch),
      SOFLAN: toRadarScale100(row.radar_soflan),
      CHARGE: toRadarScale100(row.radar_charge),
      CHORD: toRadarScale100(row.radar_chord)
    };
    if (!RADAR_ORDER.some((axis) => Number(radar[axis] || 0) > 0)) continue;
    charts.push({
      title,
      type,
      notes: Number(String(row.note_count || '').replace(/[^\d]/g, '')) || 0,
      radar,
      radarTop: dominantRadarAxis(radar)
    });
  }
  return { charts };
}

export function applyRankTableOverrides(baseTables, overrideData) {
  const tables = cloneJson(baseTables || {}) || {};
  const overrides = Array.isArray(overrideData?.charts) ? overrideData.charts : [];
  if (!overrides.length) return tables;
  overrides.forEach((override) => {
    const table = String(override?.table || '').trim().toUpperCase();
    const title = String(override?.title || '').trim();
    const type = String(override?.type || '').trim().toUpperCase();
    const categoryName = String(override?.category || '').trim() || '\uBBF8\uBD84\uB958';
    if (!table || !title || !/^[HAL]$/.test(type) || !tables[table]) return;

    const categories = Array.isArray(tables[table].categories) ? tables[table].categories : [];
    let pulledItem = null;
    categories.forEach((category) => {
      category.items = (category.items || []).filter((item) => {
        const sameTitle = titleKey(item?.data?.title || '') === titleKey(title);
        const sameType = String(item?.data?.type || '').trim().toUpperCase() === type;
        if (sameTitle && sameType) pulledItem = pulledItem || cloneJson(item);
        return !(sameTitle && sameType);
      });
    });
    tables[table].categories = categories.filter((category) => (category.items || []).length > 0);
    if (override?.remove === true) return;

    let category = tables[table].categories.find((row) => String(row?.category || '').trim() === categoryName);
    if (!category) {
      category = {
        category: categoryName,
        sortindex: Number.isFinite(Number(override?.sortindex)) ? Number(override.sortindex) : 999,
        items: []
      };
      tables[table].categories.push(category);
    } else if (Number.isFinite(Number(override?.sortindex))) {
      category.sortindex = Number(override.sortindex);
    }

    const pulled = /** @type {any} */ (pulledItem);
    const pulledData = pulled?.data && typeof pulled.data === 'object'
      ? pulled.data
      : {};
    const data = {
      ...pulledData,
      ...(override?.data && typeof override.data === 'object' ? cloneJson(override.data) : {}),
      title,
      type
    };
    category.items.push({ data });
    category.items.sort((a, b) => String(a?.data?.title || '').localeCompare(String(b?.data?.title || ''), 'ko'));
    tables[table].categories.sort((a, b) => Number(a?.sortindex || 999) - Number(b?.sortindex || 999));
  });
  return tables;
}

export function buildViews(rankTables, songRadarCatalog, rows) {
  const hasTracker = (rows || []).length > 0;
  const rowIndex = buildRowIndex(rows || []);
  const views = {};
  Object.entries(rankTables || {}).forEach(([tableName, tableData]) => {
    const categories = [];
    const flatCharts = [];
    const seen = new Set();
    const matched = new Set();
    const levelMatch = /^SP(\d+)H$/i.exec(tableName);
    const expectedLevel = levelMatch ? Number(levelMatch[1]) : 0;

    (tableData.categories || []).forEach((category) => {
      const items = [];
      (category.items || []).forEach((item) => {
        const title = String(item?.data?.title || '').trim();
        const type = String(item?.data?.type || 'A').trim().toUpperCase();
        if (!title || !/^[HAL]$/.test(type)) return;
        const row = findRowByTitle(rowIndex, title);
        if (hasTracker && !row) return;
        if (hasTracker) {
          const prefix = type === 'H' ? 'SPH' : type === 'L' ? 'SPL' : 'SPA';
          const noteCount = num(row?.[`${prefix} Note Count`]);
          if (noteCount <= 0) return;
          const rating = num(row?.[`${prefix} Rating`]);
          if (expectedLevel > 0 && rating > 0 && rating !== expectedLevel) return;
        }

        const key = `${looseTitle(title) || titleKey(title)}|${type}`;
        if (seen.has(key)) return;
        seen.add(key);

        const stats = rowStats(row, type);
        const fallbackRadar = findSongRadarCatalogEntry(songRadarCatalog, title, type);
        const songData = item?.data || {};
        const chart = {
          key: `${tableName}|${titleKey(title)}|${type}`,
          tableName,
          category: category.category,
          title,
          type,
          ...stats,
          isUnlocked: stats.unlocked !== false,
          bpm: songData.bpm || '',
          metaNotes: Number(songData.atwikiNotes || songData.notes || fallbackRadar?.notes || stats.noteCount || 0),
          metaType: songData.typeInfo || fallbackRadar?.typeInfo || fallbackRadar?.radarTop || '',
          radar: songData.radar || fallbackRadar?.radar || null,
          radarTop: songData.radarTop || fallbackRadar?.radarTop || ''
        };
        items.push(chart);
        flatCharts.push(chart);
        if (row) matched.add(`${titleKey(row.title)}|${type}`);
      });
      categories.push({ name: category.category, sortindex: category.sortindex, items });
    });

    if (hasTracker && expectedLevel > 0) {
      const uncategorized = [];
      (rows || []).forEach((row) => {
        ['H', 'A', 'L'].forEach((type) => {
          const prefix = type === 'H' ? 'SPH' : type === 'L' ? 'SPL' : 'SPA';
          const noteCount = num(row?.[`${prefix} Note Count`]);
          if (noteCount <= 0) return;
          const rating = num(row?.[`${prefix} Rating`]);
          if (rating > 0 && rating !== expectedLevel) return;
          const key = `${titleKey(row.title)}|${type}`;
          if (matched.has(key)) return;
          const stats = rowStats(row, type);
          const fallbackRadar = findSongRadarCatalogEntry(songRadarCatalog, row.title, type);
          const chart = {
            key: `${tableName}|${titleKey(row.title)}|${type}`,
            tableName,
            category: '\uBBF8\uBD84\uB958',
            title: row.title,
            type,
            ...stats,
            isUnlocked: stats.unlocked !== false,
            bpm: '',
            metaNotes: Number(fallbackRadar?.notes || 0),
            metaType: fallbackRadar?.typeInfo || fallbackRadar?.radarTop || '',
            radar: fallbackRadar?.radar || null,
            radarTop: fallbackRadar?.radarTop || ''
          };
          uncategorized.push(chart);
        });
      });
      if (uncategorized.length) {
        uncategorized.sort((a, b) => a.title.localeCompare(b.title, 'ko'));
        categories.push({ name: '\uBBF8\uBD84\uB958', sortindex: 999, items: uncategorized });
        flatCharts.push(...uncategorized);
      }
    }

    views[tableName] = {
      title: tableData?.tableinfo?.title || tableName,
      categories: mergeUncategorizedCategories(categories),
      flatCharts
    };
  });
  return views;
}

export function progressMap(tableViews) {
  const map = {};
  Object.values(tableViews || {}).forEach((view) => {
    (view.flatCharts || []).forEach((chart) => {
      map[chart.key] = {
        tableName: chart.tableName,
        title: chart.title,
        type: chart.type,
        lamp: chart.lamp,
        clearStatus: chart.clearStatus,
        exScore: chart.exScore,
        scoreTier: chart.scoreTier
      };
    });
  });
  return map;
}

export function makeEvents(prev, curr, goals) {
  if (!prev) return { updates: ['최초 데이터 업로드'], goals: [] };
  const updates = [];
  Object.keys(curr).forEach((key) => {
    const before = prev[key] || { clearStatus: 'NOPLAY', exScore: 0 };
    const after = curr[key];
    if (before.clearStatus !== after.clearStatus) {
      updates.push({
        kind: 'lamp',
        table: after.tableName || key.split('|')[0] || 'SP12H',
        title: after.title,
        type: after.type,
        from: before.clearStatus || 'NOPLAY',
        to: after.clearStatus || 'NOPLAY'
      });
    }
    if ((before.exScore ?? 0) !== (after.exScore ?? 0)) {
      const diff = (after.exScore ?? 0) - (before.exScore ?? 0);
      updates.push({
        kind: 'score',
        table: after.tableName || key.split('|')[0] || 'SP12H',
        title: after.title,
        type: after.type,
        from: before.exScore ?? 0,
        to: after.exScore ?? 0,
        diff,
        rank: after.scoreTier || '-'
      });
    }
  });
  const goalEvents = [];
  (goals || []).forEach((goal) => {
    if (!goalAchieved(goal, prev) && goalAchieved(goal, curr)) {
      goalEvents.push({
        kind: 'goal',
        table: goal.table,
        title: goal.title,
        type: goal.chartType,
        text: `목표 달성: ${goal.table.replace('H', '')} ${goal.title} [${goal.chartType}] -> ${goalLabel(goal)}`
      });
    }
  });
  return {
    updates: updates.slice(0, 300),
    goals: goalEvents.slice(0, 120)
  };
}

function computeRadarProfileFromTableViews(tableViews) {
  const perSong = new Map();
  Object.values(tableViews || {}).forEach((view) => {
    (view?.flatCharts || []).forEach((chart) => {
      const radar = normalizeRadarData(chart.radar);
      if (!radar || !chart.title) return;
      if (Number(chart.noteCount || 0) <= 0 || Number(chart.exScore || 0) <= 0) return;
      const fullScore = Number(chart.noteCount || 0) * 2;
      if (fullScore <= 0) return;
      const ratio = radarScoreRatio(chart.exScore, fullScore);
      const songKey = titleKey(chart.title || '');
      const current = perSong.get(songKey) || {
        title: chart.title || '',
        axisType: {},
        NOTES: 0,
        PEAK: 0,
        SCRATCH: 0,
        SOFLAN: 0,
        CHARGE: 0,
        CHORD: 0
      };
      RADAR_ORDER.forEach((axis) => {
        const earned = truncate2(Number(radar[axis] || 0) * ratio);
        if (earned > current[axis]) {
          current[axis] = earned;
          current.axisType[axis] = normalizeChartType(chart.type || 'A');
        }
      });
      perSong.set(songKey, current);
    });
  });

  const songs = [...perSong.values()];
  const profile = { NOTES: 0, PEAK: 0, SCRATCH: 0, SOFLAN: 0, CHARGE: 0, CHORD: 0 };
  const rankings = {};
  RADAR_ORDER.forEach((axis) => {
    const topRows = songs
      .map((row) => ({
        title: String(row.title || '').trim(),
        type: normalizeChartType(row.axisType?.[axis] || 'A'),
        value: Number(row[axis] || 0)
      }))
      .filter((row) => row.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
    rankings[axis] = topRows;
    if (!topRows.length) {
      profile[axis] = 0;
      return;
    }
    const scaledSum = topRows.reduce((sum, row) => sum + Math.round(Number(row.value || 0) * 100), 0);
    profile[axis] = Math.floor(scaledSum / topRows.length) / 100;
  });
  const totalScaled = RADAR_ORDER.reduce((sum, axis) => sum + Math.round(Number(profile[axis] || 0) * 100), 0);
  const total = totalScaled / 100;
  return {
    radar: profile,
    total,
    dominantAxis: dominantRadarAxis(profile),
    rankings,
    songRows: songs
  };
}

export function computeRadarProfileFromRows(rows, rankTables, songRadarCatalog) {
  const tableViews = buildViews(rankTables, songRadarCatalog, rows);
  return computeRadarProfileFromTableViews(tableViews);
}

export function sortItems(items, sortMode) {
  const out = [...items];
  out.sort((a, b) => {
    const aUnlocked = a.isUnlocked === false ? 0 : 1;
    const bUnlocked = b.isUnlocked === false ? 0 : 1;
    if (aUnlocked !== bUnlocked) return bUnlocked - aUnlocked;
    if (sortMode === 'clear') {
      const lampDiff = (CLEAR_SORT_ORDER[b.clearStatus] ?? 0) - (CLEAR_SORT_ORDER[a.clearStatus] ?? 0);
      if (lampDiff !== 0) return lampDiff;
    }
    return a.title.localeCompare(b.title, 'ko');
  });
  return out;
}

export function graphSummary(view) {
  const clearOrder = ['FC', 'EXHARD', 'HARD', 'NORMAL', 'EASY', 'FAILED', 'NOPLAY'];
  const scoreCount = Object.fromEntries(SCORE_GRAPH_ORDER.map((key) => [key, 0]));
  const clearCount = Object.fromEntries(clearOrder.map((key) => [key, 0]));
  (view?.flatCharts || []).forEach((chart) => {
    clearCount[chart.clearStatus] = (clearCount[chart.clearStatus] || 0) + 1;
    if (!chart.scoreTier) scoreCount.NOPLAY += 1;
    else if (SCORE_GRAPH_ORDER.includes(chart.scoreTier)) scoreCount[chart.scoreTier] += 1;
  });
  return { clearOrder, clearCount, scoreCount, scoreOrder: SCORE_SUMMARY_ORDER };
}

export function emptyProfile(user, guestRows = []) {
  return {
    djName: (user?.email || 'DJ USER').split('@')[0],
    infinitasId: '',
    googleAuthUserId: user?.id || '',
    googleEmail: user?.email || '',
    iconDataUrl: '',
    trackerRows: guestRows,
    goals: [],
    history: [],
    lastProgress: null,
    uploadedTrackerName: '',
    socialSettings: normalizeSocialSettings(DEFAULT_SOCIAL_SETTINGS),
    bingoState: createEmptyBingoState()
  };
}

export function normalizeProfile(profileRow, stateRow, user) {
  const profile = profileRow || {};
  const accountState = stateRow || {};
  return {
    djName: profile.dj_name || (user?.email || 'DJ USER').split('@')[0],
    infinitasId: profile.infinitas_id || '',
    googleAuthUserId: user?.id || '',
    googleEmail: profile.google_email || user?.email || '',
    iconDataUrl: profile.icon_data_url || '',
    trackerRows: Array.isArray(accountState.tracker_rows) ? accountState.tracker_rows : [],
    goals: Array.isArray(accountState.goals) ? accountState.goals : [],
    history: Array.isArray(accountState.history) ? accountState.history : [],
    lastProgress: accountState.last_progress && typeof accountState.last_progress === 'object' ? accountState.last_progress : null,
    uploadedTrackerName: '',
    socialSettings: normalizeSocialSettings(accountState.social_settings || DEFAULT_SOCIAL_SETTINGS),
    bingoState: normalizeBingoState(accountState.bingo_state)
  };
}
