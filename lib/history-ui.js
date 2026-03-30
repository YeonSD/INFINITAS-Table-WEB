import { RADAR_ORDER } from './constants.js';
import { buildViews, computeRadarProfileFromRows } from './data.js';
import { $, dominantRadarAxis, esc, fmt, normalizeRadarData, radarScoreRatio, titleKey, truncate2 } from './utils.js';

function parseHistoryRecord(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return { updates: [value], goals: [] };
    }
  }
  return typeof value === 'object' ? value : null;
}

function isInitialHistoryRecord(record) {
  return record?.isInitial === true || (Array.isArray(record?.updates) && record.updates.length === 1 && String(record.updates[0]).includes('최초'));
}

function normalizeHistoryUpdate(raw) {
  if (raw && typeof raw === 'object' && raw.kind) return [raw];
  if (raw && typeof raw === 'object') {
    if (raw.title && raw.type && typeof raw.from === 'string' && typeof raw.to === 'string') {
      return [{ kind: 'lamp', table: raw.table || 'SP12H', title: raw.title, type: raw.type, from: raw.from, to: raw.to }];
    }
    if (raw.title && raw.type && (typeof raw.from === 'number' || typeof raw.to === 'number' || typeof raw.diff === 'number')) {
      return [{ kind: 'score', table: raw.table || 'SP12H', title: raw.title, type: raw.type, from: Number(raw.from || 0), to: Number(raw.to || 0), diff: Number(raw.diff || 0) }];
    }
    if (raw.text || raw.summary || raw.message) {
      return [{ kind: 'text', table: raw.table || 'SP12H', text: raw.text || raw.summary || raw.message }];
    }
    return [{ kind: 'text', table: raw.table || 'SP12H', text: JSON.stringify(raw) }];
  }
  return [{ kind: 'text', table: 'SP12H', text: String(raw || '') }];
}

function groupHistoryByTable(items) {
  const groups = { SP10H: [], SP11H: [], SP12H: [] };
  items.forEach((item) => {
    const key = item.table || 'SP12H';
    if (!groups[key]) groups[key] = [];
    groups[key].push(item.html);
  });
  return ['SP10H', 'SP11H', 'SP12H'].map((table) => {
    const rows = groups[table] || [];
    const label = table.replace('H', '');
    return `<div class="history-table-group"><div class="history-table-title">${esc(label)}</div>${rows.length ? `<ul>${rows.map((html) => `<li>${html}</li>`).join('')}</ul>` : '<div class="history-empty">없음</div>'}</div>`;
  }).join('');
}

function computeRadarProfileFromProgress(progress, rankTables, songRadarCatalog) {
  const tableViews = buildViews(rankTables, songRadarCatalog, []);
  const perSong = new Map();
  Object.values(tableViews || {}).forEach((view) => {
    (view?.flatCharts || []).forEach((chart) => {
      const key = `${chart.tableName}|${titleKey(chart.title)}|${chart.type}`;
      const row = progress?.[key];
      const radar = normalizeRadarData(chart.radar);
      const exScore = Number(row?.exScore || 0);
      const noteCount = Number(chart.metaNotes || chart.noteCount || 0);
      if (!row || !radar || !chart.title || exScore <= 0 || noteCount <= 0) return;
      const ratio = radarScoreRatio(exScore, noteCount * 2);
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
          current.axisType[axis] = String(chart.type || 'A').trim().toUpperCase();
        }
      });
      perSong.set(songKey, current);
    });
  });

  const songs = [...perSong.values()];
  const profile = { NOTES: 0, PEAK: 0, SCRATCH: 0, SOFLAN: 0, CHARGE: 0, CHORD: 0 };
  RADAR_ORDER.forEach((axis) => {
    const topRows = songs
      .map((row) => ({ value: Number(row[axis] || 0) }))
      .filter((row) => row.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
    if (!topRows.length) {
      profile[axis] = 0;
      return;
    }
    const scaledSum = topRows.reduce((sum, row) => sum + Math.round(Number(row.value || 0) * 100), 0);
    profile[axis] = Math.floor(scaledSum / topRows.length) / 100;
  });
  const totalScaled = RADAR_ORDER.reduce((sum, axis) => sum + Math.round(Number(profile[axis] || 0) * 100), 0);
  return {
    radar: profile,
    total: totalScaled / 100,
    dominantAxis: dominantRadarAxis(profile)
  };
}

function historyProgressKey(table, title, type) {
  return `${table || 'SP12H'}|${titleKey(title || '')}|${String(type || 'A').trim().toUpperCase()}`;
}

function reconstructPreviousProgressFromHistoryRecord(record) {
  const currentProgress = record?.snapshotProgress && typeof record.snapshotProgress === 'object'
    ? record.snapshotProgress
    : null;
  if (!currentProgress) return null;
  const updatesRaw = Array.isArray(record?.updates) ? record.updates : (Array.isArray(record?.events) ? record.events : []);
  const normalized = updatesRaw.flatMap(normalizeHistoryUpdate);
  if (!normalized.length) return null;
  const prevProgress = JSON.parse(JSON.stringify(currentProgress));
  let changed = false;
  normalized.forEach((item) => {
    if (!item || !item.title || !item.type) return;
    if (item.kind !== 'score' && item.kind !== 'lamp') return;
    const key = historyProgressKey(item.table, item.title, item.type);
    const prevRow = prevProgress[key] && typeof prevProgress[key] === 'object'
      ? { ...prevProgress[key] }
      : {};
    if (item.kind === 'score' && Number.isFinite(Number(item.from))) {
      prevRow.exScore = Number(item.from || 0);
      changed = true;
    }
    if (item.kind === 'lamp' && typeof item.from === 'string') {
      prevRow.clearStatus = item.from || 'NOPLAY';
      changed = true;
    }
    prevProgress[key] = prevRow;
  });
  return changed ? prevProgress : null;
}

function buildRadarHistoryEvents(currentRecord, prevRecord, rankTables, songRadarCatalog) {
  if (!rankTables || !songRadarCatalog) return [];
  const currentProgress = currentRecord?.snapshotProgress && typeof currentRecord.snapshotProgress === 'object'
    ? currentRecord.snapshotProgress
    : null;
  const prevProgress = prevRecord?.snapshotProgress && typeof prevRecord.snapshotProgress === 'object'
    ? prevRecord.snapshotProgress
    : null;
  const currentRows = Array.isArray(currentRecord?.snapshotRows) ? currentRecord.snapshotRows : null;
  const prevRows = Array.isArray(prevRecord?.snapshotRows) ? prevRecord.snapshotRows : null;
  const reconstructedPrevProgress = !prevProgress && currentProgress
    ? reconstructPreviousProgressFromHistoryRecord(currentRecord)
    : null;
  const currentProfile = currentProgress
    ? computeRadarProfileFromProgress(currentProgress, rankTables, songRadarCatalog)
    : (currentRows ? computeRadarProfileFromRows(currentRows, rankTables, songRadarCatalog) : null);
  const prevProfile = prevProgress
    ? computeRadarProfileFromProgress(prevProgress, rankTables, songRadarCatalog)
    : (prevRows
      ? computeRadarProfileFromRows(prevRows, rankTables, songRadarCatalog)
      : (reconstructedPrevProgress ? computeRadarProfileFromProgress(reconstructedPrevProgress, rankTables, songRadarCatalog) : null));
  if (!currentProfile || !prevProfile) return [];
  const events = [];
  ['NOTES', 'CHORD', 'PEAK', 'SCRATCH', 'SOFLAN', 'CHARGE'].forEach((axis) => {
    const from = Number(prevProfile?.radar?.[axis] || 0);
    const to = Number(currentProfile?.radar?.[axis] || 0);
    if (Math.abs(to - from) < 0.005) return;
    const diff = truncate2(to - from);
    const sign = diff > 0 ? '+' : '';
    events.push({
      html: `${esc(axis)} ${from.toFixed(2)} -> ${to.toFixed(2)} <strong>(${sign}${diff.toFixed(2)})</strong>`
    });
  });
  const totalFrom = Number(prevProfile?.total || 0);
  const totalTo = Number(currentProfile?.total || 0);
  if (Math.abs(totalTo - totalFrom) >= 0.005) {
    const diff = truncate2(totalTo - totalFrom);
    const sign = diff > 0 ? '+' : '';
    events.push({
      html: `TOTAL ${totalFrom.toFixed(2)} -> ${totalTo.toFixed(2)} <strong>(${sign}${diff.toFixed(2)})</strong>`
    });
  }
  return events;
}

function buildHistoryDetailCardHtml(record, options = {}) {
  const parsed = parseHistoryRecord(record);
  if (!parsed) return '<div class="history-empty">상세 데이터를 찾을 수 없습니다.</div>';
  const sectionOpen = options.sectionOpen || { clear: false, ramp: false, goal: false, radar: false };
  const animate = !!options.animate;
  const hideTimestamp = !!options.hideTimestamp;
  const sectionAttr = String(options.sectionAttr || 'data-history-section');
  const radarEvents = buildRadarHistoryEvents(
    parsed,
    parseHistoryRecord(options.prevRecord),
    options.rankTables,
    options.songRadarCatalog
  );
  const timestampHtml = hideTimestamp ? '' : `<div><strong>${esc(fmt(parsed.timestamp || ''))}</strong></div>`;
  if (isInitialHistoryRecord(parsed)) {
    return `<div class="history-detail-card ${animate ? 'animate' : ''}">${timestampHtml}<div class="history-empty" style="margin-top:10px;">최초 업로드 데이터입니다.</div></div>`;
  }
  const updatesRaw = Array.isArray(parsed.updates) ? parsed.updates : (Array.isArray(parsed.events) ? parsed.events : []);
  const normalized = updatesRaw.flatMap(normalizeHistoryUpdate);
  const lampColor = (status) => {
    const map = { NOPLAY: '#8a8a8a', FAILED: '#8a8a8a', ASSIST: '#c9b4c3', EASY: '#79b654', NORMAL: '#6f8fcb', HARD: '#f28a2f', EXHARD: '#e0b900', FC: '#3fc6dc', FULLCOMBO: '#3fc6dc' };
    return `<span style="font-weight:700;color:${map[status] || '#333'}">${esc(status || '-')}</span>`;
  };
  const lampEvents = normalized.filter((item) => item.kind === 'lamp').map((item) => ({
    table: item.table || 'SP12H',
    html: `${esc(item.title)} [${esc(item.type)}] ${lampColor(item.from)} -> ${lampColor(item.to)}`
  }));
  const scoreEvents = normalized.filter((item) => item.kind === 'score').map((item) => ({
    table: item.table || 'SP12H',
    html: `${esc(item.title)} [${esc(item.type)}] ${esc(item.from)} -> ${esc(item.to)} <strong>(${(item.diff >= 0 ? '+' : '') + item.diff})</strong>`
  }));
  const miscEvents = normalized.filter((item) => item.kind === 'text').map((item) => ({
    table: item.table || 'SP12H',
    html: esc(item.text || '')
  }));
  const panel = (key, title, items, grouped = true) => {
    const disabled = items.length === 0;
    const open = !!sectionOpen[key] && !disabled;
    const body = disabled
      ? '<div class="history-empty">갱신된 항목이 없습니다.</div>'
      : (grouped ? groupHistoryByTable(items) : `<ul>${items.map((item) => `<li>${item.html}</li>`).join('')}</ul>`);
    return `<div class="history-section">
      <button class="history-accordion-btn ${disabled ? 'disabled' : ''} ${open ? 'open' : ''}" ${sectionAttr}="${esc(key)}" ${disabled ? 'disabled' : ''}>
        <span>${esc(title)} (${items.length || '없음'})</span>
        <span class="history-chevron">▼</span>
      </button>
      <div class="history-accordion-panel ${open ? 'open' : ''}">${body}</div>
    </div>`;
  };
  return `<div class="history-detail-card ${animate ? 'animate' : ''}">
    ${timestampHtml}
    <div class="history-sections">
      ${panel('clear', '램프 갱신', lampEvents)}
      ${panel('ramp', '스코어 갱신', [...scoreEvents, ...miscEvents])}
      ${panel('radar', '레이더 갱신', radarEvents, false)}
    </div>
  </div>`;
}

export function renderHistory(ctx) {
  if (!ctx.isAuthorized()) {
    $('historyList').innerHTML = '<div class="history-empty">로그인 후 프로필을 등록하면 히스토리가 표시됩니다.</div>';
    $('historyDetail').innerHTML = '<div class="history-detail-card">게스트 모드에서는 히스토리가 저장되지 않습니다.</div>';
    return;
  }
  const history = [...(ctx.state.profile.history || [])].reverse();
  if (!history.length) {
    $('historyList').innerHTML = '<div class="history-empty">히스토리가 없습니다.</div>';
    $('historyDetail').innerHTML = '<div class="history-detail-card">TSV 업로드 기록이 이곳에 표시됩니다.</div>';
    return;
  }
  const latestId = history[0]?.id || '';
  const hasSelected = !!ctx.state.selectedHistoryId && history.some((record) => record.id === ctx.state.selectedHistoryId);
  const selected = history.find((record) => record.id === ctx.state.selectedHistoryId) || null;
  const rollbackDisabled = !selected || selected.id === latestId;
  $('historyList').innerHTML = `<div class="history-list-scroll">${history.map((record, idx) => {
    const isNew = !ctx.state.historySeenIds.has(record.id);
    const isInitial = isInitialHistoryRecord(record);
    const isLatest = record.id === latestId;
    return `<div class="history-item ${selected?.id === record.id ? 'active' : ''} ${isNew ? 'hist-new' : ''} history-item-select" style="--i:${idx}" data-history-id="${esc(record.id)}">
      <div class="history-item-main">
        <span>${esc(fmt(record.timestamp || ''))}</span>
        ${isInitial ? '<span class="history-initial-tag">(최초)</span>' : ''}
        ${isLatest ? '<span class="history-latest-tag">(최신)</span>' : ''}
      </div>
      <div class="history-item-sub">${esc(record.summary || '')}</div>
    </div>`;
  }).join('')}</div>
    <div class="history-roll-wrap">
      <button id="btnHistoryRollback" class="small-btn ${rollbackDisabled ? 'disabled-btn' : ''}" ${rollbackDisabled ? 'disabled' : ''}>롤백</button>
    </div>`;
  history.forEach((record) => ctx.state.historySeenIds.add(record.id));
  if (!hasSelected) {
    $('historyDetail').innerHTML = '<div class="history-empty">왼쪽 히스토리를 선택하면 상세가 열립니다.</div>';
    return;
  }
  $('historyDetail').innerHTML = buildHistoryDetailCardHtml(selected, {
    sectionOpen: ctx.state.historySectionOpen,
    animate: ctx.state.historyAnimateDetail,
    prevRecord: (() => {
      const records = ctx.state.profile.history || [];
      const index = records.findIndex((record) => record.id === selected.id);
      return index > 0 ? records[index - 1] : null;
    })(),
    rankTables: ctx.state.rankTables,
    songRadarCatalog: ctx.state.songRadarCatalog
  });
  ctx.state.historyAnimateDetail = false;
}

export function renderSocialHistoryPopup(ctx) {
  const popup = $('socialHistoryPopup');
  const popupState = ctx.state.socialHistoryPopup;
  if (!popup) return;
  if (!popupState?.open) {
    if (popup.open) popup.close('dismiss');
    popup.innerHTML = '';
    return;
  }
  const body = popupState.loading
    ? '<div class="history-empty">불러오는 중...</div>'
    : (popupState.error
      ? `<div class="history-empty">${esc(popupState.error)}</div>`
      : buildHistoryDetailCardHtml(popupState.history, {
        sectionOpen: popupState.sectionOpen,
        animate: false,
        hideTimestamp: true,
        sectionAttr: 'data-social-history-section',
        prevRecord: popupState.prevHistory,
        rankTables: ctx.state.rankTables,
        songRadarCatalog: ctx.state.songRadarCatalog
      }));
  popup.innerHTML = `<div class="social-history-popup-card">
    <div class="social-history-popup-head">
      <div class="social-history-popup-title">팔로우 히스토리 상세</div>
      <button type="button" class="social-history-popup-close" data-social-history-close="1" aria-label="닫기">×</button>
    </div>
    <div class="social-item-sub social-history-popup-sub">${esc(popupState.peerLabel || '')}</div>
    <div class="social-history-popup-body">${body}</div>
  </div>`;
  if (!popup.open) popup.showModal();
}
