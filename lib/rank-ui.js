import { CLEAR_SORT_ORDER, DEFAULT_ICON_SRC, MEDAL_SRC } from './constants.js';
import { graphSummary, sortItems } from './data.js';
import { $, esc } from './utils.js';

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

function medalTierFor(view) {
  const charts = view?.flatCharts || [];
  if (!charts.length) return '';
  if (!charts.every((c) => c.clearStatus !== 'NOPLAY')) return '';
  if (charts.every((c) => c.clearStatus === 'FC')) return 'F';
  if (charts.every((c) => c.clearStatus === 'EXHARD' || c.clearStatus === 'FC')) return 'EX';
  if (charts.every((c) => ['HARD', 'EXHARD', 'FC'].includes(c.clearStatus))) return 'HARD';
  return 'ALL';
}

export function renderAccountInfo(ctx) {
  const { state, isAuthorized, currentTrackerLabel, iconSrc } = ctx;
  const versionBadge = $('appVersionBadge');
  const guestName = String(state.guest?.djName || '').trim() || 'GUEST';
  const guestId = String(state.guest?.infinitasId || '').trim() || 'C-0000-0000-0000';
  $('accountHeroIcon').src = iconSrc() || DEFAULT_ICON_SRC;
  $('tableMiniIcon').src = iconSrc() || DEFAULT_ICON_SRC;
  $('trackerPathLabel').textContent = currentTrackerLabel();
  $('accountGoogleBadge')?.classList.toggle('hidden', !state.auth.signedIn);

  if (isAuthorized()) {
    $('accountHeroName').textContent = state.profile.djName;
    $('accountHeroId').textContent = state.profile.infinitasId;
    $('tableMiniName').textContent = state.profile.djName;
    $('tableMiniId').textContent = state.profile.infinitasId;
    $('accountHeroAuthText').textContent = `${state.auth.user?.email || ''} / 히스토리, 빙고, 소셜, 설정 사용 가능`;
    $('btnHeroProfileEdit').textContent = '정보 변경';
    if (versionBadge) versionBadge.textContent = 'GOOGLE LINKED';
    $('googleAuthStatus').textContent = `Google 연동됨: ${state.auth.user?.email || ''}`;
    return;
  }

  if (state.auth.signedIn) {
    $('accountHeroName').textContent = 'PROFILE REQUIRED';
    $('accountHeroId').textContent = state.auth.user?.email || 'Google 로그인 완료';
    $('tableMiniName').textContent = 'GUEST';
    $('tableMiniId').textContent = '프로필 등록 필요';
    $('accountHeroAuthText').textContent = 'DJ NAME과 INFINITAS ID를 등록하면 웹 계정 사용이 시작됩니다.';
    $('btnHeroProfileEdit').textContent = '회원가입 계속';
    if (versionBadge) versionBadge.textContent = 'PROFILE REQUIRED';
    $('googleAuthStatus').textContent = `Google 로그인 완료: ${state.auth.user?.email || ''}`;
    return;
  }

  $('accountHeroName').textContent = guestName;
  $('accountHeroId').textContent = guestId;
  $('tableMiniName').textContent = guestName;
  $('tableMiniId').textContent = guestId;
  $('accountHeroAuthText').textContent = '로그인 없이 서열표, TSV 업로드, 다운로드, 노트 레이더 확인 가능';
  $('btnHeroProfileEdit').textContent = '정보 변경';
  if (versionBadge) versionBadge.textContent = 'WEB PROJECT';
  $('googleAuthStatus').textContent = 'Google 미연동';
}

export function renderMedals(ctx) {
  const medalMap = [
    ['SP10H', 'medal10', 'medalProgress10', 'medalProgressRing10', 'medalProgressText10', 'medalProgressCount10'],
    ['SP11H', 'medal11', 'medalProgress11', 'medalProgressRing11', 'medalProgressText11', 'medalProgressCount11'],
    ['SP12H', 'medal12', 'medalProgress12', 'medalProgressRing12', 'medalProgressText12', 'medalProgressCount12']
  ];
  medalMap.forEach(([table, imgId, progressId, ringId, textId, countId]) => {
    const view = ctx.state.tableViews[table];
    const charts = view?.flatCharts || [];
    const total = charts.length;
    const played = charts.filter((c) => c.clearStatus !== 'NOPLAY').length;
    const locked = charts.filter((c) => c.clearStatus === 'NOPLAY' && c.isUnlocked === false).length;
    const unplayed = Math.max(0, total - played - locked);
    const pct = total > 0 ? Math.round((played / total) * 100) : 0;
    const tier = medalTierFor(view);
    if (!tier) {
      $(imgId)?.classList.add('hidden');
      $(progressId)?.classList.remove('hidden');
      $(ringId)?.style.setProperty('--played', `${total > 0 ? (played / total) * 100 : 0}%`);
      $(ringId)?.style.setProperty('--unplayed', `${total > 0 ? (unplayed / total) * 100 : 0}%`);
      $(ringId)?.style.setProperty('--locked', `${total > 0 ? (locked / total) * 100 : 0}%`);
      $(textId).textContent = `${pct}%`;
      $(countId).textContent = `${played}/${total}`;
    } else {
      const medalKey = table.replace('H', '');
      $(imgId).src = MEDAL_SRC[medalKey]?.[tier] || DEFAULT_ICON_SRC;
      $(imgId)?.classList.remove('hidden');
      $(progressId)?.classList.add('hidden');
    }
  });
}

export function renderGraphs(ctx, legendTextColor, CLEAR_COLORS, SCORE_GRAPH_ORDER, SCORE_COLORS) {
  const view = ctx.state.tableViews[ctx.state.activeTable];
  if (!view) {
    $('clearGraph').innerHTML = '';
    $('scoreGraph').innerHTML = '';
    return;
  }
  const summary = graphSummary(view);
  const total = view.flatCharts.length || 1;
  const bar = (type, order, counts, palette) => {
    const segOrder = type === 'clear' ? [...order].reverse() : order;
    const legendOrder = type === 'clear' ? [...order].reverse() : order;
    return `<div class="stack-track" data-graph="${type}">${segOrder.map((key) => `<div class="stack-seg" data-graph="${type}" data-key="${esc(key)}" style="width:${(counts[key] / total) * 100}%;background:${palette[key] || '#d8dfeb'}"></div>`).join('')}</div><div class="legend-row">${legendOrder.map((key) => `<span class="legend-item"><span class="legend-chip" data-graph="${type}" data-key="${esc(key)}" title="${esc(key)} ${counts[key] || 0}" style="background:${palette[key] || '#d8dfeb'};color:${legendTextColor(palette[key] || '#d8dfeb')}">${counts[key] || 0}</span></span>`).join('')}</div>`;
  };
  $('clearGraph').innerHTML = bar('clear', summary.clearOrder, summary.clearCount, CLEAR_COLORS);
  $('scoreGraph').innerHTML = bar('score', SCORE_GRAPH_ORDER, summary.scoreCount, SCORE_COLORS);
}

export function renderRankTable(ctx) {
  const { state } = ctx;
  const container = $('rankTableContainer');
  const view = state.tableViews[state.activeTable];
  $('tableMark').textContent = state.activeTable;
  if (!view) {
    container.innerHTML = '<div>서열표 데이터를 불러오는 중입니다...</div>';
    return;
  }
  $('tableTitle').textContent = view.title || state.activeTable;
  const cols = state.viewMode === 'wide' ? 8 : 6;
  const q = state.searchQuery.trim().toLowerCase();
  const isUncategorized = (name) => /미정|미분류/i.test(String(name || '').trim());
  const sp10OrderValue = (name) => {
    const n = Number(String(name || '').trim());
    return Number.isFinite(n) ? n : null;
  };
  const orderedCategories = [...(view.categories || [])].sort((a, b) => {
    const aName = a?.name || '';
    const bName = b?.name || '';
    const aLast = isUncategorized(aName) ? 1 : 0;
    const bLast = isUncategorized(bName) ? 1 : 0;
    if (aLast !== bLast) return aLast - bLast;
    if (state.activeTable === 'SP10H') {
      const an = sp10OrderValue(aName);
      const bn = sp10OrderValue(bName);
      if (an !== null && bn !== null && an !== bn) return bn - an;
      if (an !== null && bn === null) return -1;
      if (an === null && bn !== null) return 1;
    }
    return Number(a?.sortindex || 0) - Number(b?.sortindex || 0);
  });
  container.innerHTML = orderedCategories.map((cat) => {
    const allItems = cat.items || [];
    const items = sortItems(allItems, state.sortMode).filter((item) => item.title.toLowerCase().includes(q));
    if (!items.length) return '';
    const rows = chunk(items, cols);
    const tier = folderLampTier(allItems);
    const color = folderLampColor(tier);
    return `<table class="category-table"><tbody>${rows.map((row, rowIndex) => `<tr>${rowIndex === 0 ? `<th class="category-label" style="--folder-lamp-color:${color}" rowspan="${rows.length}" title="폴더 최저 램프: ${esc(tier)}">${esc(cat.name)}</th>` : ''}${row.map((chart) => `<td class="song-cell"><button class="${btnClass(chart)}" data-chart-key="${esc(chart.key)}" title="${esc(chart.title)}"><span class="song-title">${esc(trunc(chart.title, cols))}</span>${chart.scoreTier ? `<span class="score-badge">${esc(chart.scoreTier)}</span>` : ''}</button></td>`).join('')}${Array.from({ length: Math.max(0, cols - row.length) }).map(() => '<td class="empty-cell"></td>').join('')}</tr>`).join('')}</tbody></table>`;
  }).join('');
}
