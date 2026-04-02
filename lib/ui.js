import { CLEAR_SORT_ORDER, DEFAULT_ICON_SRC, HELP_CONTENT_HTML, MEDAL_SRC, RADAR_ORDER, SCORE_GRAPH_ORDER } from './constants.js';
import { computeRadarProfileFromRows, graphSummary, sortItems } from './data.js';
import { $, dominantRadarAxis, esc, fmt, goalAchieved, goalLabel, normalizeRadarData, showToast, titleKey, truncate2 } from './utils.js';
import { renderHistory, renderSocialHistoryPopup } from './history-ui.js';
import { renderAccountInfo, renderGraphs, renderMedals, renderRankTable } from './rank-ui.js';
import { bingoGoalTargetText, openGoalDialog, renderGoalCandidates, renderGoals, renderSongGoalBingoPicker, syncGoalTargetInputVisibility } from './goals-ui.js';
import { renderNoticeBanner, renderNoticeHistory, renderSettings } from './settings-ui.js';
import { renderSocialPanel, songSocialSectionHtml } from './social-ui.js';

const enhancedSelects = new Map();

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

function closeAllEnhancedSelect(exceptId = null) {
  enhancedSelects.forEach((inst, id) => {
    if (id !== exceptId) inst.close?.();
  });
}

function mountBasicSelect(selectId) {
  const sel = $(selectId);
  if (!sel || enhancedSelects.has(selectId)) return;
  sel.classList.add('native-select-hidden');
  const wrap = document.createElement('div');
  wrap.className = 'it-select';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'it-select-btn';
  const menu = document.createElement('div');
  menu.className = 'it-select-menu hidden';
  wrap.appendChild(btn);
  wrap.appendChild(menu);
  sel.insertAdjacentElement('afterend', wrap);
  const render = () => {
    const opts = [...sel.options];
    const curr = opts.find((o) => o.value === sel.value) || opts[0];
    btn.textContent = curr?.textContent || '';
    menu.innerHTML = opts.map((o) => `<button type="button" class="it-option ${o.value === sel.value ? 'active' : ''}" data-value="${esc(o.value)}">${esc(o.textContent || '')}</button>`).join('');
  };
  const close = () => menu.classList.add('hidden');
  const open = () => {
    closeAllEnhancedSelect(selectId);
    menu.classList.remove('hidden');
  };
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (menu.classList.contains('hidden')) open();
    else close();
  });
  menu.addEventListener('click', (e) => {
    const option = e.target.closest('.it-option[data-value]');
    if (!option) return;
    sel.value = option.getAttribute('data-value') || '';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    render();
    close();
  });
  sel.addEventListener('change', render);
  render();
  enhancedSelects.set(selectId, { close, render, wrap });
}

function mountSearchSelect(selectId, hostId, ctx, { placeholder = '곡명 검색' } = {}) {
  const sel = $(selectId);
  const host = $(hostId);
  if (!sel || !host || enhancedSelects.has(selectId)) return;
  sel.classList.add('native-select-hidden');
  const wrap = document.createElement('div');
  wrap.className = 'it-search';
  wrap.innerHTML = `<input class="it-search-input" placeholder="${esc(placeholder)}" /><button type="button" class="it-search-toggle">▼</button><div class="it-select-menu hidden"></div>`;
  host.innerHTML = '';
  host.appendChild(wrap);
  const input = wrap.querySelector('.it-search-input');
  const toggle = wrap.querySelector('.it-search-toggle');
  const menu = wrap.querySelector('.it-select-menu');
  const getFiltered = () => {
    const query = String(input.value || '').trim().toLowerCase();
    return [...sel.options].filter((o) => !query || String(o.textContent || '').toLowerCase().includes(query));
  };
  const render = () => {
    const opts = getFiltered();
    input.value = ctx.state.goalSongQuery || '';
    menu.innerHTML = opts.length
      ? opts.map((o) => `<button type="button" class="it-option ${o.value === sel.value ? 'active' : ''}" data-value="${esc(o.value)}">${esc(o.textContent || '')}</button>`).join('')
      : '<div class="it-option">검색 결과가 없습니다.</div>';
  };
  const close = () => menu.classList.add('hidden');
  const open = () => {
    closeAllEnhancedSelect(selectId);
    menu.classList.remove('hidden');
    render();
  };
  input.addEventListener('input', () => {
    ctx.state.goalSongQuery = input.value || '';
    ctx.actions.refreshGoalCandidates();
    open();
  });
  input.addEventListener('focus', open);
  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    if (menu.classList.contains('hidden')) open();
    else close();
  });
  menu.addEventListener('click', (e) => {
    const option = e.target.closest('.it-option[data-value]');
    if (!option) return;
    const value = option.getAttribute('data-value') || '';
    sel.value = value;
    const current = [...sel.options].find((o) => o.value === value);
    input.value = current?.textContent || '';
    ctx.state.goalSongQuery = input.value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    close();
    render();
  });
  sel.addEventListener('change', render);
  render();
  enhancedSelects.set(selectId, { close, render, wrap });
}

function decorateButtons(root = document) {
  root.querySelectorAll('button').forEach((btn) => {
    if (
      btn.classList.contains('song-button')
      || btn.classList.contains('dock-tab')
      || btn.classList.contains('widget-drag-handle')
      || btn.classList.contains('it-option')
      || btn.classList.contains('it-select-btn')
      || btn.classList.contains('it-search-toggle')
      || btn.classList.contains('google-link-btn')
      || btn.classList.contains('settings-nav-btn')
      || btn.classList.contains('social-feed-close')
      || btn.classList.contains('history-item')
      || btn.classList.contains('history-accordion-btn')
      || btn.classList.contains('bingo-cell')
      || btn.hasAttribute('data-table')
      || btn.hasAttribute('data-view')
      || btn.hasAttribute('data-sort')
    ) return;
    btn.classList.add('ui-btn');
    if (btn.id === 'btnExportImage') {
      btn.classList.add('download-fancy');
      if (!btn.querySelector('.btn-text')) {
        btn.innerHTML = `<span class="btn-text">${esc(btn.textContent || '다운로드')}</span>`;
      }
    }
  });
}

const CLEAR_COLORS = {
  NOPLAY: '#e8e8e8',
  FAILED: '#a5a5a5',
  ASSIST: '#d6c4d1',
  EASY: '#98c56f',
  NORMAL: '#88a0ce',
  HARD: '#f45f5f',
  EXHARD: '#f0ce00',
  FC: '#63d7e8'
};

const SCORE_COLORS = {
  NOPLAY: '#e8e8e8',
  B: '#ef7fb9',
  A: '#88a0ce',
  AA: '#79db61',
  AAA: '#f0ce00',
  'MAX-': '#ffbd6f',
  MAX: '#ff8f65'
};

function legendTextColor(hex) {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || ''));
  if (!match) return '#102236';
  const r = parseInt(match[1], 16);
  const g = parseInt(match[2], 16);
  const b = parseInt(match[3], 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? '#102236' : '#f7fbff';
}

function radarSvgHtml(radar, options = {}) {
  const labels = RADAR_ORDER;
  const angles = [-90, -30, 30, 90, 150, 210];
  const cx = 120;
  const cy = 110;
  const outer = 68;
  const rings = [0.25, 0.5, 0.75, 1];
  const maxValue = 200;
  const dominant = options.dominantAxis || dominantRadarAxis(radar);
  const showDominantStar = options.showDominantStar !== false;
  const colors = {
    NOTES: '#ff63d1',
    CHORD: '#9be24f',
    PEAK: '#ffb14b',
    SCRATCH: '#ff5a5a',
    CHARGE: '#9b6cff',
    SOFLAN: '#63c8ff'
  };
  const point = (scale, angleDeg) => {
    const rad = (angleDeg * Math.PI) / 180;
    return [cx + Math.cos(rad) * outer * scale, cy + Math.sin(rad) * outer * scale];
  };
  const ringPolys = rings.map((scale) => {
    const pts = angles.map((a) => point(scale, a)).map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
    return `<polygon points="${pts}" />`;
  }).join('');
  const axisLines = angles.map((a) => {
    const [x, y] = point(1, a);
    return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(2)}" y2="${y.toFixed(2)}" />`;
  }).join('');
  const dataPoly = angles.map((a, i) => {
    const axis = labels[i];
    const scale = Math.max(0, Math.min(1, Number(radar?.[axis] || 0) / maxValue));
    return point(scale, a);
  }).map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const labelHtml = angles.map((a, i) => {
    const axis = labels[i];
    const [x, y] = point(1.33, a);
    const color = colors[axis] || '#f0f0f0';
    const mark = showDominantStar && dominant === axis ? '☆' : '';
    const value = truncate2(radar?.[axis] || 0).toFixed(2);
    return `<g class="radar-axis-group"><text x="${x.toFixed(2)}" y="${y.toFixed(2)}" fill="${color}" text-anchor="middle" class="radar-axis-label">${mark}${axis}</text><text x="${x.toFixed(2)}" y="${(y + 11).toFixed(2)}" fill="${color}" text-anchor="middle" class="radar-axis-value">${value}</text></g>`;
  }).join('');
  const gradId = `radarFillGrad-${Math.random().toString(36).slice(2, 10)}`;
  const extraClass = options.compact ? ' compact' : '';
  return `<div class="radar-wrap${extraClass}">
    <svg class="radar-chart" viewBox="0 0 260 220" aria-label="notes radar chart">
      <defs>
        <linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#fff46a" stop-opacity="0.65"/>
          <stop offset="100%" stop-color="#a63a4d" stop-opacity="0.45"/>
        </linearGradient>
      </defs>
      <g class="radar-grid">${ringPolys}${axisLines}</g>
      <polygon class="radar-fill" points="${dataPoly}" style="fill:url(#${gradId})" />
      <polygon class="radar-outline" points="${dataPoly}" />
      <g class="radar-labels">${labelHtml}</g>
    </svg>
  </div>`;
}

let ownRadarDialogProfile = null;
let peerRadarDialogProfile = null;
const slidingGroups = [];
let slidingReady = false;

function buildRadarProfileHtml(profile, { stacked = false } = {}) {
  const hasData = RADAR_ORDER.some((axis) => Number(profile?.radar?.[axis] || 0) > 0);
  if (!hasData) return '<div class="account-radar-empty">NO DATA</div>';
  const barOrder = ['NOTES', 'CHORD', 'PEAK', 'CHARGE', 'SCRATCH', 'SOFLAN'];
  const bars = barOrder.map((axis, i) => {
    const value = Number(profile.radar?.[axis] || 0);
    const height = Math.max(2, (value / 200) * 100);
    const cls = `axis-${axis.toLowerCase()}`;
    const alt = i % 2 === 0 ? 'label-top' : 'label-bottom';
    return `<button type="button" class="account-radar-vbar ${alt}" data-radar-axis="${esc(axis)}" title="${esc(axis)}">
      <div class="account-radar-vbar-value ${cls}">${value.toFixed(2)}</div>
      <div class="account-radar-vbar-col"><div class="account-radar-vbar-fill ${cls}" style="height:${height.toFixed(2)}%"></div></div>
      <div class="account-radar-vbar-label ${cls}">${esc(axis)}</div>
    </button>`;
  }).join('');
  return `<div class="account-radar-row${stacked ? ' stacked' : ''}">
    ${radarSvgHtml(profile.radar, { dominantAxis: profile.dominantAxis, compact: false, showDominantStar: false })}
    <div class="account-radar-bars">
      <div class="account-radar-vbars">${bars}</div>
      <div class="account-radar-total">TOTAL RADAR SCORE: ${Number(profile.total || 0).toFixed(2)}</div>
    </div>
  </div>`;
}

function buildRadarDialogBodyHtml(title, profile) {
  return `<div class="social-radar-head"><div class="social-radar-title">SP NOTES RADAR</div><div class="social-radar-user">${esc(title)}</div></div>${buildRadarProfileHtml(profile, { stacked: true })}`;
}

function radarAxisDisplayName(axis) {
  return String(axis || '').toUpperCase();
}

function radarTitleTypeClass(type) {
  const t = String(type || '').trim().toUpperCase();
  return `radar-title-type-${['N', 'H', 'A', 'L'].includes(t) ? t.toLowerCase() : 'a'}`;
}

function hideRadarAxisPopup() {
  $('radarAxisPopup')?.classList.add('hidden');
  $('socialPeerRadarAxisPopup')?.classList.add('hidden');
}

function showRadarAxisPopup(axisRaw, anchorEl) {
  const ownHost = $('accountRadarDialogBody');
  const peerHost = $('socialPeerRadarBody');
  const isPeer = !!peerHost?.contains(anchorEl);
  const host = isPeer ? peerHost : ownHost;
  const popup = isPeer ? $('socialPeerRadarAxisPopup') : $('radarAxisPopup');
  const profile = isPeer ? peerRadarDialogProfile : ownRadarDialogProfile;
  if (!popup || !profile) return;
  hideRadarAxisPopup();
  const axis = String(axisRaw || '').toUpperCase();
  const rows = profile.rankings?.[axis] || [];
  const listHtml = rows.length
    ? rows.map((row, index) => `<div class="radar-axis-popup-row"><span class="rank-no">${index + 1}</span><span class="rank-title ${radarTitleTypeClass(row.type)}">${esc(row.title || '-')}</span><span class="rank-value">${Number(row.value || 0).toFixed(2)}</span></div>`).join('')
    : '<div class="history-empty">NO DATA</div>';
  popup.innerHTML = `<div class="radar-axis-popup-head"><span class="axis-chip axis-${axis.toLowerCase()}">${radarAxisDisplayName(axis)}</span><span class="rank-head-text">TOP 10 USED FOR AVERAGE</span></div><div class="radar-axis-popup-list">${listHtml}</div>`;
  popup.classList.remove('hidden');
  const anchorRect = anchorEl?.getBoundingClientRect?.();
  const hostRect = host?.getBoundingClientRect?.();
  const margin = 8;
  const rect = popup.getBoundingClientRect();
  let left = anchorRect && hostRect ? (anchorRect.left - hostRect.left) + anchorRect.width + 8 : 12;
  let top = anchorRect && hostRect ? (anchorRect.top - hostRect.top) - 6 : 12;
  if (hostRect) {
    const maxLeft = Math.max(margin, hostRect.width - rect.width - margin);
    const maxTop = Math.max(margin, hostRect.height - rect.height - margin);
    if (left > maxLeft && anchorRect) left = Math.max(margin, (anchorRect.left - hostRect.left) - rect.width - 8);
    if (left > maxLeft) left = maxLeft;
    if (top > maxTop) top = maxTop;
    if (top < margin) top = margin;
  }
  popup.style.left = `${Math.round(left)}px`;
  popup.style.top = `${Math.round(top)}px`;
}

function measureSlidingGroup(root, itemSelector) {
  if (!root) return;
  const items = [...root.querySelectorAll(itemSelector)];
  if (!items.length) return;
  const active = items.find((item) => item.classList.contains('active')) || items[0];
  root.style.setProperty('--slide-left', `${Math.max(0, active.offsetLeft).toFixed(2)}px`);
  root.style.setProperty('--slide-width', `${Math.max(0, active.offsetWidth).toFixed(2)}px`);
}

function initSlidingControls() {
  if (slidingReady) return;
  const defs = [
    { root: document.querySelector('.tabs.slide-tabs'), selector: '.tab' },
    { root: document.querySelector('.view-toggle.slide-tabs'), selector: '[data-view]' },
    { root: document.querySelector('.sort-toggle.slide-tabs'), selector: '[data-sort]' }
  ];
  defs.forEach((def) => {
    const root = def.root;
    if (!root) return;
    if (!root.querySelector('.slide-indicator')) {
      const indicator = document.createElement('span');
      indicator.className = 'slide-indicator';
      root.insertBefore(indicator, root.firstChild);
    }
    const update = () => measureSlidingGroup(root, def.selector);
    root.addEventListener('click', () => requestAnimationFrame(update));
    slidingGroups.push(update);
    requestAnimationFrame(update);
  });
  window.addEventListener('resize', () => slidingGroups.forEach((fn) => fn()));
  slidingReady = true;
}

function syncSlidingControls() {
  slidingGroups.forEach((fn) => fn());
}

function syncActiveControls(state) {
  document.querySelectorAll('.tab[data-table]').forEach((el) => el.classList.toggle('active', el.dataset.table === state.activeTable));
  document.querySelectorAll('[data-view]').forEach((el) => el.classList.toggle('active', el.dataset.view === state.viewMode));
  document.querySelectorAll('[data-sort]').forEach((el) => el.classList.toggle('active', el.dataset.sort === state.sortMode));
  syncSlidingControls();
}

function positionPopup(el, event) {
  if (!el) return;
  el.style.left = '0px';
  el.style.top = '0px';
  const rect = el.getBoundingClientRect();
  const margin = 10;
  let left = (event?.clientX ?? 40) + 12;
  let top = (event?.clientY ?? 40) + 12;
  if (left + rect.width + margin > window.innerWidth) left = window.innerWidth - rect.width - margin;
  if (top + rect.height + margin > window.innerHeight) top = window.innerHeight - rect.height - margin;
  el.style.left = `${Math.max(margin, left)}px`;
  el.style.top = `${Math.max(margin, top)}px`;
}

function hideSongPopup() {
  $('songPopup')?.classList.add('hidden');
}

function hideGraphPopup() {
  $('graphPopup')?.classList.add('hidden');
}

function showGraphPopup(title, html, event) {
  const popup = $('graphPopup');
  $('graphPopupTitle').textContent = title;
  $('graphPopupMeta').innerHTML = html;
  popup.classList.remove('hidden');
  positionPopup(popup, event);
}

function showGraphSingle(ctx, type, key, event) {
  const view = ctx.state.tableViews[ctx.state.activeTable];
  const summary = view ? graphSummary(view) : null;
  if (!summary) return;
  $('graphPopup')?.classList.add('compact');
  const counts = type === 'clear' ? summary.clearCount : summary.scoreCount;
  showGraphPopup(type === 'clear' ? 'CLEAR' : 'SCORE', `<div>${esc(key)}: ${counts[key] ?? 0}</div>`, event);
}

function showGraphFull(ctx, type, event) {
  const view = ctx.state.tableViews[ctx.state.activeTable];
  const summary = view ? graphSummary(view) : null;
  if (!summary) return;
  $('graphPopup')?.classList.remove('compact');
  const order = type === 'clear' ? summary.clearOrder : SCORE_GRAPH_ORDER;
  const counts = type === 'clear' ? summary.clearCount : summary.scoreCount;
  const lines = order.map((key) => `<div>${esc(key)}: ${counts[key] ?? 0}</div>`).join('');
  showGraphPopup(type === 'clear' ? 'CLEAR 요약' : 'SCORE 요약', lines, event);
}

function openDialog(dialogId) {
  const dialog = $(dialogId);
  if (dialog && !dialog.open) dialog.showModal();
}

function closeDialog(dialogId, value = 'cancel') {
  const dialog = $(dialogId);
  if (dialog?.open) dialog.close(value);
}

function updateAuthGateUi(ctx) {
  const enabled = ctx.isAuthorized();
  document.querySelectorAll('.auth-required').forEach((el) => el.classList.toggle('hidden', !enabled));
  document.querySelectorAll('.dock-tab[data-panel="history"], .dock-tab[data-panel="goals"], .dock-tab[data-panel="social"], .dock-tab[data-panel="settings"]').forEach((el) => {
    const host = el.closest('.dock-item');
    if (host) host.classList.toggle('hidden', !enabled);
    else el.classList.toggle('hidden', !enabled);
  });
  $('btnGoogleLogin')?.classList.toggle('hidden', ctx.state.auth.signedIn);
  $('btnGoogleSignup')?.classList.toggle('hidden', ctx.state.auth.signedIn);
  $('btnGoogleLogout')?.classList.toggle('hidden', !ctx.state.auth.signedIn);
  $('btnRefreshRank')?.classList.toggle('hidden', !enabled);
  $('btnHeroGoogleLogin')?.classList.toggle('hidden', ctx.state.auth.signedIn);
  $('btnHeroProfileEdit')?.classList.remove('hidden');
  $('btnAccountIconEditFromMenu')?.classList.toggle('hidden', !enabled);
  $('panel-social')?.classList.toggle('hidden', !enabled);
  $('settingsTabSocial')?.classList.toggle('hidden', !enabled);
  $('socialSettingsBlock')?.classList.toggle('hidden', !enabled);
  document.querySelectorAll('#panel-goals .goal-form select, #panel-goals .goal-form input, #panel-goals .goal-form button, #panel-goals .bingo-builder-bar select, #panel-goals .bingo-builder-bar button, .goals-actions button, #panel-goals #goalList button').forEach((el) => {
      el.disabled = !enabled;
    });
}

export function renderApp(ctx) {
  initSlidingControls();
  updateAuthGateUi(ctx);
  const safe = (label, fn) => {
    try {
      fn();
    } catch (error) {
      console.error(`${label} render failed`, error);
    }
  };
  safe('account', () => renderAccountInfo(ctx));
  safe('medals', () => renderMedals(ctx));
  safe('rank', () => renderRankTable(ctx));
  safe('graphs', () => renderGraphs(ctx, legendTextColor, CLEAR_COLORS, SCORE_GRAPH_ORDER, SCORE_COLORS));
  safe('history', () => renderHistory(ctx));
  safe('goalCandidates', () => renderGoalCandidates(ctx, enhancedSelects));
  safe('goals', () => renderGoals(ctx, enhancedSelects));
  safe('songGoalBingoPicker', () => renderSongGoalBingoPicker(ctx));
  safe('noticeBanner', () => renderNoticeBanner(ctx));
  safe('noticeHistory', () => renderNoticeHistory(ctx));
  safe('settings', () => renderSettings(ctx));
  safe('social', () => renderSocialPanel(ctx, renderSocialHistoryPopup));
  safe('controls', () => syncActiveControls(ctx.state));
  decorateButtons();
}

export function openHelp() {
  $('helpContentBody').innerHTML = HELP_CONTENT_HTML;
  openDialog('helpDialog');
}

export function showSongPopup(chart, event, isAuthorized, options = {}) {
  const popup = $('songPopup');
  const goalBtn = isAuthorized ? `<button type="button" class="song-goal-open-btn" data-song-goal="${esc(chart.key)}">빙고 추가</button>` : '';
  $('popupTitle').innerHTML = `<span>${esc(`${chart.title} [${chart.type}]`)}</span>${goalBtn}`;
  const radarData = normalizeRadarData(chart.radar);
  const radarHtml = radarData
    ? radarSvgHtml(radarData, { dominantAxis: chart.radarTop || dominantRadarAxis(radarData), compact: true })
    : '<div class="radar-wrap"><div class="radar-nodata">NO DATA</div></div>';
  const playHtml = `<div>Lamp: ${esc(chart.clearStatus)} | Rank: ${esc(chart.scoreTier || '-')}</div><div>SCORE: ${Number(chart.exScore || 0)} | MISS: ${Number(chart.missCount || 0)}</div><div>RATE: ${Number(chart.rate || 0).toFixed(2)}%</div>`;
  const metaNotes = Number(chart.metaNotes || chart.noteCount || 0) > 0 ? Number(chart.metaNotes || chart.noteCount || 0) : '-';
  const typeText = chart.metaType ? esc(chart.metaType) : esc(chart.type || '-');
  const metaHtml = `<div>notes: ${metaNotes} | Type: ${typeText}</div>`;
  $('popupMeta').innerHTML = `${radarHtml}<hr />${metaHtml}<hr />${playHtml}${songSocialSectionHtml(options.songSocialRows || [])}`;
  popup.classList.remove('hidden');
  positionPopup(popup, event);
}

export function showRadarDialog(title, profile) {
  ownRadarDialogProfile = profile;
  hideRadarAxisPopup();
  $('accountRadarDialogBody').innerHTML = buildRadarDialogBodyHtml(title, profile);
  openDialog('radarDialog');
}

export function showPeerRadarDialog(title, subtitle, profile) {
  peerRadarDialogProfile = profile;
  hideRadarAxisPopup();
  $('socialPeerRadarBody').innerHTML = `<div class="social-radar-head"><div class="social-radar-title">SP NOTES RADAR</div><div class="social-radar-user">${esc(title)}</div></div><div class="social-item-sub">${esc(subtitle || '')}</div>${buildRadarProfileHtml(profile, { stacked: true })}`;
  openDialog('socialPeerRadarDialog');
}

export function bindUi(ctx) {
  mountBasicSelect('goalKind');
  mountBasicSelect('goalTable');
  mountBasicSelect('goalChartType');
  mountBasicSelect('goalLamp');
  mountBasicSelect('goalRank');
  mountBasicSelect('bingoSize');
  mountSearchSelect('goalSong', 'goalSongComboHost', ctx, { placeholder: '곡명 검색' });
  syncGoalTargetInputVisibility('goal', enhancedSelects);
  document.querySelectorAll('.main-tab, .dock-tab').forEach((button) => button.addEventListener('click', () => ctx.actions.setActivePanel(button.dataset.panel || 'rank')));
  document.querySelectorAll('[data-table]').forEach((button) => button.addEventListener('click', () => ctx.actions.setActiveTable(button.dataset.table || 'SP11H')));
  document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => ctx.actions.setViewMode(button.dataset.view || 'normal')));
  document.querySelectorAll('[data-sort]').forEach((button) => button.addEventListener('click', () => ctx.actions.setSortMode(button.dataset.sort || 'name')));
  $('songSearch')?.addEventListener('input', (e) => ctx.actions.setSearchQuery(e.target.value || ''));
  $('rankTableContainer')?.addEventListener('click', (e) => {
    const button = e.target.closest('[data-chart-key]');
    if (!button) return;
    ctx.actions.openChart(button.getAttribute('data-chart-key'), e);
  });
  $('clearGraph')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const chip = e.target.closest('.legend-chip');
    if (chip) {
      showGraphSingle(ctx, 'clear', chip.getAttribute('data-key') || '', e);
      return;
    }
    if (e.target.closest('.stack-track') || e.target.closest('.stack-seg')) {
      showGraphFull(ctx, 'clear', e);
    }
  });
  $('scoreGraph')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const chip = e.target.closest('.legend-chip');
    if (chip) {
      showGraphSingle(ctx, 'score', chip.getAttribute('data-key') || '', e);
      return;
    }
    if (e.target.closest('.stack-track') || e.target.closest('.stack-seg')) {
      showGraphFull(ctx, 'score', e);
    }
  });
  $('btnLoadTracker')?.addEventListener('click', ctx.actions.importTsv);
  $('btnExportImage')?.addEventListener('click', ctx.actions.exportImage);
  $('btnRefreshRank')?.addEventListener('click', ctx.actions.refreshRankData);
  $('btnHelp')?.addEventListener('click', openHelp);
  $('appNoticeBar')?.addEventListener('click', () => openDialog('noticeHistoryDialog'));
  $('btnResetApp')?.addEventListener('click', ctx.actions.resetGuestState);
  $('btnGoogleLogin')?.addEventListener('click', ctx.actions.signIn);
  $('btnGoogleSignup')?.addEventListener('click', ctx.actions.openSignupDialog);
  $('btnHeroGoogleLogin')?.addEventListener('click', ctx.actions.signIn);
  $('btnGoogleLogout')?.addEventListener('click', ctx.actions.signOut);
  $('btnHeroProfileEdit')?.addEventListener('click', ctx.actions.openProfileDialog);
  $('accountHeroIcon')?.addEventListener('click', () => $('accountIconMenu')?.classList.toggle('hidden'));
  $('btnAccountRadarFromMenu')?.addEventListener('click', ctx.actions.openSelfRadar);
  $('btnAccountIconEditFromMenu')?.addEventListener('click', ctx.actions.openIconEditor);
  $('btnAccountEditFromMenu')?.addEventListener('click', ctx.actions.openProfileDialog);
  $('signupNameInput')?.addEventListener('input', (e) => ctx.actions.updateSignupName(e.target.value || ''));
  $('signupIdInput')?.addEventListener('input', ctx.actions.formatSignupId);
  $('signupBackBtn')?.addEventListener('click', ctx.actions.prevSignupStep);
  $('signupCancelBtn')?.addEventListener('click', ctx.actions.closeSignupDialog);
  $('signupNextBtn')?.addEventListener('click', ctx.actions.nextSignupStep);
  $('signupGoogleActionBtn')?.addEventListener('click', ctx.actions.submitSignup);
  $('signupDialog')?.addEventListener('close', () => ctx.actions.closeSignupDialog({ skipDialogClose: true }));
  $('historyList')?.addEventListener('click', (e) => {
    const rollback = e.target.closest('#btnHistoryRollback');
    if (rollback) return ctx.actions.rollbackHistory();
    const btn = e.target.closest('[data-history-id]');
    if (btn) ctx.actions.selectHistory(btn.getAttribute('data-history-id'));
  });
  $('historyDetail')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-history-section]');
    if (btn && !btn.disabled) ctx.actions.toggleHistorySection(btn.getAttribute('data-history-section'));
  });
  $('goalKind')?.addEventListener('change', () => syncGoalTargetInputVisibility('goal'));
  $('songGoalKind')?.addEventListener('change', () => syncGoalTargetInputVisibility('songGoal'));
  $('goalTable')?.addEventListener('change', ctx.actions.handleGoalTableChange);
  $('goalSong')?.addEventListener('change', ctx.actions.syncGoalChartTypeFromSelection);
  $('bingoSize')?.addEventListener('change', (e) => ctx.actions.setBingoSize(e.target.value || '3'));
  $('btnAddGoal')?.addEventListener('click', () => ctx.actions.addGoalFromMainForm());
  $('songGoalForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    ctx.actions.addGoalFromSongDialog();
  });
  $('songGoalBingoBody')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-song-goal-cell]');
    if (btn) ctx.actions.applySongGoalToBingoCell(btn.getAttribute('data-song-goal-cell'));
  });
  $('goalList')?.addEventListener('click', (e) => {
    const selectBoard = e.target.closest('[data-bingo-board-select]');
    if (selectBoard) return ctx.actions.selectSavedBingo(selectBoard.getAttribute('data-bingo-board-select'));
    const addBoard = e.target.closest('[data-bingo-add-new]');
    if (addBoard) return ctx.actions.openBingoSizeDialog();
    const headerAction = e.target.closest('[data-bingo-header-action]');
    if (headerAction) {
      const action = headerAction.getAttribute('data-bingo-header-action');
      if (action === 'import') return ctx.actions.importGoals();
      if (action === 'draft-save') return ctx.actions.saveBingoDraft();
      if (action === 'draft-cancel') return ctx.actions.cancelBingoDraft();
      if (action === 'publish') return ctx.actions.openBingoPublishDialog();
      if (action === 'export') return ctx.actions.exportGoals();
      if (action === 'share') return ctx.actions.openBingoShare();
      if (action === 'delete') return ctx.actions.clearGoals();
    }
    const cell = e.target.closest('[data-bingo-cell]');
    if (cell) return ctx.actions.assignGoalToBingoCell(cell.getAttribute('data-bingo-cell'));
    const del = e.target.closest('[data-goal-delete]');
    if (del) return ctx.actions.deleteGoal(del.getAttribute('data-goal-delete'));
    const send = e.target.closest('[data-goal-send]');
    if (send) return ctx.actions.openGoalSend(send.getAttribute('data-goal-send'));
  });
  $('btnExportGoals')?.addEventListener('click', ctx.actions.exportGoals);
  $('btnImportGoals')?.addEventListener('click', ctx.actions.importGoals);
  $('btnShareBingo')?.addEventListener('click', ctx.actions.openBingoShare);
  $('btnClearGoals')?.addEventListener('click', ctx.actions.clearGoals);
  $('btnClearAchievedGoals')?.addEventListener('click', ctx.actions.clearAchievedGoals);
  $('btnClearBingoCell')?.addEventListener('click', ctx.actions.clearSelectedBingoCell);
  $('btnBingoDraftSave')?.addEventListener('click', ctx.actions.saveBingoDraft);
  $('btnBingoPublish')?.addEventListener('click', ctx.actions.openBingoPublishDialog);
  $('bingoSizePickerDialog')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-bingo-size-pick]');
    if (btn) ctx.actions.createBingoFromSize(btn.getAttribute('data-bingo-size-pick'));
  });
  $('bingoSizePickerCloseBtn')?.addEventListener('click', () => ctx.actions.closeBingoSizeDialog());
  $('goalSendList')?.addEventListener('click', (e) => {
    const bingoBtn = e.target.closest('[data-bingo-send-peer]');
    if (bingoBtn) return ctx.actions.sendBingo(bingoBtn.getAttribute('data-bingo-send-peer'));
    const btn = e.target.closest('[data-goal-send-peer]');
    if (btn) ctx.actions.sendGoal(btn.getAttribute('data-goal-id'), btn.getAttribute('data-goal-send-peer'));
  });
  $('btnSocialFeedClearAll')?.addEventListener('click', ctx.actions.dismissAllFeed);
  $('btnSocialFeedRefresh')?.addEventListener('click', ctx.actions.refreshSocial);
  $('socialFeed')?.addEventListener('click', (e) => {
    const detail = e.target.closest('[data-feed-history-detail]');
    if (detail) return ctx.actions.openSocialHistoryDetail(
      detail.getAttribute('data-feed-id'),
      detail.getAttribute('data-peer-user-id'),
      detail.getAttribute('data-history-id')
    );
    const dismiss = e.target.closest('[data-feed-dismiss]');
    if (dismiss) return ctx.actions.dismissFeed(dismiss.getAttribute('data-feed-dismiss'));
    const accept = e.target.closest('[data-feed-accept]');
    if (accept) return ctx.actions.respondFollow(accept.getAttribute('data-feed-accept'), true);
    const reject = e.target.closest('[data-feed-reject]');
    if (reject) return ctx.actions.respondFollow(reject.getAttribute('data-feed-reject'), false);
    const goalAccept = e.target.closest('[data-goal-accept]');
    if (goalAccept) return ctx.actions.respondGoal(goalAccept.getAttribute('data-goal-accept'), true);
    const goalReject = e.target.closest('[data-goal-reject]');
    if (goalReject) return ctx.actions.respondGoal(goalReject.getAttribute('data-goal-reject'), false);
    const bingoPreview = e.target.closest('[data-bingo-preview]');
    if (bingoPreview) return ctx.actions.previewBingoFeed(bingoPreview.getAttribute('data-bingo-preview'));
    const bingoAccept = e.target.closest('[data-bingo-accept]');
    if (bingoAccept) return ctx.actions.respondBingo(bingoAccept.getAttribute('data-bingo-accept'), true);
    const bingoReject = e.target.closest('[data-bingo-reject]');
    if (bingoReject) return ctx.actions.respondBingo(bingoReject.getAttribute('data-bingo-reject'), false);
  });
  $('socialMyCard')?.addEventListener('click', (e) => {
    if (e.target.closest('#btnSocialOpenFollowAdd')) openDialog('socialFollowAddDialog');
    if (e.target.closest('#btnSocialBannerSetting')) $('socialBannerInput')?.click();
  });
  $('btnSocialSearchUser')?.addEventListener('click', ctx.actions.searchUser);
  $('socialSearchKeyword')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      ctx.actions.searchUser();
    }
  });
  $('socialSearchResult')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-follow-target]');
    if (btn) ctx.actions.sendFollow(btn.getAttribute('data-follow-target'));
  });
  $('socialFollowList')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-peer-avatar]');
    if (!btn) return;
    const menu = $('socialPeerMenu');
    const rect = btn.getBoundingClientRect();
    menu.dataset.peerUserId = btn.getAttribute('data-peer-avatar') || '';
    menu.dataset.peerDjName = btn.getAttribute('data-peer-dj-name') || '';
    menu.dataset.peerInfinitasId = btn.getAttribute('data-peer-infinitas-id') || '';
    menu.dataset.anchorLeft = String(rect.left || 0);
    menu.dataset.anchorTop = String(rect.top || 0);
    menu.dataset.anchorRight = String(rect.right || 0);
    menu.dataset.anchorBottom = String(rect.bottom || 0);
    menu.dataset.anchorWidth = String(rect.width || 0);
    menu.dataset.anchorHeight = String(rect.height || 0);
    menu.style.left = `${e.clientX + 6}px`;
    menu.style.top = `${e.clientY + 6}px`;
    $('socialPeerCardPopup')?.classList.add('hidden');
    menu.classList.remove('hidden');
  });
  $('socialHistoryPopup')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const closeBtn = e.target.closest('[data-social-history-close]');
    if (closeBtn) return ctx.actions.closeSocialHistoryPopup();
    const sectionBtn = e.target.closest('[data-social-history-section]');
    if (sectionBtn) ctx.actions.toggleSocialHistorySection(sectionBtn.getAttribute('data-social-history-section'));
  });
  $('socialHistoryPopup')?.addEventListener('close', () => ctx.actions.closeSocialHistoryPopup());
  $('socialBannerInput')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    ctx.actions.openSocialBannerEditor(file);
    e.target.value = '';
  });
  $('accountIconFileInput')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    ctx.actions.openIconEditorFromFile(file);
    e.target.value = '';
  });
  $('accountIconEditorCancelBtn')?.addEventListener('click', () => ctx.actions.closeIconEditor());
  $('accountIconEditorForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    ctx.actions.saveIconEditor();
  });
  $('accountIconEditorDialog')?.addEventListener('close', () => ctx.actions.closeIconEditor({ skipDialogClose: true }));
  $('accountIconEditorFrame')?.addEventListener('pointerdown', (e) => ctx.actions.startIconDrag(e));
  $('accountIconEditorFrame')?.addEventListener('wheel', (e) => ctx.actions.zoomIconEditor(e), { passive: false });
  $('socialBannerEditorCancelBtn')?.addEventListener('click', () => ctx.actions.closeSocialBannerEditor());
  $('socialBannerEditorForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    ctx.actions.saveSocialBannerEditor();
  });
  $('socialBannerEditorDialog')?.addEventListener('close', () => ctx.actions.closeSocialBannerEditor({ skipDialogClose: true }));
  $('socialBannerEditorFrame')?.addEventListener('pointerdown', (e) => ctx.actions.startSocialBannerDrag(e));
  $('socialBannerEditorFrame')?.addEventListener('wheel', (e) => ctx.actions.zoomSocialBannerEditor(e), { passive: false });
  document.addEventListener('pointermove', (e) => ctx.actions.moveSocialBannerDrag(e));
  document.addEventListener('pointerup', (e) => ctx.actions.endSocialBannerDrag(e));
  document.addEventListener('pointercancel', (e) => ctx.actions.endSocialBannerDrag(e));
  document.addEventListener('pointermove', (e) => ctx.actions.moveIconDrag(e));
  document.addEventListener('pointerup', (e) => ctx.actions.endIconDrag(e));
  document.addEventListener('pointercancel', (e) => ctx.actions.endIconDrag(e));
  $('btnSocialPeerCard')?.addEventListener('click', ctx.actions.openPeerCard);
  $('btnSocialPeerRadar')?.addEventListener('click', ctx.actions.openPeerRadar);
  $('btnSocialPeerCompare')?.addEventListener('click', ctx.actions.openPeerCompare);
  $('btnSocialPeerUnfollow')?.addEventListener('click', ctx.actions.unfollowPeer);
  $('settingsForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    ctx.actions.saveSettings();
  });
  document.querySelectorAll('.settings-nav-btn').forEach((btn) => btn.addEventListener('click', () => ctx.actions.setSettingsTab(btn.dataset.settingsTab || 'general')));
  $('btnWithdrawAccount')?.addEventListener('click', ctx.actions.withdrawAccount);
  $('accountIdInput')?.addEventListener('input', ctx.actions.formatProfileId);
  $('accountForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    ctx.actions.submitProfile();
  });
  $('bingoNameCancelBtn')?.addEventListener('click', () => closeDialog('bingoNameDialog'));
  $('bingoNameForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    ctx.actions.publishBingo();
  });
  $('bingoPreviewCloseBtn')?.addEventListener('click', () => closeDialog('bingoPreviewDialog'));
  $('songPopup')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-song-goal]');
    if (!btn) return;
    const chart = ctx.state.selectedChart;
    if (chart) openGoalDialog(chart, ctx.isAuthorized());
  });
  $('accountRadarDialogBody')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-radar-axis]');
    if (btn) showRadarAxisPopup(btn.getAttribute('data-radar-axis'), btn);
  });
  $('socialPeerRadarBody')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-radar-axis]');
    if (btn) showRadarAxisPopup(btn.getAttribute('data-radar-axis'), btn);
  });
  $('accountCancelBtn')?.addEventListener('click', () => closeDialog('accountDialog'));
  $('songGoalCloseBtn')?.addEventListener('click', () => closeDialog('songGoalDialog'));
  $('songGoalBingoCloseBtn')?.addEventListener('click', () => ctx.actions.closeSongGoalPicker());
  $('songGoalBingoDialog')?.addEventListener('close', () => {
    if (ctx.state.songGoalPickerPayload) ctx.actions.closeSongGoalPicker();
  });
  $('settingsCloseBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    closeDialog('settingsDialog', 'done');
  });
  $('noticeHistoryCloseTop')?.addEventListener('click', () => closeDialog('noticeHistoryDialog'));
  $('noticeHistoryDialog')?.addEventListener('click', (e) => {
    const addBtn = e.target.closest('[data-notice-add]');
    if (addBtn) {
      closeDialog('noticeHistoryDialog');
      ctx.actions.openNoticeEditor('');
      return;
    }
    const editBtn = e.target.closest('[data-notice-edit]');
    if (editBtn) {
      closeDialog('noticeHistoryDialog');
      ctx.actions.openNoticeEditor(editBtn.getAttribute('data-notice-edit') || '');
    }
  });
  $('noticeEditorCancelBtn')?.addEventListener('click', () => ctx.actions.closeNoticeEditor());
  $('noticeEditorCloseTop')?.addEventListener('click', () => ctx.actions.closeNoticeEditor());
  $('noticeEditorForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    ctx.actions.saveNoticeEditor();
  });
  $('noticeEditorDialog')?.addEventListener('close', () => ctx.actions.closeNoticeEditor({ skipDialogClose: true }));
  $('goalExportCancelBtn')?.addEventListener('click', () => closeDialog('goalExportDialog'));
  document.querySelectorAll('dialog').forEach((dialog) => {
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.close('dismiss');
    });
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#socialPeerMenu') && !e.target.closest('[data-peer-avatar]')) $('socialPeerMenu')?.classList.add('hidden');
    if (!e.target.closest('#socialPeerCardPopup') && !e.target.closest('#socialPeerMenu') && !e.target.closest('[data-peer-avatar]')) $('socialPeerCardPopup')?.classList.add('hidden');
    if (!e.target.closest('#accountIconMenu') && !e.target.closest('#accountHeroIcon')) $('accountIconMenu')?.classList.add('hidden');
    if (!e.target.closest('#songPopup') && !e.target.closest('[data-chart-key]') && !$('songGoalDialog')?.open && !$('songGoalBingoDialog')?.open) hideSongPopup();
    if (!e.target.closest('#graphPopup') && !e.target.closest('#clearGraph') && !e.target.closest('#scoreGraph')) hideGraphPopup();
    if (!e.target.closest('.radar-axis-popup') && !e.target.closest('[data-radar-axis]')) hideRadarAxisPopup();
    if (!e.target.closest('.it-select') && !e.target.closest('.it-search')) closeAllEnhancedSelect();
  });
}
