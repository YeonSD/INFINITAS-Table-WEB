import { CLEAR_SORT_ORDER } from './constants.js';
import { sortItems } from './data.js';
import { $, esc } from './utils.js';

let mobileRankScaleReady = false;
let lastMobileRankViewMode = 'normal';
const mobileRankScaleTimers = new Map();
const mobileRankObservedWidths = new WeakMap();

function syncMobileRankScale(viewMode = 'normal', areaId = 'exportArea') {
  if (areaId === 'exportArea') lastMobileRankViewMode = viewMode || lastMobileRankViewMode;
  const area = $(areaId);
  if (!area) return;
  if (typeof window === 'undefined') return;
  const isMobile = window.matchMedia?.('(max-width: 600px)').matches;
  if (!isMobile) {
    area.style.removeProperty('--mobile-rank-base-width');
    area.style.removeProperty('--mobile-rank-scale');
    area.style.marginBottom = '';
    return;
  }
  const host = area.closest('.peer-rank-viewport') || area.parentElement;
  const hostStyle = host ? window.getComputedStyle(host) : null;
  const horizontalPadding = hostStyle
    ? (parseFloat(hostStyle.paddingLeft) || 0) + (parseFloat(hostStyle.paddingRight) || 0)
    : 0;
  const available = Math.max(280, (host?.clientWidth || window.innerWidth) - horizontalPadding - 2);
  const baseWidth = viewMode === 'wide' ? 1260 : 1080;
  const scale = Math.min(1, available / baseWidth);
  area.style.setProperty('--mobile-rank-base-width', `${baseWidth}px`);
  area.style.setProperty('--mobile-rank-scale', scale.toFixed(4));
  requestAnimationFrame(() => {
    const naturalHeight = area.scrollHeight || area.offsetHeight || 0;
    area.style.marginBottom = naturalHeight > 0 ? `${Math.round(naturalHeight * (scale - 1))}px` : '';
  });
}

export function scheduleMobileRankScale(viewMode = 'normal', areaId = 'exportArea') {
  syncMobileRankScale(viewMode, areaId);
  if (typeof window === 'undefined') return;
  const previousTimer = mobileRankScaleTimers.get(areaId);
  if (previousTimer) window.clearTimeout(previousTimer);
  const run = () => syncMobileRankScale(viewMode, areaId);
  window.requestAnimationFrame(() => {
    run();
    window.requestAnimationFrame(run);
  });
  mobileRankScaleTimers.set(areaId, window.setTimeout(() => {
    run();
    mobileRankScaleTimers.delete(areaId);
  }, 180));
  document.fonts?.ready?.then(run).catch(() => {});
}

export function ensureMobileRankScaleResize() {
  if (mobileRankScaleReady) return;
  if (typeof window === 'undefined') return;
  window.addEventListener('resize', () => {
    scheduleMobileRankScale(lastMobileRankViewMode);
    const peerArea = $('peerRankExportArea');
    if (peerArea) scheduleMobileRankScale(peerArea.dataset.viewMode || 'normal', 'peerRankExportArea');
  });
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver((entries) => {
      const widthChanged = entries.some((entry) => {
        const width = entry.contentRect?.width || 0;
        const previous = mobileRankObservedWidths.get(entry.target);
        mobileRankObservedWidths.set(entry.target, width);
        return previous == null || Math.abs(previous - width) > 0.5;
      });
      if (!widthChanged) return;
      scheduleMobileRankScale(lastMobileRankViewMode);
      const peerArea = $('peerRankExportArea');
      if (peerArea) scheduleMobileRankScale(peerArea.dataset.viewMode || 'normal', 'peerRankExportArea');
    });
    const watchTargets = [...new Set([$('panel-rank'), $('exportArea')?.parentElement, $('peerRankDialog')].filter(Boolean))];
    watchTargets.forEach((target) => observer.observe(target));
  }
  mobileRankScaleReady = true;
}

function weight(s) {
  let w = 0;
  for (const c of String(s || '')) w += /[ -~]/.test(c) ? 1 : 2;
  return w;
}

function trunc(title, cols) {
  const max = cols >= 8 ? 18 : 24;
  if (weight(title) <= max) return title;
  let out = '';
  let w = 0;
  for (const c of title) {
    const cw = /[ -~]/.test(c) ? 1 : 2;
    if (w + cw > max - 3) break;
    out += c;
    w += cw;
  }
  return `${out}...`;
}

function chunk(list, size) {
  const rows = [];
  for (let i = 0; i < list.length; i += size) rows.push(list.slice(i, i + size));
  return rows;
}

function btnClass(c) {
  const cls = ['song-button', `diff-${c.type}`];
  if (c.isUnlocked === false) cls.push('locked-song');
  if (c.lamp === 'FC') cls.push('lamp-fc');
  else if (c.lamp === 'EX') cls.push('lamp-ex');
  else if (c.lamp === 'HC') cls.push('lamp-hc');
  else if (c.lamp === 'NORMAL') cls.push('lamp-normal');
  else if (c.lamp === 'EASY') cls.push('lamp-easy');
  else if (c.lamp === 'ASSIST') cls.push('lamp-assist');
  else if (c.lamp === 'F') cls.push('lamp-failed');
  return cls.join(' ');
}

function folderLampTier(items) {
  if (!items.length) return 'NOPLAY';
  let minV = 999;
  let minK = 'NOPLAY';
  items.forEach((i) => {
    const key = i.clearStatus || 'NOPLAY';
    const v = CLEAR_SORT_ORDER[key] ?? 0;
    if (v < minV) {
      minV = v;
      minK = key;
    }
  });
  return minK;
}

function folderLampColor(tier) {
  if (tier === 'FC') return '#63d7e8';
  if (tier === 'EXHARD') return '#f0ce00';
  if (tier === 'HARD') return '#f28a2f';
  if (tier === 'NORMAL') return '#88a0ce';
  if (tier === 'EASY') return '#98c56f';
  if (tier === 'ASSIST') return '#d6c4d1';
  if (tier === 'FAILED') return '#8a8a8a';
  return 'transparent';
}

export function rankTablesHtml({ view, activeTable, viewMode = 'normal', sortMode = 'name', searchQuery = '' }) {
  const cols = viewMode === 'wide' ? 8 : 6;
  const q = String(searchQuery || '').trim().toLowerCase();
  const isUncategorized = (name) => /미정|미분류/i.test(String(name || '').trim());
  const sp10OrderValue = (name) => {
    const n = Number(String(name || '').trim());
    return Number.isFinite(n) ? n : null;
  };
  const orderedCategories = [...(view?.categories || [])].sort((a, b) => {
    const aName = a?.name || '';
    const bName = b?.name || '';
    const aLast = isUncategorized(aName) ? 1 : 0;
    const bLast = isUncategorized(bName) ? 1 : 0;
    if (aLast !== bLast) return aLast - bLast;
    if (activeTable === 'SP10H') {
      const an = sp10OrderValue(aName);
      const bn = sp10OrderValue(bName);
      if (an !== null && bn !== null && an !== bn) return bn - an;
      if (an !== null && bn === null) return -1;
      if (an === null && bn !== null) return 1;
    }
    return Number(a?.sortindex || 0) - Number(b?.sortindex || 0);
  });
  return orderedCategories.map((cat) => {
    const allItems = cat.items || [];
    const items = sortItems(allItems, sortMode).filter((item) => item.title.toLowerCase().includes(q));
    if (!items.length) return '';
    const rows = chunk(items, cols);
    const tier = folderLampTier(allItems);
    const color = folderLampColor(tier);
    return `<table class="category-table"><tbody>${rows.map((row, rowIndex) => `<tr>${rowIndex === 0 ? `<th class="category-label" style="--folder-lamp-color:${color}" rowspan="${rows.length}" title="폴더 최저 램프: ${esc(tier)}">${esc(cat.name)}</th>` : ''}${row.map((chart) => `<td class="song-cell"><button class="${btnClass(chart)}" data-chart-key="${esc(chart.key)}" title="${esc(chart.title)}"><span class="song-title">${esc(trunc(chart.title, cols))}</span>${chart.scoreTier ? `<span class="score-badge">${esc(chart.scoreTier)}</span>` : ''}</button></td>`).join('')}${Array.from({ length: Math.max(0, cols - row.length) }).map(() => '<td class="empty-cell"></td>').join('')}</tr>`).join('')}</tbody></table>`;
  }).join('');
}
