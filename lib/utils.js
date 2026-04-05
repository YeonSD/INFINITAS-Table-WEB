import {
  DEFAULT_SOCIAL_SETTINGS,
  GOAL_RANK_ORDER,
  LAMP_ORDER,
  RADAR_ORDER,
  SOCIAL_SHARE_SCOPE_VALUES,
  TYPE_TO_PREFIX
} from './constants.js';

export const $ = (id) => document.getElementById(id);

export function esc(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function nowIso() {
  return new Date().toISOString();
}

export function fmt(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function normTitle(t) {
  return String(t || '').normalize('NFKC').replace(/[’`]/gu, "'").replace(/\s+/gu, ' ').trim().toLowerCase();
}

export function looseTitle(t) {
  return normTitle(t).replace(/[χΧ]/gu, 'x').replace(/[øØ∅]/gu, 'o').replace(/[^\p{L}\p{N}]/gu, '');
}

export function foldedAsciiTitle(t) {
  return normTitle(t)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ƒ/g, 'f')
    .replace(/[øØ∅]/g, 'o')
    .replace(/[æÆ]/g, 'ae')
    .replace(/[œŒ]/g, 'oe')
    .replace(/ß/g, 'ss')
    .replace(/[†☆★♪・]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export function aliasTitleCandidates(t) {
  const n = normTitle(t);
  return [...new Set([
    n,
    n.replace(/†/g, ''),
    n.replace(/ø/g, 'o'),
    n.replace(/æ/g, 'ae'),
    n.replace(/œ/g, 'oe'),
    n.replace(/[áàäâ]/g, 'a').replace(/[éèëê]/g, 'e').replace(/[íìïî]/g, 'i').replace(/[óòöô]/g, 'o').replace(/[úùüû]/g, 'u'),
    n.replace(/ƒ/g, 'f')
  ].filter(Boolean))];
}

export function titleKey(t) {
  return (normTitle(t) || `raw:${String(t || '').normalize('NFKC').toLowerCase()}`).replaceAll('|', '¦');
}

export function isValidInfinitasId(v) {
  return /^C-\d{4}-\d{4}-\d{4}$/.test(String(v || '')) && String(v || '') !== 'C-0000-0000-0000';
}

export function formatInfinitasIdDisplay(inputRaw) {
  const digits = String(inputRaw || '').replace(/\D/g, '').slice(0, 12);
  if (!digits) return '';
  if (digits.length <= 4) return `C-${digits}`;
  if (digits.length <= 8) return `C-${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `C-${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8, 12)}`;
}

export function normalizeInfinitasIdForSearch(inputRaw) {
  const digits = String(inputRaw || '').replace(/\D/g, '').slice(0, 12);
  if (digits.length !== 12) return '';
  return `C-${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8, 12)}`;
}

export function normalizeShareDataScope(values) {
  const input = Array.isArray(values) ? values : [];
  const picked = [...new Set(input.map((x) => String(x || '').trim().toLowerCase()).filter((x) => SOCIAL_SHARE_SCOPE_VALUES.includes(x)))];
  if (picked.includes('all')) return ['all', 'graphs', 'goals'];
  if (picked.includes('none')) return ['none'];
  const scoped = picked.filter((x) => x !== 'all' && x !== 'none');
  return scoped.length ? scoped : ['graphs', 'goals'];
}

export function normalizeSocialSettings(s) {
  const src = s && typeof s === 'object' ? s : {};
  const goalTransferPolicy = src.goalTransferPolicy === 'disabled' || src.goalTransferEnabled === false ? 'disabled' : 'mutual';
  return {
    discoverability: src.discoverability === 'hidden' ? 'hidden' : DEFAULT_SOCIAL_SETTINGS.discoverability,
    discoverByDjName: src.discoverByDjName !== false,
    followPolicy: ['auto', 'manual', 'disabled'].includes(src.followPolicy) ? src.followPolicy : DEFAULT_SOCIAL_SETTINGS.followPolicy,
    shareDataScope: normalizeShareDataScope(src.shareDataScope),
    goalTransferPolicy,
    goalTransferEnabled: goalTransferPolicy !== 'disabled',
    rivalPolicy: ['all', 'followers', 'disabled'].includes(src.rivalPolicy) ? src.rivalPolicy : DEFAULT_SOCIAL_SETTINGS.rivalPolicy,
    bannerDataUrl: typeof src.bannerDataUrl === 'string' ? src.bannerDataUrl : ''
  };
}

export function parseTsv(content) {
  const lines = String(content || '').split(/\r?\n/).filter((x) => x.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split('\t');
  return lines.slice(1).map((line) => {
    const cols = line.split('\t');
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? '';
    });
    return row;
  }).filter((r) => r.title);
}

export function rowsToTsv(rows) {
  if (!Array.isArray(rows) || !rows.length) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join('\t')];
  rows.forEach((row) => {
    lines.push(headers.map((h) => String(row[h] ?? '').replace(/\r?\n/g, ' ')).join('\t'));
  });
  return `${lines.join('\n')}\n`;
}

export function normalizeLamp(raw) {
  const v = String(raw || 'NP').trim().toUpperCase();
  const map = { NP: 'NP', NOPLAY: 'NP', F: 'F', FAILED: 'F', EX: 'EX', EXHARD: 'EX', HC: 'HC', HARD: 'HC', FC: 'FC', EASY: 'EASY', NORMAL: 'NORMAL' };
  return map[v] || 'NP';
}

export function clearStatus(lamp) {
  if (lamp === 'FC') return 'FC';
  if (lamp === 'EX') return 'EXHARD';
  if (lamp === 'HC') return 'HARD';
  if (lamp === 'NORMAL') return 'NORMAL';
  if (lamp === 'EASY') return 'EASY';
  if (lamp === 'F') return 'FAILED';
  return 'NOPLAY';
}

export function scoreTier(exScore, noteCount, lamp) {
  if (lamp === 'NP' || noteCount <= 0) return '';
  const rate = (exScore / (noteCount * 2)) * 100;
  if (rate >= 100) return 'MAX';
  if (rate >= 94.4444444444) return 'MAX-';
  if (rate >= 88.8888888888) return 'AAA';
  if (rate >= 77.7777777777) return 'AA';
  if (rate >= 66.6666666666) return 'A';
  if (rate >= 55.5555555555) return 'B';
  return '';
}

export function rowStats(row, type) {
  const p = TYPE_TO_PREFIX[type];
  if (!p || !row) return { lamp: 'NP', clearStatus: 'NOPLAY', exScore: 0, missCount: 0, noteCount: 0, rate: 0, scoreTier: '', unlocked: true };
  const rawUnlocked = String(row[`${p} Unlocked`] || '').trim().toUpperCase();
  const unlocked = rawUnlocked === '' ? true : rawUnlocked === 'TRUE';
  const lamp = normalizeLamp(row[`${p} Lamp`]);
  const ex = num(row[`${p} EX Score`]);
  const notes = num(row[`${p} Note Count`]);
  const miss = num(row[`${p} Miss Count`]);
  const rate = notes > 0 ? (ex / (notes * 2)) * 100 : 0;
  return { lamp, clearStatus: clearStatus(lamp), exScore: ex, missCount: miss, noteCount: notes, rate, scoreTier: scoreTier(ex, notes, lamp), unlocked };
}

export function buildRowIndex(rows) {
  const idx = new Map();
  const idxLoose = new Map();
  const idxAscii = new Map();
  const idxAliasLoose = new Map();
  (rows || []).forEach((r) => {
    const tk = titleKey(r.title);
    const lk = looseTitle(r.title);
    const ak = foldedAsciiTitle(r.title);
    if (tk && !idx.has(tk)) idx.set(tk, r);
    if (lk && !idxLoose.has(lk)) idxLoose.set(lk, r);
    if (ak && !idxAscii.has(ak)) idxAscii.set(ak, r);
    aliasTitleCandidates(r.title).forEach((a) => {
      const key = looseTitle(a);
      if (key && !idxAliasLoose.has(key)) idxAliasLoose.set(key, r);
    });
  });
  return { idx, idxLoose, idxAscii, idxAliasLoose };
}

export function findRowByTitle(indexes, title) {
  const tk = titleKey(title);
  const lk = looseTitle(title);
  const ak = foldedAsciiTitle(title);
  if (indexes.idx.get(tk)) return indexes.idx.get(tk);
  if (indexes.idxLoose.get(lk)) return indexes.idxLoose.get(lk);
  if (ak && indexes.idxAscii.get(ak)) return indexes.idxAscii.get(ak);
  for (const alias of aliasTitleCandidates(title)) {
    const key = looseTitle(alias);
    if (key && indexes.idxAliasLoose.get(key)) return indexes.idxAliasLoose.get(key);
  }
  return null;
}

export function normalizeRadarData(radar) {
  if (!radar || typeof radar !== 'object') return null;
  const out = {};
  let has = false;
  RADAR_ORDER.forEach((axis) => {
    const v = Number(radar[axis] || 0);
    out[axis] = Number.isFinite(v) ? v : 0;
    if (out[axis] > 0) has = true;
  });
  return has ? out : null;
}

export function radarScoreRatio(ex, full) {
  const exScore = Number(ex || 0);
  const maxScore = Number(full || 0);
  if (!Number.isFinite(exScore) || !Number.isFinite(maxScore) || maxScore <= 0) return 0;
  return exScore / maxScore;
}

export function truncate2(v) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? Math.floor(n * 100) / 100 : 0;
}

export function normalizeChartType(typeRaw) {
  const t = String(typeRaw || '').trim().toUpperCase();
  return ['N', 'H', 'A', 'L'].includes(t) ? t : 'A';
}

export function dominantRadarAxis(radar) {
  let bestAxis = '';
  let best = -1;
  RADAR_ORDER.forEach((axis) => {
    const v = Number(radar?.[axis] || 0);
    if (v > best) {
      best = v;
      bestAxis = axis;
    }
  });
  return bestAxis;
}

export function goalLabel(goal) {
  if (goal.kind === 'RATE') return `${String(Number(Math.max(0, Math.min(100, Number(goal.targetRate ?? 0))).toFixed(2))) || '0'}%`;
  if (goal.kind === 'SCORE') return `EX ${goal.targetScore}`;
  if (goal.kind === 'RANK') return goal.targetRank;
  return goal.targetLamp;
}

export function goalAchieved(goal, progress) {
  const row = progress[`${goal.table}|${titleKey(goal.title)}|${goal.chartType}`];
  if (!row) return false;
  if (goal.kind === 'RATE') return Number(row.rate ?? 0) >= Math.max(0, Math.min(100, Number(goal.targetRate ?? 0)));
  if (goal.kind === 'SCORE') return (row.exScore ?? 0) >= (goal.targetScore ?? 0);
  if (goal.kind === 'RANK') return (GOAL_RANK_ORDER[row.scoreTier] ?? 0) >= (GOAL_RANK_ORDER[goal.targetRank] ?? 0);
  return (LAMP_ORDER[row.lamp] ?? 0) >= (LAMP_ORDER[goal.targetLamp] ?? 0);
}

let showToastTimer = 0;

export function showToast(message) {
  const toast = $('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(showToastTimer);
  showToastTimer = window.setTimeout(() => toast.classList.add('hidden'), 2400);
}

export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
