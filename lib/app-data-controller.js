export function createDataController({
  state,
  isAuthorized,
  render,
  syncSocial,
  showToast,
  withBusyOverlay,
  saveProgressStateToCloud,
  saveBingoStateToCloud,
  rpc,
  readJsonCache,
  writeJsonCache,
  bingoDraftCacheKeyPrefix,
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
}) {
  let tsvInput = null;
  let goalImportInput = null;

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
      : kind === 'RATE'
        ? `T:${Math.max(0, Math.min(100, Math.round(Number(goal.targetRate || 0) * 100) / 100))}`
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
    else if (snapshot.kind === 'RATE') snapshot.targetRate = Math.max(0, Math.min(100, Math.round(Number(goal.targetRate || 0) * 100) / 100));
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
    return userId ? `${bingoDraftCacheKeyPrefix}${userId}` : '';
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

  function currentBingoDraft() {
    return ensureBingoState().draft;
  }

  function currentSavedBoards() {
    return ensureBingoState().savedBoards || [];
  }

  function currentPublishedBingo() {
    return ensureBingoState().published || null;
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

  function syncPublishedFromSavedBoards() {
    const bingo = ensureBingoState();
    const active = currentSavedBoards().find((board) => String(board?.id || '') === String(bingo.activeBoardId || '')) || null;
    bingo.published = active ? cloneJson(active) : null;
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

  function hasPublishedOnlyBingo() {
    const published = currentPublishedBingo();
    if (!published || !boardIsFull(published)) return false;
    return !String(currentBingoDraft()?.updatedAt || '').trim();
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

  function rebuildViews() {
    state.tableViews = buildViews(state.rankTables, state.songRadarCatalog, currentRows());
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

  return {
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
    applyTrackerContent,
    ensureTsvInput,
    ensureGoalImportInput,
    rebuildViews
  };
}
