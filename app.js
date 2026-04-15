import { DEFAULT_ICON_SRC } from './lib/constants.js';
import {
  emptyProfile,
  buildViews,
  computeRadarProfileFromRows,
  createEmptyBingoState,
  makeEvents,
  normalizeBingoState,
  progressMap
} from './lib/data.js';
import { authClient, ensureAuthServerReady, getInitialSession, loadAppNotices, loadProfileFromCloud, onAuthStateChange, purgeProfile, refreshSocialOverview, requestSnapshotPublish, rpc, saveAppNotice, saveBingoStateToCloud, saveProfileToCloud, saveProgressStateToCloud, saveSocialSettingsToCloud, saveUserProfileToCloud, signInWithGoogle, signOut as authSignOut } from './lib/auth.js';
import { bindUi, renderApp, renderDeferredPanel, showPeerRadarDialog, showRadarDialog, showSongPopup } from './lib/ui.js';
import { createAccountController } from './lib/app-account-controller.js';
import { createAdminController } from './lib/app-admin-controller.js';
import { createDataController } from './lib/app-data-controller.js';
import { createInteractionController } from './lib/app-interaction-controller.js';
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
  socialFollowersPopup: {
    open: false,
    left: 24,
    top: 120
  },
  socialMobileSection: 'feed',
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
let currentRows = () => [];
let currentTrackerLabel = () => '데이터 미업로드';
let currentSocialSettings = () => normalizeSocialSettings({});
let rebuildViews = () => {};
let render = () => {};
let setActivePanel = () => {};
let normalizeBingoSize;
let createEmptyBingoDraft;
let boardHasAssignments;
let boardIsFull;
let goalSignature;
let normalizeGoalSnapshotForBingo;
let ensureBingoState;
let clearBingoDraftCache;
let persistBingoDraftCache;
let restoreBingoDraftCache;
let currentBingoDraft;
let currentSavedBoards;
let currentPublishedBingo;
let syncPublishedFromSavedBoards;
let upsertSavedBoard;
let removeSavedBoard;
let boardSignature;
let hasPublishedOnlyBingo;
let findChartForGoal;
let bingoBoardCompleted;
let syncGoalStoreFromBingoDraft;
let resetBingoStateLocally;
let bingoExportPayload;
let buildBingoTransferPayload;
let normalizeIncomingBingo;
let openBingoPreview;
let findFeedItemById;
let buildCompletionNoticeIfNeeded;
let createSavedBoardFromDraft;
let startNewBingoDraft;
let openBingoSizeDialog;
let closeBingoSizeDialog;
let createBingoFromSize;
let selectSavedBingo;
let flushCompletionNotice;
let ensureGoalImportInput;
let ensureTsvInput;
let goalPayloadFromForm;
let openChart;
let openSelfRadar;
let openPeerRadar;
let openPeerCompare;
let openPeerCard;
let rollbackHistory;
let exportImage;
let resetGuestState;
let refreshRankData;

function latestHistoryId(history = []) {
  return history.length ? history[history.length - 1].id || '' : '';
}

function isAdminAccount(user = state.auth.user) {
  const email = String(user?.email || '').trim().toLowerCase();
  return !!email && ADMIN_EMAILS.has(email);
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

const dataController = createDataController({
  state,
  isAuthorized,
  render: (...args) => render(...args),
  syncSocial: (...args) => syncSocial(...args),
  showToast,
  withBusyOverlay,
  saveProgressStateToCloud,
  saveBingoStateToCloud,
  rpc,
  readJsonCache,
  writeJsonCache,
  bingoDraftCacheKeyPrefix: BINGO_DRAFT_CACHE_KEY_PREFIX,
  createHistorySectionState,
  latestHistoryId,
  parseTsv,
  buildViews,
  makeEvents,
  progressMap,
  createEmptyBingoState,
  normalizeBingoState,
  normalizeSocialSettings,
  goalAchieved,
  goalLabel,
  titleKey,
  $,
  esc
});

({
  currentRows,
  currentTrackerLabel,
  currentSocialSettings,
  normalizeBingoSize,
  createEmptyBingoDraft,
  boardHasAssignments,
  boardIsFull,
  goalSignature,
  normalizeGoalSnapshotForBingo,
  ensureBingoState,
  clearBingoDraftCache,
  persistBingoDraftCache,
  restoreBingoDraftCache,
  currentBingoDraft,
  currentSavedBoards,
  currentPublishedBingo,
  syncPublishedFromSavedBoards,
  upsertSavedBoard,
  removeSavedBoard,
  boardSignature,
  hasPublishedOnlyBingo,
  findChartForGoal,
  bingoBoardCompleted,
  syncGoalStoreFromBingoDraft,
  resetBingoStateLocally,
  bingoExportPayload,
  buildBingoTransferPayload,
  normalizeIncomingBingo,
  openBingoPreview,
  findFeedItemById,
  buildCompletionNoticeIfNeeded,
  createSavedBoardFromDraft,
  startNewBingoDraft,
  openBingoSizeDialog,
  closeBingoSizeDialog,
  createBingoFromSize,
  selectSavedBingo,
  flushCompletionNotice,
  ensureGoalImportInput,
  ensureTsvInput,
  rebuildViews
} = dataController);

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

const adminController = createAdminController({
  state,
  render: (...args) => render(...args),
  rebuildViews,
  showToast,
  withBusyOverlay,
  describeRemoteError,
  loadAppNotices,
  saveAppNotice,
  requestSnapshotPublish,
  rpc,
  fetchJsonOptional,
  readJsonCache,
  writeJsonCache,
  snapshotMetaCacheKey: SNAPSHOT_META_CACHE_KEY,
  snapshotDataCacheKey: SNAPSHOT_DATA_CACHE_KEY,
  defaultSnapshotPath: './assets/data/app-snapshot.json',
  titleKey,
  esc,
  $
});

const {
  refreshAppNotices,
  loadStaticData,
  openNoticeEditor,
  closeNoticeEditor,
  saveNoticeEditor,
  openSongMetaEditor,
  closeSongMetaEditor,
  saveSongMetaEditor,
  deleteSongMetaEditor,
  syncSongMetaSortIndexFromCategory,
  publishSnapshotChanges
} = adminController;

({
  goalPayloadFromForm,
  openChart,
  openSelfRadar,
  openPeerRadar,
  openPeerCompare,
  openPeerCard,
  rollbackHistory,
  exportImage,
  resetGuestState,
  refreshRankData
} = createInteractionController({
  state,
  isAuthorized,
  render: (...args) => render(...args),
  showToast,
  downloadBlob,
  withBusyOverlay,
  rpc,
  loadStaticData: (...args) => loadStaticData(...args),
  saveProgressStateToCloud,
  currentRows,
  buildCompletionNoticeIfNeeded,
  flushCompletionNotice,
  computeRadarProfileFromRows,
  currentDefaultIconSrc: DEFAULT_ICON_SRC,
  showSongPopup,
  showRadarDialog,
  showPeerRadarDialog,
  buildRowIndex,
  findRowByTitle,
  rowStats,
  truncate2,
  lampOrder: LAMP_ORDER,
  titleKey,
  esc,
  $
}));

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
  setSettingsTab,
  openFollowersPopup,
  closeFollowersPopup
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
    refreshLayout: () => render(),
    setSocialMobileSection: (section) => {
      state.socialMobileSection = ['feed', 'card', 'follows'].includes(section) ? section : 'feed';
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
    openFollowersPopup,
    closeFollowersPopup,
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
