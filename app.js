import { DEFAULT_ICON_SRC } from './lib/constants.js';
import {
  emptyProfile,
  buildViews,
  computeRadarProfileFromRows,
  createEmptyBingoState,
  makeEvents,
  normalizeBingoState,
  normalizeProfile,
  progressMap
} from './lib/data.js';
import { authClient, ensureAuthServerReady, getInitialSession, loadAppNotices, loadProfileFromCloud, onAuthStateChange, purgeProfile, refreshSocialOverview, requestSnapshotPublish, rpc, saveAppNotice, saveBingoStateToCloud, saveProfileToCloud, saveProgressStateToCloud, saveSocialSettingsToCloud, saveUserProfileToCloud, signInWithGoogle, signOut as authSignOut } from './lib/auth.js';
import { bindUi, renderApp, renderDeferredPanel, showPeerRadarDialog, showRadarDialog, showSongPopup } from './lib/ui.js';
import { createAccountController } from './lib/app-account-controller.js';
import { createRenderController } from './lib/app-render-controller.js';
import { createGoalsController } from './lib/goals-controller.js';
import { createSocialController } from './lib/social-controller.js';
import { normalizeBannerImage, normalizeIconImage, loadImageElementFromFile, readFileAsDataUrl, validateIconFile } from './lib/image-tools.js';
import { fetchJsonOptional, readJsonCache, writeJsonCache } from './lib/local-cache.js';
import { $, downloadBlob, esc, formatInfinitasIdDisplay, goalAchieved, goalLabel, normalizeInfinitasIdForSearch, normalizeSocialSettings, parseTsv, rowsToTsv, showToast, titleKey } from './lib/utils.js';
import { LAMP_ORDER } from './lib/constants.js';
import { buildRowIndex, findRowByTitle, rowStats, truncate2 } from './lib/utils.js';

function createHistorySectionState() {
  return { clear: false, ramp: false, goal: false, radar: false };
}

const ADMIN_EMAILS = new Set(['qscse75359@gmail.com']);
const SONG_CATEGORY_SORT_HINTS = new Map([
  ['10', 10],
  ['9', 9],
  ['8', 8],
  ['7', 7],
  ['6', 6],
  ['5', 5],
  ['4', 4],
  ['3', 3],
  ['2', 2],
  ['1', 1],
  ['지력S+', 1],
  ['개인차S+', 2],
  ['지력S', 3],
  ['개인차S', 4],
  ['지력A+', 5],
  ['개인차A+', 6],
  ['지력A', 5],
  ['개인차A', 6],
  ['지력B+', 7],
  ['개인차B+', 8],
  ['지력B', 7],
  ['개인차B', 8],
  ['지력C', 9],
  ['개인차C', 10],
  ['지력D', 11],
  ['개인차D', 12],
  ['지력E', 13],
  ['개인차E', 14],
  ['지력F', 15],
  ['초개인차', 19],
  ['INFINITAS 전용곡', 20],
  ['미정', 998],
  ['미분류', 999]
]);
const SONG_CATEGORY_OPTIONS = [
  '10', '9', '8', '7', '6', '5', '4', '3', '2', '1',
  '지력S+', '개인차S+', '지력S', '개인차S', '지력A+', '개인차A+', '지력A', '개인차A',
  '지력B+', '개인차B+', '지력B', '개인차B', '지력C', '개인차C', '지력D', '개인차D',
  '지력E', '개인차E', '지력F', '초개인차', 'INFINITAS 전용곡', '미정', '미분류'
];

const state = {
  activeTable: 'SP11H',
  sortMode: 'name',
  viewMode: 'normal',
  activePanel: 'rank',
  settingsTab: 'general',
  searchQuery: '',
  goalSongQuery: '',
  rankTables: {},
  songRadarCatalog: null,
  appMeta: {
    version: '1.0.0',
    publishedAt: '',
    snapshotPath: './assets/data/app-snapshot.json',
    notices: []
  },
  tableViews: {},
  guest: {
    trackerRows: [],
    uploadedTrackerName: '',
    djName: 'GUEST',
    infinitasId: 'C-0000-0000-0000'
  },
  profile: null,
  auth: {
    user: null,
    session: null,
    signedIn: false,
    loading: true,
    profileReady: false,
    isAdmin: false
  },
  selectedHistoryId: '',
  historySectionOpen: createHistorySectionState(),
  historySeenIds: new Set(),
  historyAnimateDetail: false,
  selectedChart: null,
  social: {
    overviewRows: [], 
    feedItems: [],
    followerRows: []
  },
  signup: {
    open: false,
    step: 1,
    djName: '',
    infinitasId: '',
    message: ''
  },
  noticeEditor: {
    open: false,
    id: ''
  },
  songMetaEditor: {
    open: false,
    chartKey: '',
    tableKey: '',
    songTitle: '',
    chartType: ''
  },
  snapshotPublish: {
    busy: false,
    needsPublish: false,
    message: '',
    workflowUrl: ''
  },
  bingoPreview: null,
    socialHistoryPopup: {
      open: false,
      feedId: '',
      peerUserId: '',
    historyId: '',
    peerLabel: '',
    loading: false,
    error: '',
      history: null,
      prevHistory: null,
      sectionOpen: createHistorySectionState()
    },
    songGoalPickerPayload: null
  };

let tsvInput = null;
let goalImportInput = null;
const SNAPSHOT_META_CACHE_KEY = 'itm.snapshot.version';
const SNAPSHOT_DATA_CACHE_KEY = 'itm.snapshot.data';
const BINGO_DRAFT_CACHE_KEY_PREFIX = 'itm.bingo.draft.';
let createRenderContext = () => ({
  state,
  isAuthorized,
  currentTrackerLabel,
  activeSocialSettings: currentSocialSettings,
  progressMap: () => progressMap(state.tableViews),
  iconSrc
});
let render = () => {};
let setActivePanel = () => {};

function latestHistoryId(history = []) {
  return history.length ? history[history.length - 1].id || '' : '';
}

function normalizeAppNoticeList(rawNotices) {
  if (!Array.isArray(rawNotices)) return [];
  return rawNotices
    .map((notice, index) => {
      if (!notice || typeof notice !== 'object') return null;
      const items = Array.isArray(notice.items)
        ? notice.items.map((item) => String(item || '').trim()).filter(Boolean)
        : [];
      return {
        id: String(notice.id || `notice-${index + 1}`).trim(),
        version: String(notice.version || '').trim(),
        title: String(notice.title || '').trim(),
        summary: String(notice.summary || '').trim(),
        publishedAt: String(notice.publishedAt || notice.published_at || '').trim(),
        items
      };
    })
    .filter((notice) => notice && (notice.title || notice.summary || notice.items.length))
    .sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')));
}

function isAdminAccount(user = state.auth.user) {
  const email = String(user?.email || '').trim().toLowerCase();
  return !!email && ADMIN_EMAILS.has(email);
}

function defaultSortIndexForCategory(category, fallback = 999) {
  const name = String(category || '').trim();
  if (SONG_CATEGORY_SORT_HINTS.has(name)) return Number(SONG_CATEGORY_SORT_HINTS.get(name));
  return Number.isFinite(Number(fallback)) ? Number(fallback) : 999;
}

function markSnapshotPublishNeeded(message = 'DB 변경사항이 있어 정적 스냅샷 재배포가 필요합니다.') {
  state.snapshotPublish = {
    ...state.snapshotPublish,
    needsPublish: true,
    message,
    workflowUrl: ''
  };
}

function setBusyOverlay(open, title = '불러오는 중...', message = '잠시만 기다려주세요.') {
  const overlay = $('busyOverlay');
  if (!overlay) return;
  $('busyOverlayTitle').textContent = title;
  $('busyOverlayMessage').textContent = message;
  overlay.classList.toggle('hidden', !open);
  document.body.classList.toggle('busy-open', !!open);
}

async function withBusyOverlay(title, message, task) {
  setBusyOverlay(true, title, message);
  try {
    return await task();
  } finally {
    setBusyOverlay(false);
  }
}

async function withTimeout(taskPromise, timeoutMs, code = 'timeout') {
  const safeTimeout = Math.max(1000, Number(timeoutMs || 0));
  const timeoutTag = Symbol(code);
  const result = await Promise.race([
    taskPromise,
    new Promise((resolve) => setTimeout(() => resolve(timeoutTag), safeTimeout))
  ]);
  if (result === timeoutTag) {
    const error = new Error(code);
    error.code = code;
    throw error;
  }
  return result;
}

function describeRemoteError(error, fallback = '서버 연결이 원활하지 않습니다. 잠시 후 다시 시도하세요.') {
  const raw = String(error?.message || error || '').replace(/\s+/g, ' ').trim();
  if (!raw) return fallback;
  if (
    /<!doctype html>|<html/i.test(raw) ||
    /error code 522/i.test(raw) ||
    /connection timed out/i.test(raw) ||
    /timed out|timeout|failed to fetch|load failed|network/i.test(raw)
  ) {
    return fallback;
  }
  return raw.length > 160 ? `${raw.slice(0, 157)}...` : raw;
}

function isAuthorized() {
  return state.auth.signedIn && state.auth.profileReady && !!state.profile;
}

function iconSrc() {
  return state.profile?.iconDataUrl || DEFAULT_ICON_SRC;
}

function currentRows() {
  return isAuthorized() ? (state.profile.trackerRows || []) : (state.guest.trackerRows || []);
}

function currentTrackerLabel() {
  if (isAuthorized()) return state.profile?.djName || 'DJ NAME';
  if (state.auth.signedIn) return state.auth.user?.email || 'Google 로그인 완료';
  return state.guest.uploadedTrackerName || '데이터 미업로드';
}

function currentSocialSettings() {
  return isAuthorized() ? normalizeSocialSettings(state.profile.socialSettings) : normalizeSocialSettings({});
}

async function refreshAppNotices(options = {}) {
  const renderAfter = options.renderAfter !== false;
  const silent = options.silent === true;
  try {
    const cloudNotices = await loadAppNotices();
    if (cloudNotices.length) state.appMeta.notices = normalizeAppNoticeList(cloudNotices);
  } catch (error) {
    if (!silent) showToast(`공지사항 불러오기 실패: ${describeRemoteError(error, '공지사항을 불러오지 못했습니다.')}`);
  }
  if (renderAfter) render();
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function normalizeBingoSize(sizeRaw) {
  const size = Number(sizeRaw || 3);
  return [3, 4, 5].includes(size) ? size : 3;
}

function createEmptyBingoDraft(size = 3) {
  const normalizedSize = normalizeBingoSize(size);
  return {
    size: normalizedSize,
    cells: Array.from({ length: normalizedSize * normalizedSize }, () => null),
    updatedAt: ''
  };
}

function boardHasAssignments(board) {
  return Array.isArray(board?.cells) && board.cells.some(Boolean);
}

function boardIsFull(board) {
  return Array.isArray(board?.cells) && board.cells.length > 0 && board.cells.every(Boolean);
}

function goalSignature(goal) {
  if (!goal) return '';
  const kind = String(goal.kind || 'CLEAR').trim().toUpperCase();
  const target = kind === 'SCORE'
    ? `S:${Math.max(0, Number(goal.targetScore || 0))}`
    : kind === 'RANK'
      ? `R:${String(goal.targetRank || 'AA').trim().toUpperCase()}`
      : `C:${String(goal.targetLamp || 'HC').trim().toUpperCase()}`;
  return [
    String(goal.table || '').trim(),
    titleKey(goal.title || ''),
    String(goal.chartType || goal.type || 'A').trim().toUpperCase(),
    kind,
    target
  ].join('|');
}

function normalizeGoalSnapshotForBingo(goal) {
  if (!goal || typeof goal !== 'object') return null;
  const snapshot = {
    id: String(goal.id || '').trim(),
    table: String(goal.table || '').trim(),
    title: String(goal.title || '').trim(),
    chartType: String(goal.chartType || goal.type || 'A').trim().toUpperCase(),
    kind: String(goal.kind || 'CLEAR').trim().toUpperCase(),
    source: String(goal.source || '').trim()
  };
  if (!snapshot.table || !snapshot.title) return null;
  if (snapshot.kind === 'SCORE') snapshot.targetScore = Math.max(0, Number(goal.targetScore || 0));
  else if (snapshot.kind === 'RANK') snapshot.targetRank = String(goal.targetRank || 'AA').trim().toUpperCase() || 'AA';
  else snapshot.targetLamp = String(goal.targetLamp || 'HC').trim().toUpperCase() || 'HC';
  return snapshot;
}

function ensureBingoState(profile = state.profile) {
  if (!profile) return createEmptyBingoState();
  const normalized = normalizeBingoState(profile.bingoState);
  if (profile.bingoState && typeof profile.bingoState === 'object') {
    Object.keys(profile.bingoState).forEach((key) => {
      delete profile.bingoState[key];
    });
    Object.assign(profile.bingoState, normalized);
  } else {
    profile.bingoState = normalized;
  }
  return profile.bingoState;
}

function bingoDraftCacheKey(user = state.auth.user) {
  const userId = String(user?.id || '').trim();
  return userId ? `${BINGO_DRAFT_CACHE_KEY_PREFIX}${userId}` : '';
}

function clearBingoDraftCache(user = state.auth.user) {
  const key = bingoDraftCacheKey(user);
  if (!key) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage errors and continue.
  }
}

function persistBingoDraftCache(profile = state.profile, user = state.auth.user) {
  const key = bingoDraftCacheKey(user);
  if (!key || !profile) return;
  const bingo = ensureBingoState(profile);
  if (!String(bingo.draft?.updatedAt || '').trim()) {
    clearBingoDraftCache(user);
    return;
  }
  writeJsonCache(key, {
    draft: cloneJson(bingo.draft),
    activeBoardId: String(bingo.activeBoardId || '').trim(),
    selectedCellIndex: Number.isInteger(bingo.selectedCellIndex) ? bingo.selectedCellIndex : -1,
    selectedGoalId: String(bingo.selectedGoalId || '').trim()
  });
}

function restoreBingoDraftCache(profile = state.profile, user = state.auth.user) {
  const key = bingoDraftCacheKey(user);
  if (!key || !profile) return false;
  const cached = readJsonCache(key);
  const updatedAt = String(cached?.draft?.updatedAt || '').trim();
  if (!updatedAt) return false;
  const size = normalizeBingoSize(cached?.draft?.size || 3);
  const cells = Array.isArray(cached?.draft?.cells)
    ? cached.draft.cells.slice(0, size * size).map(normalizeGoalSnapshotForBingo)
    : [];
  while (cells.length < size * size) cells.push(null);
  const bingo = ensureBingoState(profile);
  bingo.draft = {
    size,
    cells,
    updatedAt
  };
  const nextActiveBoardId = String(cached?.activeBoardId || '').trim();
  bingo.activeBoardId = currentSavedBoards().some((board) => String(board?.id || '') === nextActiveBoardId)
    ? nextActiveBoardId
    : '';
  if (!bingo.activeBoardId && isMirroredSavedBoardDraft(bingo.draft, currentSavedBoards())) {
    bingo.draft = {
      ...createEmptyBingoDraft(size),
      updatedAt
    };
  }
  syncPublishedFromSavedBoards();
  bingo.selectedCellIndex = Number.isInteger(cached?.selectedCellIndex) ? cached.selectedCellIndex : -1;
  bingo.selectedGoalId = String(cached?.selectedGoalId || '').trim();
  persistBingoDraftCache(profile, user);
  return true;
}

function currentBingoDraft() {
  return ensureBingoState().draft;
}

function currentSavedBoards() {
  return ensureBingoState().savedBoards || [];
}

function currentPublishedBingo() {
  return ensureBingoState().published || null;
}

function syncPublishedFromSavedBoards() {
  const bingo = ensureBingoState();
  const active = currentSavedBoards().find((board) => String(board?.id || '') === String(bingo.activeBoardId || '')) || null;
  bingo.published = active ? cloneJson(active) : null;
}

function selectSavedBoardLocally(boardId, options = {}) {
  const bingo = ensureBingoState();
  const board = currentSavedBoards().find((row) => String(row?.id || '') === String(boardId || '')) || null;
  bingo.activeBoardId = board?.id || '';
  syncPublishedFromSavedBoards();
  bingo.selectedCellIndex = -1;
  bingo.selectedGoalId = '';
  if (options.persistCache !== false) persistBingoDraftCache();
}

function upsertSavedBoard(board) {
  const bingo = ensureBingoState();
  const nextBoard = cloneJson(board);
  const index = currentSavedBoards().findIndex((row) => String(row?.id || '') === String(nextBoard?.id || ''));
  if (index >= 0) bingo.savedBoards[index] = nextBoard;
  else bingo.savedBoards = [...currentSavedBoards(), nextBoard].slice(0, 5);
  bingo.activeBoardId = String(nextBoard.id || '').trim();
  syncPublishedFromSavedBoards();
}

function removeSavedBoard(boardId) {
  const bingo = ensureBingoState();
  bingo.savedBoards = currentSavedBoards().filter((board) => String(board?.id || '') !== String(boardId || ''));
  bingo.activeBoardId = String(bingo.savedBoards[0]?.id || '');
  bingo.published = null;
  syncPublishedFromSavedBoards();
}

function boardSignature(board) {
  return JSON.stringify({
    size: normalizeBingoSize(board?.size),
    cells: Array.isArray(board?.cells) ? board.cells : []
  });
}

function isMirroredSavedBoardDraft(draft, savedBoards = currentSavedBoards()) {
  if (!boardHasAssignments(draft)) return false;
  const draftSig = boardSignature(draft);
  return savedBoards.some((board) => boardSignature(board) === draftSig);
}

function hasPublishedOnlyBingo() {
  const published = currentPublishedBingo();
  if (!published || !boardIsFull(published)) return false;
  return !String(currentBingoDraft()?.updatedAt || '').trim();
}

function findGoalPoolItem(goalId) {
  return (state.profile?.goals || []).find((goal) => String(goal.id || '') === String(goalId || '')) || null;
}

function findChartForGoal(goal) {
  if (!goal) return null;
  const view = state.tableViews?.[goal.table];
  return view?.flatCharts?.find((chart) => titleKey(chart.title) === titleKey(goal.title) && chart.type === goal.chartType) || null;
}

function bingoGoalAchieved(goal) {
  return !!goal && goalAchieved(goal, progressMap(state.tableViews));
}

function bingoBoardCompleted(board) {
  return Array.isArray(board?.cells) && board.cells.length > 0 && board.cells.every((goal) => goal && bingoGoalAchieved(goal));
}

function syncGoalStoreFromBingoDraft() {
  if (!state.profile) return;
  const cells = Array.isArray(currentBingoDraft()?.cells) ? currentBingoDraft().cells : [];
  state.profile.goals = cells
    .filter(Boolean)
    .map((goal, index) => ({
      ...cloneJson(goal),
      id: String(goal.id || `bingo-cell-${index}`),
      source: String(goal.source || state.profile.djName || '').trim()
    }));
}

function resetBingoStateLocally(size = 3) {
  if (!state.profile) return;
  state.profile.bingoState = createEmptyBingoState(size);
  clearBingoDraftCache();
  syncGoalStoreFromBingoDraft();
}

function bingoExportPayload() {
  const board = currentPublishedBingo();
  if (!board || !boardIsFull(board)) return null;
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    bingo: {
      name: board.name || '',
      size: board.size,
      cells: cloneJson(board.cells || [])
    }
  };
}

function buildBingoTransferPayload(board = currentPublishedBingo()) {
  if (!board || !boardIsFull(board)) return null;
  return {
    name: String(board.name || '').trim(),
    size: normalizeBingoSize(board.size),
    cells: cloneJson(board.cells || [])
  };
}

function normalizeIncomingBingo(rawBingo) {
  if (!rawBingo || typeof rawBingo !== 'object') return null;
  const size = normalizeBingoSize(rawBingo.size);
  const cells = Array.isArray(rawBingo.cells)
    ? rawBingo.cells.slice(0, size * size).map(normalizeGoalSnapshotForBingo)
    : [];
  while (cells.length < size * size) cells.push(null);
  if (!cells.every(Boolean)) return null;
  return {
    id: crypto.randomUUID(),
    name: String(rawBingo.name || '').trim(),
    size,
    cells
  };
}

function buildBingoPreviewHtml(preview) {
  if (!preview) return '<div class="history-empty">표시할 빙고가 없습니다.</div>';
  const cells = Array.isArray(preview.cells) ? preview.cells : [];
  const size = normalizeBingoSize(preview.size);
  const cellsHtml = cells.map((goal, index) => {
    if (!goal) {
      return `<div class="bingo-preview-cell bingo-preview-empty"><div class="bingo-preview-index">${index + 1}</div><div class="bingo-preview-empty-label">빈 칸</div></div>`;
    }
    return `<div class="bingo-preview-cell">
      <div class="bingo-preview-index">${index + 1}</div>
      <div class="bingo-preview-table">${esc(goal.table || '')}</div>
      <div class="bingo-preview-title">${esc(goal.title || '')}</div>
      <div class="bingo-preview-meta">[${esc(goal.chartType || '')}] / ${esc(goal.kind || '')}</div>
      <div class="bingo-preview-target">목표 ${esc(goalLabel(goal))}</div>
    </div>`;
  }).join('');
  return `<div class="bingo-preview-shell">
    <div class="bingo-preview-head">
      <div class="bingo-preview-name">${esc(preview.name || '이름 없는 빙고')}</div>
      <div class="bingo-preview-sub">${preview.senderLabel ? `공유자: ${esc(preview.senderLabel)}` : '빙고 미리보기'}</div>
    </div>
    <div class="bingo-preview-grid size-${size}">
      ${cellsHtml}
    </div>
  </div>`;
}

function openBingoPreview(preview) {
  state.bingoPreview = preview || null;
  $('bingoPreviewBody').innerHTML = buildBingoPreviewHtml(state.bingoPreview);
  $('bingoPreviewDialog')?.showModal();
}

function findFeedItemById(eventId) {
  return (state.social.feedItems || []).find((item) => String(item.id || '') === String(eventId || '')) || null;
}

function buildCompletionNoticeIfNeeded() {
  if (!isAuthorized()) return null;
  const published = currentPublishedBingo();
  if (!published?.sharedFromUserId || published.completionNotifiedAt) return null;
  if (!bingoBoardCompleted(published)) return null;
  published.completionNotifiedAt = new Date().toISOString();
  return {
    senderUserId: String(published.sharedFromUserId || ''),
    bingoName: String(published.name || '빙고').trim() || '빙고'
  };
}

function createSavedBoardFromDraft(draft, name, baseBoard = null) {
  return {
    id: String(baseBoard?.id || crypto.randomUUID()),
    name: String(name || '').trim(),
    size: normalizeBingoSize(draft?.size),
    cells: cloneJson(draft?.cells || []),
    savedAt: new Date().toISOString(),
    sharedFromUserId: String(baseBoard?.sharedFromUserId || ''),
    sharedFromDjName: String(baseBoard?.sharedFromDjName || ''),
    sharedFromInfinitasId: String(baseBoard?.sharedFromInfinitasId || ''),
    completionNotifiedAt: String(baseBoard?.completionNotifiedAt || '')
  };
}

function startNewBingoDraft(sizeRaw = null) {
  if (!isAuthorized()) return;
  const bingo = ensureBingoState();
  const nextSize = normalizeBingoSize(sizeRaw || bingo.draft.size || 3);
  bingo.activeBoardId = '';
  bingo.published = null;
  bingo.draft = createEmptyBingoDraft(nextSize);
  bingo.draft.updatedAt = new Date().toISOString();
  bingo.selectedCellIndex = -1;
  bingo.selectedGoalId = '';
  syncGoalStoreFromBingoDraft();
  persistBingoDraftCache();
  render();
}

function openBingoSizeDialog() {
  if (!isAuthorized()) return;
  const bingo = ensureBingoState();
  if (bingo.draft.updatedAt) {
    showToast('현재 [빙고 작성]을 먼저 저장하거나 삭제하세요.');
    return;
  }
  const published = currentPublishedBingo();
  const draft = currentBingoDraft();
  const hasUnsavedChanges = boardHasAssignments(draft) && (!published || boardSignature(draft) !== boardSignature(published));
  if (hasUnsavedChanges && !window.confirm('현재 작성 중인 빙고가 초기화됩니다. 계속할까요?')) return;
  $('bingoSizePickerDialog')?.showModal();
}

function closeBingoSizeDialog() {
  $('bingoSizePickerDialog')?.close('cancel');
}

function createBingoFromSize(sizeRaw) {
  startNewBingoDraft(sizeRaw);
  $('bingoSizePickerDialog')?.close('done');
}

function selectSavedBingo(boardId) {
  if (!isAuthorized()) return;
  selectSavedBoardLocally(boardId);
  syncGoalStoreFromBingoDraft();
  render();
}

async function flushCompletionNotice(notice) {
  if (!notice?.senderUserId) return;
  try {
    await rpc('notify_bingo_completion', {
      p_sender_user_id: notice.senderUserId,
      p_bingo_name: notice.bingoName
    });
    await syncSocial();
  } catch (error) {
    console.error('Bingo completion notify failed', error);
  }
}

function closeSocialHistoryPopup() {
  state.socialHistoryPopup = {
    open: false,
    feedId: '',
    peerUserId: '',
    historyId: '',
    peerLabel: '',
    loading: false,
    error: '',
    history: null,
    prevHistory: null,
    sectionOpen: createHistorySectionState()
  };
}

function rebuildViews() {
  state.tableViews = buildViews(state.rankTables, state.songRadarCatalog, currentRows());
}

async function loadStaticData(forceRefresh = false) {
  const cachedMeta = !forceRefresh ? readJsonCache(SNAPSHOT_META_CACHE_KEY) : null;
  const cachedSnapshot = !forceRefresh ? readJsonCache(SNAPSHOT_DATA_CACHE_KEY) : null;
  const versionMetaUrl = forceRefresh
    ? `./assets/data/snapshot-version.json?ts=${Date.now()}`
    : './assets/data/snapshot-version.json';
  const versionMeta = await fetchJsonOptional(versionMetaUrl, forceRefresh ? 'reload' : 'no-store');
  const snapshotPath = String(versionMeta?.snapshotPath || cachedMeta?.snapshotPath || './assets/data/app-snapshot.json');
  const version = String(versionMeta?.version || cachedMeta?.version || 'dev');
  state.appMeta = {
    version,
    publishedAt: String(versionMeta?.publishedAt || cachedMeta?.publishedAt || '').trim(),
    snapshotPath,
    notices: normalizeAppNoticeList(versionMeta?.notices || cachedMeta?.notices || [])
  };
  const canUseCachedSnapshot = !forceRefresh
    && cachedMeta
    && cachedSnapshot?.rankTables
    && String(cachedMeta.version || '') === version
    && String(cachedMeta.snapshotPath || '') === snapshotPath;
  if (canUseCachedSnapshot) {
    state.rankTables = cachedSnapshot.rankTables || {};
    state.songRadarCatalog = cachedSnapshot.songRadarCatalog || { charts: [] };
    return;
  }
  const snapshotRes = await fetch(`${snapshotPath}?v=${encodeURIComponent(version)}`, { cache: forceRefresh ? 'reload' : 'default' });
  if (!snapshotRes.ok) {
    if (cachedSnapshot?.rankTables) {
      state.rankTables = cachedSnapshot.rankTables || {};
      state.songRadarCatalog = cachedSnapshot.songRadarCatalog || { charts: [] };
      return;
    }
    throw new Error(`snapshot load failed: ${snapshotRes.status}`);
  }
  const snapshot = await snapshotRes.json();
  state.rankTables = snapshot.rankTables || {};
  state.songRadarCatalog = snapshot.songRadarCatalog || { charts: [] };
  writeJsonCache(SNAPSHOT_META_CACHE_KEY, state.appMeta);
  writeJsonCache(SNAPSHOT_DATA_CACHE_KEY, {
    version,
    snapshotPath,
    rankTables: state.rankTables,
    songRadarCatalog: state.songRadarCatalog
  });
}

function toDateTimeLocalValue(iso) {
  const date = iso ? new Date(iso) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
  return local.toISOString().slice(0, 16);
}

function noticeEditorPayloadFromForm() {
  const title = String($('noticeEditorTitle')?.value || '').trim();
  const summary = String($('noticeEditorSummary')?.value || '').trim();
  const publishedAtRaw = String($('noticeEditorPublishedAt')?.value || '').trim();
  const items = String($('noticeEditorItems')?.value || '')
    .split(/\r?\n/g)
    .map((item) => item.trim())
    .filter(Boolean);
  const publishedAtDate = publishedAtRaw ? new Date(publishedAtRaw) : new Date();
  return {
    id: String(state.noticeEditor.id || '').trim(),
    title,
    summary,
    items,
    publishedAt: Number.isNaN(publishedAtDate.getTime()) ? new Date().toISOString() : publishedAtDate.toISOString()
  };
}

function openNoticeEditor(noticeId = '') {
  if (!state.auth.isAdmin) return showToast('관리자 계정만 공지사항을 편집할 수 있습니다.');
  const notice = state.appMeta.notices.find((item) => String(item.id || '') === String(noticeId || '')) || null;
  state.noticeEditor = {
    open: true,
    id: String(notice?.id || '').trim()
  };
  $('noticeEditorTitleText').textContent = notice ? '공지사항 수정' : '공지사항 추가';
  $('noticeEditorTitle').value = notice?.title || '';
  $('noticeEditorSummary').value = notice?.summary || '';
  $('noticeEditorPublishedAt').value = toDateTimeLocalValue(notice?.publishedAt || new Date().toISOString());
  $('noticeEditorItems').value = Array.isArray(notice?.items) ? notice.items.join('\n') : '';
  if (!$('noticeEditorDialog')?.open) $('noticeEditorDialog')?.showModal();
}

function closeNoticeEditor(options = {}) {
  state.noticeEditor = { open: false, id: '' };
  if (!options.skipDialogClose) $('noticeEditorDialog')?.close(options.reason || 'cancel');
}

async function saveNoticeEditor() {
  if (!state.auth.isAdmin || !state.auth.user) return showToast('관리자 계정만 공지사항을 저장할 수 있습니다.');
  const payload = noticeEditorPayloadFromForm();
  if (!payload.title) return showToast('공지사항 제목을 입력하세요.');
  if (!payload.summary) return showToast('공지사항 요약을 입력하세요.');
  await withBusyOverlay(
    '공지사항 저장 중...',
    '공지사항 내용을 서버에 반영하고 있습니다.',
    async () => {
      await saveAppNotice(state.auth.user, payload);
      closeNoticeEditor();
      await refreshAppNotices({ renderAfter: false, silent: false });
      render();
      showToast('공지사항을 저장했습니다.');
    }
  );
}

function findChartCategoryMeta(chart = state.selectedChart) {
  if (!chart) return { category: '미분류', sortIndex: 999 };
  const table = state.rankTables?.[chart.tableName];
  if (!table) {
    return {
      category: String(chart.category || '미분류').trim() || '미분류',
      sortIndex: defaultSortIndexForCategory(chart.category, 999)
    };
  }
  for (const category of table.categories || []) {
    const found = (category.items || []).some((item) => titleKey(item?.data?.title) === titleKey(chart.title) && String(item?.data?.type || '').trim().toUpperCase() === chart.type);
    if (found) {
      return {
        category: String(category.category || chart.category || '미분류').trim() || '미분류',
        sortIndex: Number(category.sortindex || defaultSortIndexForCategory(category.category, 999))
      };
    }
  }
  return {
    category: String(chart.category || '미분류').trim() || '미분류',
    sortIndex: defaultSortIndexForCategory(chart.category, 999)
  };
}

function populateSongMetaCategorySelect(selectedValue = '미분류') {
  const select = $('songMetaCategory');
  if (!select) return;
  const known = new Set(SONG_CATEGORY_OPTIONS);
  const current = String(selectedValue || '').trim();
  const values = current && !known.has(current) ? [...SONG_CATEGORY_OPTIONS, current] : SONG_CATEGORY_OPTIONS;
  select.innerHTML = values.map((value) => `<option value="${esc(value)}">${esc(value)}</option>`).join('');
  select.value = current || '미분류';
}

function syncSongMetaSortIndexFromCategory(force = false) {
  const sortInput = $('songMetaSortIndex');
  const category = $('songMetaCategory')?.value || '미분류';
  if (!sortInput) return;
  if (!force && sortInput.dataset.touched === 'true') return;
  sortInput.value = String(defaultSortIndexForCategory(category, sortInput.value || 999));
}

function songMetaEditorPayloadFromForm() {
  return {
    chartKey: String(state.songMetaEditor.chartKey || '').trim(),
    tableKey: String(state.songMetaEditor.tableKey || '').trim(),
    songTitle: String(state.songMetaEditor.songTitle || '').trim(),
    chartType: String(state.songMetaEditor.chartType || '').trim(),
    category: String($('songMetaCategory')?.value || '미분류').trim() || '미분류',
    sourceSortIndex: Number($('songMetaSortIndex')?.value || 999),
    noteCount: Number($('songMetaNotes')?.value || 0),
    typeInfo: String($('songMetaTypeInfo')?.value || '').trim().toUpperCase(),
    bpm: String($('songMetaBpm')?.value || '').trim(),
    radarNotes: Number($('songMetaRadarNotes')?.value || 0),
    radarPeak: Number($('songMetaRadarPeak')?.value || 0),
    radarScratch: Number($('songMetaRadarScratch')?.value || 0),
    radarSoflan: Number($('songMetaRadarSoflan')?.value || 0),
    radarCharge: Number($('songMetaRadarCharge')?.value || 0),
    radarChord: Number($('songMetaRadarChord')?.value || 0)
  };
}

function applyChartMetadataRowToLocalState(row) {
  if (!row) return null;
  const tableKey = String(row.table_key || '').trim();
  const chartType = String(row.chart_type || '').trim().toUpperCase();
  const songTitle = String(row.song_title || '').trim();
  if (!tableKey || !songTitle || !chartType) return null;

  if (!state.rankTables[tableKey]) {
    state.rankTables[tableKey] = {
      tableinfo: { title: row.table_title || tableKey },
      categories: []
    };
  }
  const table = state.rankTables[tableKey];
  table.tableinfo = { ...(table.tableinfo || {}), title: row.table_title || table.tableinfo?.title || tableKey };
  table.categories = (table.categories || []).map((category) => ({
    ...category,
    items: (category.items || []).filter((item) => !(titleKey(item?.data?.title) === titleKey(songTitle) && String(item?.data?.type || '').trim().toUpperCase() === chartType))
  })).filter((category) => (category.items || []).length > 0);

  const nextCategoryName = String(row.category || '미분류').trim() || '미분류';
  let nextCategory = table.categories.find((category) => String(category.category || '') === nextCategoryName);
  if (!nextCategory) {
    nextCategory = {
      category: nextCategoryName,
      sortindex: Number(row.source_sort_index || defaultSortIndexForCategory(nextCategoryName, 999)),
      items: []
    };
    table.categories.push(nextCategory);
  }
  nextCategory.sortindex = Number(row.source_sort_index || nextCategory.sortindex || defaultSortIndexForCategory(nextCategoryName, 999));
  nextCategory.items.push({
    data: {
      title: songTitle,
      type: chartType,
      implicitType: false,
      bpm: String(row.bpm || '').trim(),
      atwikiNotes: Number(row.note_count || 0),
      typeInfo: String(row.type_info || '').trim(),
      radar: {
        NOTES: Number(row.radar_notes || 0),
        PEAK: Number(row.radar_peak || 0),
        SCRATCH: Number(row.radar_scratch || 0),
        SOFLAN: Number(row.radar_soflan || 0),
        CHARGE: Number(row.radar_charge || 0),
        CHORD: Number(row.radar_chord || 0)
      },
      radarTop: String(row.radar_top || '').trim()
    }
  });
  table.categories.sort((a, b) => Number(a.sortindex || 999) - Number(b.sortindex || 999));
  table.categories.forEach((category) => category.items.sort((a, b) => String(a?.data?.title || '').localeCompare(String(b?.data?.title || ''), 'ko')));

  if (!state.songRadarCatalog || !Array.isArray(state.songRadarCatalog.charts)) {
    state.songRadarCatalog = { charts: [] };
  }
  const radarKey = `${titleKey(songTitle)}|${chartType}`;
  const radarEntry = {
    title: songTitle,
    type: chartType,
    notes: Number(row.note_count || 0),
    radar: {
      NOTES: Number(row.radar_notes || 0),
      PEAK: Number(row.radar_peak || 0),
      SCRATCH: Number(row.radar_scratch || 0),
      SOFLAN: Number(row.radar_soflan || 0),
      CHARGE: Number(row.radar_charge || 0),
      CHORD: Number(row.radar_chord || 0)
    },
    radarTop: String(row.radar_top || row.type_info || '').trim()
  };
  const nextRadarCharts = (state.songRadarCatalog.charts || []).filter((item) => `${titleKey(item?.title)}|${String(item?.type || '').trim().toUpperCase()}` !== radarKey);
  nextRadarCharts.push(radarEntry);
  nextRadarCharts.sort((a, b) => String(a?.title || '').localeCompare(String(b?.title || ''), 'ko'));
  state.songRadarCatalog.charts = nextRadarCharts;

  rebuildViews();
  state.selectedChart = Object.values(state.tableViews || {})
    .flatMap((view) => view.flatCharts || [])
    .find((chart) => chart.key === `${tableKey}|${titleKey(songTitle)}|${chartType}`) || null;
  return state.selectedChart;
}

function removeChartMetadataRowFromLocalState(row) {
  const tableKey = String(row?.table_key || row?.tableKey || '').trim();
  const chartType = String(row?.chart_type || row?.chartType || '').trim().toUpperCase();
  const songTitle = String(row?.song_title || row?.songTitle || '').trim();
  if (!tableKey || !songTitle || !chartType) return;

  const table = state.rankTables[tableKey];
  if (table) {
    table.categories = (table.categories || [])
      .map((category) => ({
        ...category,
        items: (category.items || []).filter((item) => !(
          titleKey(item?.data?.title) === titleKey(songTitle)
          && String(item?.data?.type || '').trim().toUpperCase() === chartType
        ))
      }))
      .filter((category) => (category.items || []).length > 0);
  }

  if (state.songRadarCatalog && Array.isArray(state.songRadarCatalog.charts)) {
    const radarKey = `${titleKey(songTitle)}|${chartType}`;
    state.songRadarCatalog.charts = state.songRadarCatalog.charts.filter((item) => (
      `${titleKey(item?.title)}|${String(item?.type || '').trim().toUpperCase()}` !== radarKey
    ));
  }

  rebuildViews();
  if (state.selectedChart?.key === `${tableKey}|${titleKey(songTitle)}|${chartType}`) {
    state.selectedChart = null;
  }
}

function openSongMetaEditor(chartKey = '') {
  if (!state.auth.isAdmin) return showToast('관리자 계정만 곡 정보를 편집할 수 있습니다.');
  const chart = Object.values(state.tableViews || []).flatMap((view) => view.flatCharts || []).find((row) => row.key === chartKey) || state.selectedChart;
  if (!chart) return;
  const meta = findChartCategoryMeta(chart);
  state.songMetaEditor = {
    open: true,
    chartKey: chart.key,
    tableKey: chart.tableName,
    songTitle: chart.title,
    chartType: chart.type
  };
  $('songMetaEditorTitleText').textContent = '곡 정보 수정';
  $('songMetaEditorMeta').textContent = `${chart.tableName} / ${chart.title} [${chart.type}]`;
  populateSongMetaCategorySelect(meta.category);
  $('songMetaSortIndex').dataset.touched = 'false';
  $('songMetaSortIndex').value = String(meta.sortIndex);
  $('songMetaNotes').value = String(Number(chart.metaNotes || chart.noteCount || 0));
  $('songMetaTypeInfo').value = String(chart.metaType || chart.radarTop || '');
  $('songMetaBpm').value = String(chart.bpm || '');
  $('songMetaRadarNotes').value = String(Number(chart.radar?.NOTES || 0));
  $('songMetaRadarPeak').value = String(Number(chart.radar?.PEAK || 0));
  $('songMetaRadarScratch').value = String(Number(chart.radar?.SCRATCH || 0));
  $('songMetaRadarSoflan').value = String(Number(chart.radar?.SOFLAN || 0));
  $('songMetaRadarCharge').value = String(Number(chart.radar?.CHARGE || 0));
  $('songMetaRadarChord').value = String(Number(chart.radar?.CHORD || 0));
  $('songPopup')?.classList.add('hidden');
  if (!$('songMetaEditorDialog')?.open) $('songMetaEditorDialog')?.showModal();
}

function closeSongMetaEditor(options = {}) {
  state.songMetaEditor = { open: false, chartKey: '', tableKey: '', songTitle: '', chartType: '' };
  if (!options.skipDialogClose) $('songMetaEditorDialog')?.close(options.reason || 'cancel');
}

async function saveSongMetaEditor() {
  if (!state.auth.isAdmin || !state.auth.user) return showToast('관리자 계정만 곡 정보를 저장할 수 있습니다.');
  const payload = songMetaEditorPayloadFromForm();
  if (!payload.chartKey) return showToast('편집할 곡 정보를 찾지 못했습니다.');
  if (!payload.category) return showToast('서열표 분류를 선택하세요.');
  await withBusyOverlay(
    '곡 정보 저장 중...',
    '곡 메타데이터를 서버에 반영하고 있습니다.',
    async () => {
      const row = await rpc('admin_update_chart_metadata', {
        p_chart_key: payload.chartKey,
        p_table_key: payload.tableKey,
        p_song_title: payload.songTitle,
        p_chart_type: payload.chartType,
        p_category: payload.category,
        p_source_sort_index: Number.isFinite(payload.sourceSortIndex) ? payload.sourceSortIndex : defaultSortIndexForCategory(payload.category, 999),
        p_note_count: Math.max(0, Math.round(payload.noteCount || 0)),
        p_type_info: payload.typeInfo,
        p_bpm: payload.bpm,
        p_radar_notes: Math.max(0, Number(payload.radarNotes || 0)),
        p_radar_peak: Math.max(0, Number(payload.radarPeak || 0)),
        p_radar_scratch: Math.max(0, Number(payload.radarScratch || 0)),
        p_radar_soflan: Math.max(0, Number(payload.radarSoflan || 0)),
        p_radar_charge: Math.max(0, Number(payload.radarCharge || 0)),
        p_radar_chord: Math.max(0, Number(payload.radarChord || 0))
      });
      applyChartMetadataRowToLocalState(Array.isArray(row) ? row[0] : row);
      closeSongMetaEditor();
      markSnapshotPublishNeeded('곡 메타 변경사항이 저장되었습니다. 정적 스냅샷 배포가 필요합니다.');
      render();
      showToast('곡 정보를 저장했습니다.');
    }
    );
  }

async function deleteSongMetaEditor() {
  if (!state.auth.isAdmin || !state.auth.user) return showToast('관리자 계정만 곡 정보를 삭제할 수 있습니다.');
  const payload = songMetaEditorPayloadFromForm();
  if (!payload.chartKey) return showToast('삭제할 곡 정보를 찾지 못했습니다.');
  const confirmed = window.confirm(`정말로 ${payload.songTitle} [${payload.chartType}] 메타를 삭제할까요?\n이 작업 후에는 정적 스냅샷 재배포가 필요합니다.`);
  if (!confirmed) return;
  await withBusyOverlay(
    '곡 정보 삭제 중...',
    '선택한 곡 메타데이터를 서버에서 숨기고 있습니다.',
    async () => {
      const row = await rpc('admin_delete_chart_metadata', {
        p_chart_key: payload.chartKey,
        p_table_key: payload.tableKey,
        p_song_title: payload.songTitle,
        p_chart_type: payload.chartType
      });
      removeChartMetadataRowFromLocalState(Array.isArray(row) ? row[0] : row || payload);
      closeSongMetaEditor();
      markSnapshotPublishNeeded('곡 메타 삭제사항이 저장되었습니다. 정적 스냅샷 배포가 필요합니다.');
      render();
      showToast('곡 정보를 삭제했습니다.');
    }
  );
}

async function publishSnapshotChanges() {
  if (!state.auth.isAdmin) return showToast('관리자 계정만 배포를 요청할 수 있습니다.');
  state.snapshotPublish = {
    ...state.snapshotPublish,
    busy: true,
    message: 'GitHub Actions에 배포를 요청하는 중입니다.'
  };
  render();
  try {
    const result = await requestSnapshotPublish();
    state.snapshotPublish = {
      busy: false,
      needsPublish: false,
      message: String(result?.message || '정적 스냅샷 배포 요청을 보냈습니다. GitHub Actions 진행 상황을 확인하세요.'),
      workflowUrl: String(result?.workflowUrl || '').trim()
    };
    render();
    showToast('변경사항 배포를 요청했습니다.');
  } catch (error) {
    state.snapshotPublish = {
      ...state.snapshotPublish,
      busy: false,
      message: `배포 요청 실패: ${String(error?.message || error || '알 수 없는 오류')}`
    };
    render();
    showToast(state.snapshotPublish.message);
  }
}

async function syncSocial() {
  if (!isAuthorized()) {
    state.social = { overviewRows: [], feedItems: [], followerRows: [] };
    render();
    return;
  }
  try {
    state.social = await refreshSocialOverview();
  } catch (error) {
    showToast(`소셜 갱신 실패: ${error.message || error}`);
  }
  render();
}

async function applyTrackerContent(content, trackerName, toastMessage = '데이터 업로드 완료') {
  const rows = parseTsv(content);
  if (!rows.length) {
    showToast('유효한 TSV 데이터가 아닙니다.');
    return;
  }
  const runApply = async () => {
    if (isAuthorized()) {
      const prev = state.profile.lastProgress;
      state.profile.trackerRows = rows;
      state.profile.uploadedTrackerName = trackerName || state.profile.uploadedTrackerName || '';
      rebuildViews();
      const curr = progressMap(state.tableViews);
      const changes = makeEvents(prev, curr, state.profile.goals || []);
      const totalChanges = (changes.updates?.length || 0) + (changes.goals?.length || 0);
      if (totalChanges) {
        state.profile.history.push({
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          summary: prev ? `${totalChanges}건 변경` : '최초',
          updates: changes.updates || [],
          goals: changes.goals || [],
          snapshotRows: rows,
          snapshotProgress: curr
        });
        state.selectedHistoryId = latestHistoryId(state.profile.history);
        state.historySectionOpen = createHistorySectionState();
        state.historyAnimateDetail = true;
      }
      state.profile.lastProgress = curr;
      const completionNotice = buildCompletionNoticeIfNeeded();
      try {
        await saveProgressStateToCloud(state.auth.user, state.profile, 'tsv-upload');
      } catch (error) {
        console.error('TSV cloud save failed', error);
        render();
        showToast(`DB 저장 실패: ${error.message || error}`);
        return;
      }
      await flushCompletionNotice(completionNotice);
    } else {
      state.guest.trackerRows = rows;
      state.guest.uploadedTrackerName = trackerName || '';
    }
    render();
    showToast(toastMessage);
  };
  if (isAuthorized()) {
    await withBusyOverlay(
      'TSV 데이터 반영 중...',
      '업로드한 기록을 계산하고 DB에 안전하게 저장하고 있습니다.',
      runApply
    );
    return;
  }
  await runApply();
}

function ensureTsvInput() {
  if (tsvInput) return tsvInput;
  tsvInput = document.createElement('input');
  tsvInput.type = 'file';
  tsvInput.accept = '.tsv,text/tab-separated-values';
  tsvInput.className = 'hidden';
  tsvInput.addEventListener('change', async () => {
    const file = tsvInput.files?.[0];
    if (!file) return;
    const content = await file.text();
    await applyTrackerContent(content, file.name, `${file.name} 업로드 완료`);
  });
  document.body.appendChild(tsvInput);
  return tsvInput;
}

function ensureGoalImportInput() {
  if (goalImportInput) return goalImportInput;
  goalImportInput = document.createElement('input');
  goalImportInput.type = 'file';
  goalImportInput.accept = '.json,application/json';
  goalImportInput.className = 'hidden';
  goalImportInput.addEventListener('change', async () => {
    const file = goalImportInput.files?.[0];
    if (!file || !isAuthorized()) return;
    try {
      await withBusyOverlay(
        '빙고 불러오는 중...',
        '빙고 정보를 읽어 DB에 반영하고 있습니다.',
        async () => {
          const parsed = JSON.parse(await file.text());
          const bingo = parsed?.bingo;
          if (!bingo || typeof bingo !== 'object') {
            showToast('빙고 파일 형식이 올바르지 않습니다.');
            return;
          }
          const size = normalizeBingoSize(bingo.size);
            const cells = Array.isArray(bingo.cells) ? bingo.cells.slice(0, size * size).map(normalizeGoalSnapshotForBingo) : [];
            while (cells.length < size * size) cells.push(null);
            if (!currentSavedBoards().find((board) => String(board.id || '') === String(bingo.id || '')) && currentSavedBoards().length >= 5) {
              showToast('저장 가능한 빙고는 최대 5개입니다.');
              return;
            }
            const importedBoard = {
              id: String(bingo.id || crypto.randomUUID()),
              name: String(bingo.name || '').trim(),
              size,
              cells: cloneJson(cells),
              savedAt: new Date().toISOString(),
              sharedFromUserId: '',
              sharedFromDjName: '',
              sharedFromInfinitasId: '',
              completionNotifiedAt: ''
            };
            upsertSavedBoard(importedBoard);
            ensureBingoState().selectedCellIndex = -1;
            ensureBingoState().selectedGoalId = '';
          await saveBingoStateToCloud(state.auth.user, state.profile, 'bingo-import');
          render();
          showToast('빙고를 가져왔습니다.');
        }
      );
    } catch (error) {
      showToast(`빙고 불러오기 실패: ${error.message || error}`);
    } finally {
      goalImportInput.value = '';
    }
  });
  document.body.appendChild(goalImportInput);
  return goalImportInput;
}

function levelLabelFromTable(tableName) {
  if (String(tableName || '').startsWith('SP10')) return 'SP10';
  if (String(tableName || '').startsWith('SP11')) return 'SP11';
  if (String(tableName || '').startsWith('SP12')) return 'SP12';
  return String(tableName || '-');
}

function goalPayloadFromForm(prefix = 'goal', chart = null) {
  const kind = $(`${prefix}Kind`)?.value || 'CLEAR';
  const payload = {
    id: crypto.randomUUID(),
    table: chart?.tableName || $('goalTable')?.value || state.activeTable,
    title: chart?.title || $('goalSong')?.value || '',
    chartType: chart?.type || $('goalChartType')?.value || 'A',
    kind,
    source: state.profile?.djName || ''
  };
  if (kind === 'SCORE') payload.targetScore = Math.max(0, Number($(`${prefix}Score`)?.value || 0));
  else if (kind === 'RANK') payload.targetRank = $(`${prefix}Rank`)?.value || 'AA';
  else payload.targetLamp = $(`${prefix}Lamp`)?.value || 'HC';
  return payload;
}

async function openChart(chartKey, event) {
  const chart = Object.values(state.tableViews || {}).flatMap((view) => view.flatCharts || []).find((row) => row.key === chartKey);
  if (!chart) return;
  state.selectedChart = chart;
  let songSocialRows = [];
  if (isAuthorized()) {
    try {
      const rawRows = await rpc('get_song_social_context', {
        p_title: chart.title,
        p_chart_type: chart.type
      });
      const followingPeerSet = new Set(
        (state.social.overviewRows || [])
          .filter((row) => row?.relation_type === 'follow' && String(row.direction || 'following') === 'following')
          .map((row) => String(row.peer_user_id || ''))
          .filter(Boolean)
      );
      const seen = new Set();
      songSocialRows = (Array.isArray(rawRows) ? rawRows : []).filter((row) => {
        const peerId = String(row?.peer_user_id || '');
        if (!peerId || !followingPeerSet.has(peerId) || seen.has(peerId)) return false;
        seen.add(peerId);
        return true;
      });
    } catch {
      songSocialRows = [];
    }
  }
  showSongPopup(chart, event, isAuthorized(), { songSocialRows, isAdmin: state.auth.isAdmin });
}

async function openSelfRadar() {
  $('accountIconMenu')?.classList.add('hidden');
  const profile = computeRadarProfileFromRows(currentRows(), state.rankTables, state.songRadarCatalog);
  showRadarDialog(isAuthorized() ? state.profile.djName : 'GUEST', profile);
}

async function openPeerRadar() {
  const menu = $('socialPeerMenu');
  const peer = { peer_user_id: menu.dataset.peerUserId, dj_name: menu.dataset.peerDjName, infinitas_id: menu.dataset.peerInfinitasId };
  menu.classList.add('hidden');
  const rows = await rpc('get_follow_tracker_rows', { p_peer_user_id: peer.peer_user_id });
  const trackerRows = Array.isArray(rows?.tracker_rows) ? rows.tracker_rows : Array.isArray(rows?.[0]?.tracker_rows) ? rows[0].tracker_rows : [];
  const profile = computeRadarProfileFromRows(trackerRows, state.rankTables, state.songRadarCatalog);
  showPeerRadarDialog(peer.dj_name || '이름 없음', peer.infinitas_id || '', profile);
}
async function openPeerCompare() {
  const menu = $('socialPeerMenu');
  const peer = { peer_user_id: menu.dataset.peerUserId, dj_name: menu.dataset.peerDjName, infinitas_id: menu.dataset.peerInfinitasId };
  menu.classList.add('hidden');
  const rows = await rpc('get_follow_tracker_rows', { p_peer_user_id: peer.peer_user_id });
  const trackerRows = Array.isArray(rows?.tracker_rows) ? rows.tracker_rows : Array.isArray(rows?.[0]?.tracker_rows) ? rows[0].tracker_rows : [];
  const ownRows = state.profile?.trackerRows || [];
  const ownIdx = buildRowIndex(ownRows);
  const peerIdx = buildRowIndex(trackerRows);
  const myRadar = computeRadarProfileFromRows(ownRows, state.rankTables, state.songRadarCatalog);
  const peerRadar = computeRadarProfileFromRows(trackerRows, state.rankTables, state.songRadarCatalog);
  const radarRows = Object.keys(myRadar.radar || {}).map((axis) => {
    const me = Number(myRadar.radar?.[axis] || 0);
    const other = Number(peerRadar.radar?.[axis] || 0);
    const diff = truncate2(me - other);
    const diffClass = diff > 0 ? 'plus' : diff < 0 ? 'minus' : 'zero';
    const sign = diff > 0 ? '+' : '';
    return `<div class="social-compare-radar-row"><span class="axis-${String(axis || '').toLowerCase()}">${esc(axis)}</span><span class="social-compare-radar-val">${me.toFixed(2)}</span><span class="social-compare-radar-val">${other.toFixed(2)}</span><span class="social-compare-diff ${diffClass}">${sign}${diff.toFixed(2)}</span></div>`;
  }).join('');
  const bucket = new Map();
  const ensureBucket = (key) => {
    if (!bucket.has(key)) bucket.set(key, { score: { w: 0, d: 0, l: 0 }, lamp: { w: 0, d: 0, l: 0 } });
    return bucket.get(key);
  };
  Object.entries(state.tableViews || {}).forEach(([tableName, view]) => {
    const level = levelLabelFromTable(tableName);
    const rowBucket = ensureBucket(level);
    (view?.flatCharts || []).forEach((chart) => {
      const own = rowStats(findRowByTitle(ownIdx, chart.title), chart.type);
      const other = rowStats(findRowByTitle(peerIdx, chart.title), chart.type);
      if (Number(own.noteCount || 0) <= 0 || Number(other.noteCount || 0) <= 0) return;
      const ownScore = Number(own.exScore || 0);
      const otherScore = Number(other.exScore || 0);
      const ownLamp = LAMP_ORDER[own.lamp] ?? 0;
      const otherLamp = LAMP_ORDER[other.lamp] ?? 0;
      rowBucket.score[ownScore > otherScore ? 'w' : ownScore < otherScore ? 'l' : 'd'] += 1;
      rowBucket.lamp[ownLamp > otherLamp ? 'w' : ownLamp < otherLamp ? 'l' : 'd'] += 1;
    });
  });
  const levelRows = ['SP10', 'SP11', 'SP12']
    .filter((key) => bucket.has(key))
    .map((key) => {
      const row = bucket.get(key);
      return `<div class="social-compare-level-row"><span class="social-compare-level-key">${esc(key)}</span><span class="social-compare-level-value">${row.score.w}/${row.score.d}/${row.score.l}</span><span class="social-compare-level-value">${row.lamp.w}/${row.lamp.d}/${row.lamp.l}</span></div>`;
    }).join('');
  $('socialCompareBody').innerHTML = `
    <div class="social-compare-head"><strong>${esc(state.profile?.djName || 'ME')}</strong><span>vs</span><strong>${esc(peer.dj_name || 'PEER')}</strong></div>
    <div class="social-compare-grid">
      <section class="social-compare-card"><div class="social-compare-title">노트 레이더 차이 (나-상대)</div>${radarRows}</section>
      <section class="social-compare-card"><div class="social-compare-title">레벨별 승/무/패</div><div class="social-compare-level-head"><span>LEVEL</span><span>SCORE</span><span>LAMP</span></div>${levelRows || '<div class="history-empty">데이터 없음</div>'}</section>
    </div>
  `;
  $('socialCompareDialog')?.showModal();
}

async function openPeerCard() {
  const menu = $('socialPeerMenu');
  const peer = {
    peer_user_id: menu.dataset.peerUserId,
    dj_name: menu.dataset.peerDjName,
    infinitas_id: menu.dataset.peerInfinitasId
  };
  menu.classList.add('hidden');
  if (!peer.peer_user_id) return;
  try {
    await withBusyOverlay(
      '카드 불러오는 중...',
      '팔로우 플레이어 카드를 준비하고 있습니다.',
      async () => {
        let row = null;
        try {
          const result = await rpc('get_follow_card', { p_peer_user_id: peer.peer_user_id });
          row = Array.isArray(result) ? result[0] : result;
        } catch {
          const fallbackRows = await rpc('get_follow_tracker_rows', { p_peer_user_id: peer.peer_user_id });
          const fallback = Array.isArray(fallbackRows) ? fallbackRows[0] : fallbackRows;
          const overviewPeer = (state.social.overviewRows || []).find((item) => String(item?.peer_user_id || '') === String(peer.peer_user_id || ''));
          row = {
            peer_user_id: peer.peer_user_id,
            dj_name: fallback?.dj_name || peer.dj_name || '이름 없음',
            infinitas_id: fallback?.infinitas_id || peer.infinitas_id || '',
            icon_data_url: String(overviewPeer?.icon_data_url || '').trim(),
            banner_data_url: '',
            tracker_rows: Array.isArray(fallback?.tracker_rows) ? fallback.tracker_rows : [],
            following_count: '-',
            follower_count: '-'
          };
        }
        const trackerRows = Array.isArray(row?.tracker_rows) ? row.tracker_rows : [];
        const radarProfile = computeRadarProfileFromRows(trackerRows, state.rankTables, state.songRadarCatalog);
        const banner = String(row?.banner_data_url || '').trim() || String(row?.icon_data_url || '').trim() || DEFAULT_ICON_SRC;
        const icon = String(row?.icon_data_url || '').trim() || DEFAULT_ICON_SRC;
        const followingCount = row?.following_count ?? '-';
        const followerCount = row?.follower_count ?? '-';
        const popup = $('socialPeerCardPopup');
        const body = $('socialPeerCardBody');
        if (!popup || !body) return;
        body.innerHTML = `
          <article class="social-me-card">
            <div class="social-me-banner">
              <img class="social-me-banner-image" src="${esc(banner)}" alt="" />
            </div>
            <div class="social-me-avatar-wrap"><img class="social-me-avatar" src="${esc(icon)}" alt="프로필 아이콘" /></div>
            <div class="social-me-body">
              <div class="social-me-name">${esc(row?.dj_name || peer.dj_name || '이름 없음')}</div>
              <div class="social-me-id">${esc(row?.infinitas_id || peer.infinitas_id || '')}</div>
              <div class="social-me-stats">
                <div class="social-me-stat"><div class="social-me-stat-value">${Number(radarProfile.total || 0).toFixed(2)}</div><div class="social-me-stat-label">레이더</div></div>
                <div class="social-me-stat"><div class="social-me-stat-value">${esc(String(followingCount))}</div><div class="social-me-stat-label">팔로잉</div></div>
                <div class="social-me-stat"><div class="social-me-stat-value">${esc(String(followerCount))}</div><div class="social-me-stat-label">팔로워</div></div>
              </div>
              <div class="social-follow-add-spacer" aria-hidden="true"></div>
            </div>
          </article>`;
        popup.classList.remove('hidden');
      }
    );
  } catch (error) {
    showToast(`카드 불러오기 실패: ${error.message || error}`);
  }
}

async function rollbackHistory() {
  if (!isAuthorized() || !state.selectedHistoryId) return;
  const histories = Array.isArray(state.profile.history) ? state.profile.history : [];
  const targetIdx = histories.findIndex((item) => item.id === state.selectedHistoryId);
  if (targetIdx < 0 || targetIdx === histories.length - 1) return;
  const target = histories[targetIdx];
  if (!target?.snapshotRows || !target?.snapshotProgress) {
    showToast('이 히스토리에는 롤백에 필요한 스냅샷 데이터가 없습니다.');
    return;
  }
  if (!window.confirm('해당 시점으로 히스토리를 되돌립니다. 계속할까요?')) return;
  state.profile.history = histories.slice(0, targetIdx + 1);
  state.profile.trackerRows = JSON.parse(JSON.stringify(target.snapshotRows || []));
  state.profile.lastProgress = JSON.parse(JSON.stringify(target.snapshotProgress || {}));
  const completionNotice = buildCompletionNoticeIfNeeded();
  await saveProgressStateToCloud(state.auth.user, state.profile, 'history-rollback');
  await flushCompletionNotice(completionNotice);
  state.selectedHistoryId = target.id;
  state.historySectionOpen = createHistorySectionState();
  render();
  showToast('선택한 시점으로 롤백되었습니다.');
}

async function exportImage() {
  if (typeof window.html2canvas !== 'function') return showToast('html2canvas를 불러오지 못했습니다.');
  const canvas = await window.html2canvas($('exportArea'), { useCORS: true, backgroundColor: '#e7e7e7', scale: 2 });
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (blob) downloadBlob(blob, `${state.activeTable}_${new Date().toISOString().slice(0, 10)}.png`);
}

function resetGuestState() {
  state.guest.trackerRows = [];
  state.guest.uploadedTrackerName = '';
  if (!isAuthorized()) render();
  showToast('게스트 업로드 상태를 초기화했습니다.');
}

async function refreshRankData() {
  await loadStaticData(true);
  render();
  showToast('관리자 데이터 캐시를 다시 불러왔습니다.');
}

const accountController = createAccountController({
  state,
  render: (...args) => render(...args),
  syncSocial,
  isAuthorized,
  ensureBingoState,
  restoreBingoDraftCache,
  syncGoalStoreFromBingoDraft,
  latestHistoryId,
  createHistorySectionState,
  closeSocialHistoryPopup,
  emptyProfile,
  saveProfileToCloud,
  saveUserProfileToCloud,
  ensureAuthServerReady,
  signInWithGoogle,
  signOut: authSignOut,
  getInitialSession,
  onAuthStateChange,
  loadProfileFromCloud,
  purgeProfile,
  withTimeout,
  withBusyOverlay,
  describeRemoteError,
  showToast,
  normalizeInfinitasIdForSearch,
  formatInfinitasIdDisplay,
  validateIconFile,
  loadImageElementFromFile,
  normalizeIconImage,
  isAdminAccount,
  $
});

const {
  loadGuestProfileCache,
  persistGuestProfileCache,
  readPendingSignupDraft,
  writePendingSignupDraft,
  clearPendingSignupDraft,
  renderSignupDialog,
  openProfileDialog,
  formatProfileId,
  openSignupDialog,
  closeSignupDialog,
  updateSignupName,
  formatSignupId,
  nextSignupStep,
  prevSignupStep,
  completeSignupForCurrentUser,
  submitSignup,
  submitProfile,
  openIconEditor,
  openIconEditorFromFile,
  closeIconEditor,
  startIconDrag,
  moveIconDrag,
  endIconDrag,
  zoomIconEditor,
  saveIconEditor,
  signIn,
  signOut,
  withdrawAccount,
  refreshProfile,
  initAuth
} = accountController;

({
  createRenderContext,
  render,
  setActivePanel
} = createRenderController({
  state,
  isAuthorized,
  currentTrackerLabel,
  currentSocialSettings,
  progressMap,
  iconSrc,
  rebuildViews,
  renderApp,
  renderDeferredPanel,
  renderSignupDialog,
  syncSocial,
  showToast,
  $
}));

const goalsController = createGoalsController({
  state,
  isAuthorized,
  showToast,
  downloadBlob,
  render,
  withBusyOverlay,
  normalizeBingoSize,
  createEmptyBingoDraft,
  boardHasAssignments,
  boardIsFull,
  goalSignature,
  normalizeGoalSnapshotForBingo,
  ensureBingoState,
  currentPublishedBingo,
  currentBingoDraft,
  currentSavedBoards,
  currentSocialSettings,
  syncPublishedFromSavedBoards,
  syncGoalStoreFromBingoDraft,
  persistBingoDraftCache,
  clearBingoDraftCache,
  createSavedBoardFromDraft,
  upsertSavedBoard,
  removeSavedBoard,
  bingoBoardCompleted,
  bingoExportPayload,
  hasPublishedOnlyBingo,
  findChartForGoal,
  buildCompletionNoticeIfNeeded,
  flushCompletionNotice,
  saveBingoStateToCloud,
  resetBingoStateLocally,
  boardSignature,
  goalPayloadFromForm,
  ensureGoalImportInput,
  titleKey,
  $,
  esc
});

const socialController = createSocialController({
  state,
  isAuthorized,
  showToast,
  rpc,
  syncSocial,
  refreshProfile,
  currentPublishedBingo,
  currentSavedBoards,
  ensureBingoState,
  syncPublishedFromSavedBoards,
  saveBingoStateToCloud,
  saveSocialSettingsToCloud,
  buildCompletionNoticeIfNeeded,
  flushCompletionNotice,
  findFeedItemById,
  normalizeIncomingBingo,
  openBingoPreview,
  normalizeInfinitasIdForSearch,
  authClient,
  normalizeSocialSettings,
  currentSocialSettings,
  readFileAsDataUrl,
  loadImageElementFromFile,
  normalizeBannerImage,
  withBusyOverlay,
  render,
  createHistorySectionState,
  buildBingoTransferPayload,
  $,
  esc
});

const {
  exportGoals,
  setBingoSize,
  selectBingoGoal,
  assignGoalToBingoCell,
  clearSelectedBingoCell,
  saveBingoDraft,
  cancelBingoDraft,
  openBingoPublishDialog,
  publishBingo,
  deleteBingoBoard,
  closeSongGoalPicker,
  refreshGoalCandidates,
  syncGoalChartTypeFromSelection,
  handleGoalTableChange,
  importGoals,
  clearGoals,
  clearAchievedGoals,
  deleteGoal,
  addGoalFromMainForm,
  addGoalFromSongDialog,
  saveGoal,
  applySongGoalToBingoCell
} = goalsController;

const {
  mutualFollowPeers,
  openBingoShare,
  respondFollow,
  respondGoal,
  respondBingo,
  previewBingoFeed,
  searchUser,
  sendFollow,
  dismissFeed,
  dismissAllFeed,
  openGoalSend,
  sendGoal,
  sendBingo,
  unfollowPeer,
  saveSettings,
  openSocialHistoryDetail,
  toggleSocialHistorySection,
  openSocialBannerEditor,
  closeSocialBannerEditor,
  saveSocialBannerEditor,
  startSocialBannerDrag,
  moveSocialBannerDrag,
  endSocialBannerDrag,
  zoomSocialBannerEditor,
  setSettingsTab
} = socialController;

bindUi({
  state,
  isAuthorized,
  iconSrc,
  actions: {
    setActivePanel,
    setActiveTable: (table) => {
      state.activeTable = table;
      render();
    },
    setViewMode: (mode) => {
      state.viewMode = mode;
      render();
    },
    setSortMode: (mode) => {
      state.sortMode = mode;
      render();
    },
    setSearchQuery: (query) => {
      state.searchQuery = query;
      render();
    },
    openChart,
    importTsv: () => ensureTsvInput().click(),
    exportImage,
    refreshRankData,
    resetGuestState,
    signIn,
    signOut,
    openProfileDialog,
    openSignupDialog,
    closeSignupDialog,
    updateSignupName,
    formatSignupId,
    nextSignupStep,
    prevSignupStep,
    submitSignup,
    withdrawAccount,
    openIconEditor,
    openIconEditorFromFile,
    closeIconEditor,
    startIconDrag,
    moveIconDrag,
    endIconDrag,
    zoomIconEditor,
    saveIconEditor,
    openSelfRadar,
    selectHistory: (id) => {
      if (state.selectedHistoryId === id) {
        state.selectedHistoryId = '';
        state.historyAnimateDetail = false;
        render();
        return;
      }
      state.selectedHistoryId = id;
      state.historyAnimateDetail = true;
      state.historySectionOpen = createHistorySectionState();
      render();
    },
    rollbackHistory,
    toggleHistorySection: (section) => {
      if (!section || !(section in state.historySectionOpen)) return;
      state.historySectionOpen[section] = !state.historySectionOpen[section];
      state.historyAnimateDetail = false;
      render();
    },
    handleGoalTableChange,
      refreshGoalCandidates,
      syncGoalChartTypeFromSelection,
      setBingoSize,
      startNewBingoDraft,
      selectSavedBingo,
      selectBingoGoal,
      assignGoalToBingoCell,
    clearSelectedBingoCell,
    saveBingoDraft,
    cancelBingoDraft,
    openBingoPublishDialog,
    publishBingo,
    addGoalFromMainForm,
    addGoalFromSongDialog,
    deleteGoal,
      openGoalSend,
      sendGoal,
      openBingoShare,
      sendBingo,
      openBingoSizeDialog,
      closeBingoSizeDialog,
      createBingoFromSize,
      exportGoals,
    importGoals,
    clearGoals,
    clearAchievedGoals,
    dismissAllFeed,
    dismissFeed,
    respondFollow,
    respondGoal,
    respondBingo,
      previewBingoFeed,
      applySongGoalToBingoCell,
      closeSongGoalPicker,
      searchUser,
    sendFollow,
    openSocialHistoryDetail,
    closeSocialHistoryPopup: () => {
      closeSocialHistoryPopup();
      render();
    },
    toggleSocialHistorySection,
    openSocialBannerEditor,
    closeSocialBannerEditor,
    saveSocialBannerEditor,
    startSocialBannerDrag,
    moveSocialBannerDrag,
    endSocialBannerDrag,
    zoomSocialBannerEditor,
    openPeerCard,
    openPeerRadar,
    openPeerCompare,
    unfollowPeer,
    saveSettings,
    setSettingsTab,
    openNoticeEditor,
    closeNoticeEditor,
    saveNoticeEditor,
    openSongMetaEditor,
    closeSongMetaEditor,
      saveSongMetaEditor,
      deleteSongMetaEditor,
      syncSongMetaSortIndexFromCategory,
      publishSnapshotChanges,
    formatProfileId,
    submitProfile
  }
});

loadGuestProfileCache();
setSettingsTab('general');
await loadStaticData();
await refreshAppNotices({ renderAfter: false, silent: true });
render();
initAuth().catch((error) => {
  console.error('initAuth failed', error);
  state.auth.loading = false;
  state.auth.user = null;
  state.auth.session = null;
  state.auth.signedIn = false;
  state.auth.profileReady = false;
  state.auth.isAdmin = false;
  state.snapshotPublish = { busy: false, needsPublish: false, message: '', workflowUrl: '' };
  state.profile = null;
  render();
  showToast(describeRemoteError(error, '로그인 서버 연결이 원활하지 않아 게스트 모드로 계속합니다.'));
});
