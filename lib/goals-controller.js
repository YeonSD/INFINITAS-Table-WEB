export function createGoalsController(env) {
  const {
    state,
    isAuthorized,
    showToast,
    downloadBlob,
    render,
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
    saveProfileToCloud,
    resetBingoStateLocally,
    boardSignature,
    goalPayloadFromForm,
    ensureGoalImportInput,
    $,
    esc
  } = env;

  let bingoSaveQueue = Promise.resolve('idle');

  function cloneProfileSnapshot() {
    return JSON.parse(JSON.stringify(state.profile || null));
  }

  function queueBingoProfileSave(reason, options = {}) {
    const timeoutMs = Math.max(1000, Number(options.timeoutMs || 8000));
    const user = state.auth.user;
    const profileSnapshot = cloneProfileSnapshot();
    if (!user || !profileSnapshot) return Promise.resolve('skipped');
    const previousQueue = bingoSaveQueue.catch(() => 'failed');
    const saveTask = async () => {
      const savePromise = saveProfileToCloud(user, profileSnapshot, reason);
      const timeoutTag = Symbol('timeout');
      const result = await Promise.race([
        savePromise.then(() => 'saved'),
        new Promise((resolve) => setTimeout(() => resolve(timeoutTag), timeoutMs))
      ]);
      if (result === timeoutTag) {
        savePromise.catch((error) => {
          console.error(`Delayed bingo save failed (${reason})`, error);
        });
        return 'delayed';
      }
      return 'saved';
    };
    bingoSaveQueue = previousQueue.then(saveTask, saveTask);
    return bingoSaveQueue;
  }

  function notifyBingoSaveDelay(reason, status) {
    if (status !== 'delayed') return;
    const messageMap = {
      'bingo-draft-save': '빙고 임시 저장의 서버 반영이 지연되고 있습니다.',
      'bingo-delete': '빙고 변경 사항의 서버 반영이 지연되고 있습니다.',
      'bingo-publish': '빙고 저장의 서버 반영이 지연되고 있습니다.'
    };
    showToast(messageMap[reason] || '빙고 반영이 지연되고 있습니다.');
  }

  function persistBingoProfileInBackground(reason, options = {}) {
    queueBingoProfileSave(reason, options)
      .then((status) => {
        notifyBingoSaveDelay(reason, status);
      })
      .catch((error) => {
        console.error(`Bingo save failed (${reason})`, error);
        showToast('빙고 변경 사항 저장에 실패했습니다. 잠시 후 다시 시도해주세요.');
      });
  }

  function exportGoals() {
    if (!isAuthorized()) return;
    const payload = bingoExportPayload();
    if (!payload) return showToast('완성된 빙고를 먼저 저장하세요.');
    const fileNameBase = payload.bingo.name ? payload.bingo.name.replace(/[^\w\-가-힣]+/g, '_') : 'bingo';
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    downloadBlob(blob, `${fileNameBase}_${new Date().toISOString().slice(0, 10)}.json`);
  }

  function setBingoSize(sizeRaw) {
    if (!isAuthorized()) return;
    const bingo = ensureBingoState();
    const nextSize = normalizeBingoSize(sizeRaw);
    if (bingo.draft.size === nextSize) {
      render();
      return;
    }
    if (boardHasAssignments(bingo.draft) && !window.confirm('현재 작성 중인 빙고 칸이 초기화됩니다. 계속할까요?')) {
      $('bingoSize').value = String(bingo.draft.size);
      render();
      return;
    }
    bingo.draft = createEmptyBingoDraft(nextSize);
    bingo.selectedCellIndex = -1;
    bingo.selectedGoalId = '';
    syncGoalStoreFromBingoDraft();
    render();
  }

  function selectBingoGoal(goalId) {
    if (!isAuthorized()) return;
    const bingo = ensureBingoState();
    bingo.selectedGoalId = String(goalId || '');
    render();
  }

  function assignGoalToBingoCell(index) {
    if (!isAuthorized()) return;
    if (currentPublishedBingo()) {
      showToast('[빈 빙고]를 선택한 뒤 수정할 수 있습니다.');
      return;
    }
    const bingo = ensureBingoState();
    const draft = bingo.draft;
    const cellIndex = Number(index);
    if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex >= draft.cells.length) return;
    bingo.selectedCellIndex = cellIndex;
    render();
  }

  async function clearSelectedBingoCell() {
    if (!isAuthorized()) return;
    const bingo = ensureBingoState();
    const draft = bingo.draft;
    const index = Number(bingo.selectedCellIndex);
    if (!Number.isInteger(index) || index < 0 || index >= draft.cells.length) return showToast('먼저 비울 칸을 선택하세요.');
    draft.cells[index] = null;
    draft.updatedAt = new Date().toISOString();
    syncGoalStoreFromBingoDraft();
    persistBingoDraftCache();
    render();
  }

  async function saveBingoDraft() {
    if (!isAuthorized()) return;
    const bingo = ensureBingoState();
    bingo.draft.updatedAt = new Date().toISOString();
    syncGoalStoreFromBingoDraft();
    persistBingoDraftCache();
    render();
    showToast('빙고 임시 저장을 반영했습니다.');
    persistBingoProfileInBackground('bingo-draft-save');
  }

  async function cancelBingoDraft() {
    if (!isAuthorized()) return;
    const bingo = ensureBingoState();
    if (!String(bingo.draft?.updatedAt || '').trim()) return;
    const nextActiveBoardId = String(currentSavedBoards()[0]?.id || '').trim();
    bingo.draft = createEmptyBingoDraft(bingo.draft.size || 3);
    bingo.selectedCellIndex = -1;
    bingo.selectedGoalId = '';
    bingo.activeBoardId = nextActiveBoardId;
    syncPublishedFromSavedBoards();
    syncGoalStoreFromBingoDraft();
    clearBingoDraftCache();
    render();
    showToast('작성 중인 빈 빙고를 취소했습니다.');
    persistBingoProfileInBackground('bingo-delete');
  }

  function openBingoPublishDialog() {
    if (!isAuthorized()) return;
    const draft = currentBingoDraft();
    if (!boardIsFull(draft)) return showToast('모든 칸을 목표로 채운 뒤 저장할 수 있습니다.');
    const activeBoard = currentPublishedBingo();
    const isUpdatingExisting = !!activeBoard && boardSignature(activeBoard) === boardSignature(draft);
    if (!isUpdatingExisting && currentSavedBoards().length >= 5) {
      return showToast('저장 가능한 빙고는 최대 5개입니다.');
    }
    $('bingoNameInput').value = currentPublishedBingo()?.name || '';
    $('bingoNameDialog')?.showModal();
  }

  async function publishBingo() {
    if (!isAuthorized()) return;
    const name = String($('bingoNameInput')?.value || '').trim();
    if (!name) return showToast('빙고 이름을 입력하세요.');
    $('bingoNameDialog')?.close('done');
    const draft = currentBingoDraft();
    if (!boardIsFull(draft)) return showToast('모든 칸을 목표로 채운 뒤 저장할 수 있습니다.');
    const activeBoard = currentPublishedBingo();
    const isUpdatingExisting = !!activeBoard && boardSignature(activeBoard) === boardSignature(draft);
    if (!isUpdatingExisting && currentSavedBoards().length >= 5) return showToast('저장 가능한 빙고는 최대 5개입니다.');
    const savedBoard = createSavedBoardFromDraft(draft, name, isUpdatingExisting ? activeBoard : null);
    upsertSavedBoard(savedBoard);
    const bingo = ensureBingoState();
    bingo.draft = createEmptyBingoDraft(savedBoard.size);
    bingo.selectedCellIndex = -1;
    syncGoalStoreFromBingoDraft();
    persistBingoDraftCache();
    render();
    showToast('빙고 저장을 반영했습니다.');
    persistBingoProfileInBackground('bingo-publish');
  }

  async function deleteBingoBoard() {
    if (!isAuthorized()) return;
    const board = currentPublishedBingo() || currentBingoDraft();
    const message = bingoBoardCompleted(board)
      ? '클리어한 빙고를 삭제합니다.'
      : '아직 미완성인 빙고를 삭제합니다. 계속하시겠습니까?';
    if (!window.confirm(message)) return;
    const deletedBoardId = String(currentPublishedBingo()?.id || '');
    if (deletedBoardId) {
      const bingo = ensureBingoState();
      removeSavedBoard(deletedBoardId, {
        preferDraft: !!String(bingo.draft?.updatedAt || '').trim()
      });
    } else {
      resetBingoStateLocally(currentBingoDraft().size || 3);
    }
    ensureBingoState().selectedCellIndex = -1;
    ensureBingoState().selectedGoalId = '';
    syncGoalStoreFromBingoDraft();
    persistBingoDraftCache();
    render();
    showToast('빙고를 삭제했습니다.');
    persistBingoProfileInBackground('bingo-delete');
  }

  function closeSongGoalPicker() {
    state.songGoalPickerPayload = null;
    $('songGoalBingoDialog')?.close('cancel');
    render();
  }

  function refreshGoalCandidates() {
    render();
  }

  function syncGoalChartTypeFromSelection() {
    const table = $('goalTable')?.value || 'SP11H';
    const chartTypeSel = $('goalChartType');
    const selectedTitle = String($('goalSong')?.value || '').trim();
    if (!selectedTitle) return;
    const view = state.tableViews?.[table];
    const matches = (view?.flatCharts || []).filter((chart) => env.titleKey(chart.title) === env.titleKey(selectedTitle));
    if (!matches.length) return;
    const currentType = String(chartTypeSel?.value || '').trim().toUpperCase();
    const matchedTypes = [...new Set(matches.map((chart) => String(chart.type || '').trim().toUpperCase()).filter(Boolean))];
    const nextType = matchedTypes.includes(currentType) ? currentType : matchedTypes[0];
    if (chartTypeSel && chartTypeSel.value !== nextType) {
      chartTypeSel.value = nextType;
      chartTypeSel.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function handleGoalTableChange() {
    state.goalSongQuery = '';
    if ($('goalSong')) $('goalSong').value = '';
    refreshGoalCandidates();
  }

  function importGoals() {
    ensureGoalImportInput().click();
  }

  async function clearGoals() {
    await deleteBingoBoard();
  }

  async function clearAchievedGoals() {
    await saveBingoDraft();
  }

  async function deleteGoal(goalId) {
    if (!isAuthorized()) return;
    state.profile.goals = state.profile.goals.filter((goal) => String(goal.id) !== String(goalId));
    render();
  }

  async function addGoalFromMainForm() {
    const selected = Number(ensureBingoState().selectedCellIndex);
    if (!Number.isInteger(selected) || selected < 0) return showToast('먼저 목표를 넣을 빙고 칸을 선택하세요.');
    await saveGoal(goalPayloadFromForm('goal'));
  }

  async function addGoalFromSongDialog() {
    if (!state.selectedChart) return;
    if (env.hasPublishedOnlyBingo()) {
      $('songGoalDialog')?.close('blocked');
      showToast('이미 빙고가 설정되어 추가할 수 없습니다. 기존 빙고를 삭제하거나 빙고에 빈칸이 있어야 합니다.');
      return;
    }
    state.songGoalPickerPayload = goalPayloadFromForm('songGoal', state.selectedChart);
    render();
    $('songGoalBingoDialog')?.showModal();
  }

  async function saveGoal(payload, options = {}) {
    if (!isAuthorized()) return showToast('로그인 후 사용할 수 있습니다.');
    const bingo = ensureBingoState();
    const draft = bingo.draft;
    const selectedIndex = Number(bingo.selectedCellIndex);
    if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= draft.cells.length) {
      return showToast('먼저 목표를 넣을 빙고 칸을 선택하세요.');
    }
    const nextGoal = normalizeGoalSnapshotForBingo({
      ...payload,
      id: String(draft.cells[selectedIndex]?.id || payload.id || crypto.randomUUID()),
      source: state.profile.djName || ''
    });
    const nextSig = goalSignature(nextGoal);
    const duplicateIndex = draft.cells.findIndex((cell) => cell && goalSignature(cell) === nextSig);
    if (duplicateIndex >= 0) {
      return showToast('이미 동일한 목표가 존재합니다.');
    }
    const chart = findChartForGoal(nextGoal);
    if (!chart || chart.isUnlocked === false) {
      const confirmed = window.confirm('보유하고 있지 않거나 해금되지 않은 곡입니다. 추가하시겠습니까?');
      if (!confirmed) return;
    }
    const overwriteConfirmMessage = String(options.overwriteConfirmMessage || '목표가 덮어씌워집니다. 계속할까요?');
    if (draft.cells[selectedIndex] && !window.confirm(overwriteConfirmMessage)) {
      return;
    }
    draft.cells[selectedIndex] = nextGoal;
    draft.updatedAt = new Date().toISOString();
    syncGoalStoreFromBingoDraft();
    persistBingoDraftCache();
    render();
    showToast('목표를 작성 중인 빙고에 반영했습니다.');
    return true;
  }

  async function applySongGoalToBingoCell(index) {
    if (!state.songGoalPickerPayload) return;
    const bingo = ensureBingoState();
    const draft = bingo.draft;
    const cellIndex = Number(index);
    if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex >= draft.cells.length) return;
    bingo.selectedCellIndex = cellIndex;
    const saved = await saveGoal(state.songGoalPickerPayload, {
      overwriteConfirmMessage: '내용이 덮어씌워집니다. 계속하시겠습니까?'
    });
    if (!saved) return;
    state.songGoalPickerPayload = null;
    $('songGoalBingoDialog')?.close('done');
    $('songGoalDialog')?.close('done');
  }

  return {
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
  };
}
