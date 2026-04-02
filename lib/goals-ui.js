import { normalizeBingoState } from './data.js';
import { $, esc, goalAchieved, goalLabel, showToast, titleKey } from './utils.js';

let lastGoalAnimationSignature = '';

function findChartForGoalInUi(ctx, goal) {
  const view = ctx.state.tableViews?.[goal?.table || ''];
  return view?.flatCharts?.find((chart) => titleKey(chart.title) === titleKey(goal.title) && chart.type === goal.chartType) || null;
}

function bingoCellState(ctx, goal, progress) {
  if (!goal) return { key: 'empty', label: '비어 있음' };
  const chart = findChartForGoalInUi(ctx, goal);
  if (!chart || chart.isUnlocked === false) return { key: 'locked', label: '미해금 / 미존재', chart };
  if (goalAchieved(goal, progress)) return { key: 'done', label: '달성', chart };
  return { key: 'pending', label: '진행중', chart };
}

export function bingoGoalTargetText(goal) {
  if (!goal) return '-';
  if (goal.kind === 'SCORE') return `EX ${goal.targetScore ?? 0}`;
  if (goal.kind === 'RANK') return goal.targetRank || 'AA';
  return goal.targetLamp || 'HC';
}

function safeBingoGoalState(ctx, goal, progress) {
  try {
    return bingoCellState(ctx, goal, progress);
  } catch (error) {
    console.error('bingoCellState failed', error);
    return { key: goal ? 'pending' : 'empty', label: goal ? '진행중' : '비어 있음' };
  }
}

function bingoTitleDifficultyClass(goal) {
  const type = String(goal?.chartType || '').trim().toUpperCase();
  if (type === 'H') return 'bingo-cell-title-h';
  if (type === 'A') return 'bingo-cell-title-a';
  if (type === 'L') return 'bingo-cell-title-l';
  return '';
}

function renderGoalsFallback(ctx, error) {
  const list = $('goalList');
  if (!list) return;
  const bingo = normalizeBingoState(ctx.state.profile?.bingoState);
  const draft = bingo.draft;
  const displayBoard = bingo.published || draft;
  const selectedCellIndex = bingo.published ? -1 : (Number.isInteger(bingo.selectedCellIndex) ? bingo.selectedCellIndex : -1);
  const cellsHtml = displayBoard.cells.map((goal, index) => {
    const selected = selectedCellIndex === index;
    if (!goal) {
      return `<button type="button" class="bingo-cell bingo-cell-empty ${selected ? 'selected' : ''}" data-bingo-cell="${index}">
          <div class="bingo-cell-index">${index + 1}</div>
          <div class="bingo-cell-empty-label">Empty</div>
        </button>`;
    }
    const target = goal.kind === 'RANK'
      ? `RANK : ${esc(goal.targetRank || 'AA')}`
      : goal.kind === 'SCORE'
        ? `SCORE : EX ${esc(String(goal.targetScore ?? 0))}`
        : `CLEAR : ${esc(goal.targetLamp || 'HC')}`;
    return `<button type="button" class="bingo-cell bingo-cell-pending ${selected ? 'selected' : ''}" data-bingo-cell="${index}">
      <div class="bingo-cell-index">${index + 1}</div>
      <div class="bingo-cell-title ${bingoTitleDifficultyClass(goal)}">${esc(goal.title)} [${esc(goal.chartType)}]</div>
      <div class="bingo-cell-target">${target}</div>
      <div class="bingo-cell-status">진행중</div>
    </button>`;
  }).join('');
  list.innerHTML = `<div class="bingo-layout"><div class="bingo-layout-main"><div class="bingo-board-shell">
    <div class="bingo-board-head">
      <div class="bingo-board-headline">${bingo.published?.name ? esc(bingo.published.name) : '칸을 선택한 후 목표를 설정하세요.'}</div>
    </div>
    <div class="bingo-board-grid size-${displayBoard.size}">
      ${cellsHtml}
    </div>
  </div></div></div>`;
  console.error('renderGoals failed; fallback rendered', error);
}

function goalSignatureForUi(goal) {
  if (!goal) return '';
  const kind = String(goal.kind || 'CLEAR').trim().toUpperCase();
  const target = kind === 'SCORE'
    ? `S:${Math.max(0, Number(goal.targetScore || 0))}`
    : kind === 'RANK'
      ? `R:${String(goal.targetRank || 'AA').trim().toUpperCase()}`
      : `C:${String(goal.targetLamp || 'HC').trim().toUpperCase()}`;
  return [
    String(goal.table || '').trim(),
    String(goal.title || '').trim().toLowerCase(),
    String(goal.chartType || '').trim().toUpperCase(),
    kind,
    target
  ].join('|');
}

export function syncGoalTargetInputVisibility(prefix = 'goal', enhancedSelects = new Map()) {
  const kind = $(`${prefix}Kind`)?.value || 'CLEAR';
  const hideLamp = kind !== 'CLEAR';
  const hideScore = kind !== 'SCORE';
  const hideRank = kind !== 'RANK';
  $(`${prefix}Lamp`)?.classList.toggle('hidden', hideLamp);
  $(`${prefix}Score`)?.classList.toggle('hidden', hideScore);
  $(`${prefix}Rank`)?.classList.toggle('hidden', hideRank);
  if (prefix === 'goal') {
    enhancedSelects.get('goalLamp')?.wrap?.classList.toggle('hidden', hideLamp);
    enhancedSelects.get('goalRank')?.wrap?.classList.toggle('hidden', hideRank);
  }
}

export function renderGoalCandidates(ctx, enhancedSelects = new Map()) {
  const table = $('goalTable')?.value || 'SP11H';
  const view = ctx.state.tableViews[table];
  const songSel = $('goalSong');
  if (!songSel) return;
  const prev = songSel.value;
  const search = String(ctx.state.goalSongQuery || '').trim().toLowerCase();
  const songs = [...new Set((view?.flatCharts || []).map((chart) => chart.title).filter(Boolean))]
    .filter((title) => !search || String(title).toLowerCase().includes(search))
    .sort((a, b) => a.localeCompare(b, 'ko'));
  songSel.innerHTML = `<option value=""></option>${songs.map((title) => `<option value="${esc(title)}">${esc(title)}</option>`).join('')}`;
  songSel.value = songs.includes(prev) ? prev : '';
  ctx.actions.syncGoalChartTypeFromSelection();
  enhancedSelects.get('goalSong')?.render?.();
}

export function renderGoals(ctx, enhancedSelects = new Map()) {
  const list = $('goalList');
  if (!list) return;
  if (!ctx.isAuthorized()) {
    $('goalPool').innerHTML = '';
    $('bingoMeta').innerHTML = '';
    list.innerHTML = '<div class="goal-item">로그인 후 프로필을 등록하면 목표 기능을 사용할 수 있습니다.</div>';
    return;
  }
  try {
    const progress = ctx.progressMap?.() || {};
    const bingo = normalizeBingoState(ctx.state.profile?.bingoState);
    const draft = bingo.draft;
    const savedBoards = bingo.savedBoards || [];
    const published = bingo.published;
    const displayBoard = published || draft;
    const isDraftActive = !published;
    $('goalPool').innerHTML = '';
    $('bingoMeta').innerHTML = '';
    if ($('bingoSize')) $('bingoSize').value = String(draft.size || 3);
    enhancedSelects.get('bingoSize')?.render?.();
    const boardSignature = JSON.stringify({
      mode: isDraftActive ? 'draft' : `saved:${published?.id || ''}`,
      size: displayBoard.size,
      selectedCellIndex: isDraftActive ? bingo.selectedCellIndex : -1,
      publishedName: published?.name || '',
      savedBoards: savedBoards.map((board) => `${board.id}:${board.name}:${board.savedAt}`),
      draftUpdatedAt: draft.updatedAt || '',
      cells: (displayBoard.cells || []).map((goal) => (goal ? `${goalSignatureForUi(goal)}:${safeBingoGoalState(ctx, goal, progress).key}` : ''))
    });
    const shouldAnimate = lastGoalAnimationSignature !== boardSignature;
    list.classList.toggle('animated', shouldAnimate);

    const assignedCount = (draft.cells || []).filter(Boolean).length;
    const totalCount = Number(draft.size || 3) ** 2;
    const isBoardFull = assignedCount === totalCount && totalCount > 0;
    const publishedCells = Array.isArray(published?.cells) ? published.cells : [];
    const isSharedPublished = !!published?.sharedFromUserId;
    const boardMode = published ? (isSharedPublished ? 'shared' : 'saved') : 'draft';
    const isBoardComplete = (displayBoard.cells || []).length > 0 && (displayBoard.cells || []).every((goal) => {
      try {
        return goal && goalAchieved(goal, progress);
      } catch (error) {
        console.error('goalAchieved failed', error);
        return false;
      }
    });
    if ($('btnExportGoals')) $('btnExportGoals').disabled = !published || !publishedCells.every(Boolean);
    if ($('btnImportGoals')) $('btnImportGoals').disabled = false;
    if ($('btnShareBingo')) $('btnShareBingo').disabled = !published || !publishedCells.every(Boolean);
    if ($('btnClearGoals')) $('btnClearGoals').disabled = !published && assignedCount === 0;
    if ($('btnBingoDraftSave')) $('btnBingoDraftSave').disabled = assignedCount === 0;
    if ($('btnBingoPublish')) $('btnBingoPublish').disabled = !isBoardFull;
    if ($('btnClearBingoCell')) $('btnClearBingoCell').disabled = !Number.isInteger(bingo.selectedCellIndex) || bingo.selectedCellIndex < 0;

    const selectedCellIndex = isDraftActive && Number.isInteger(bingo.selectedCellIndex) ? bingo.selectedCellIndex : -1;
    const cellsHtml = (displayBoard.cells || []).map((goal, index) => {
      const state = safeBingoGoalState(ctx, goal, progress);
      const selected = selectedCellIndex === index;
      if (!goal) {
        return `<button type="button" class="bingo-cell bingo-cell-empty ${selected ? 'selected' : ''}" data-bingo-cell="${index}">
          <div class="bingo-cell-index">${index + 1}</div>
          <div class="bingo-cell-empty-label">Empty</div>
        </button>`;
      }
      const goalKindLabel = String(goal.kind || 'CLEAR').trim().toUpperCase();
      const targetLabel = goalKindLabel === 'RANK'
        ? `RANK : ${esc(goal.targetRank || 'AA')}`
        : goalKindLabel === 'SCORE'
          ? `SCORE : EX ${esc(String(goal.targetScore ?? 0))}`
          : `CLEAR : ${esc(goal.targetLamp || 'HC')}`;
      return `<button type="button" class="bingo-cell bingo-cell-${state.key} ${selected ? 'selected' : ''}" data-bingo-cell="${index}">
        <div class="bingo-cell-index">${index + 1}</div>
        <div class="bingo-cell-title ${bingoTitleDifficultyClass(goal)}">${esc(goal.title)} [${esc(goal.chartType)}]</div>
        <div class="bingo-cell-target">${targetLabel}</div>
        <div class="bingo-cell-status">${esc(state.label)}</div>
      </button>`;
    }).join('');
    const savedBoardCards = savedBoards.map((board, index) => {
      const boardComplete = (board.cells || []).every((goal) => goal && goalAchieved(goal, progress));
      const active = String(board?.id || '') === String(bingo.activeBoardId || '');
      const sharedLabel = String(board?.sharedFromDjName || board?.sharedFromInfinitasId || '').trim();
      const sharedBadge = board?.sharedFromUserId
        ? `<span class="bingo-list-badge shared">${esc(sharedLabel || '공유받음')}</span>`
        : '';
      return `<button type="button" class="bingo-list-item ${boardComplete ? 'done' : 'pending'} ${active ? 'active' : ''}" data-bingo-board-select="${esc(board.id)}" style="--i:${index}">
        <div class="bingo-list-title-row">
          <div class="bingo-list-name">${esc(board.name || '이름 없는 빙고')}</div>
          ${sharedBadge}
        </div>
        <div class="bingo-list-meta">${esc(`${board.size} x ${board.size}`)} / ${boardComplete ? '클리어' : '진행 중'}</div>
      </button>`;
    }).join('');
    const draftListCard = bingo.draft.updatedAt
      ? `<button type="button" class="bingo-list-item draft ${!published ? 'active' : ''}" data-bingo-board-select="" style="--i:-1">
          <div class="bingo-list-name">[빈 빙고]</div>
          <div class="bingo-list-meta">${esc(`${draft.size} x ${draft.size}`)} / 수정 중</div>
        </button>`
      : '';
    const boardActionsHtml = boardMode === 'draft'
      ? `<button type="button" class="small-btn" data-bingo-header-action="import">빙고 불러오기</button>
         <button type="button" class="small-btn" data-bingo-header-action="draft-save" ${assignedCount === 0 ? 'disabled' : ''}>임시 저장</button>
         <button type="button" class="small-btn danger" data-bingo-header-action="draft-cancel">생성 취소</button>
         <button type="button" class="small-btn primary-btn" data-bingo-header-action="publish" ${!isBoardFull ? 'disabled' : ''}>저장</button>`
      : boardMode === 'shared'
        ? `<button type="button" class="small-btn danger" data-bingo-header-action="delete">빙고 삭제</button>`
        : `<button type="button" class="small-btn" data-bingo-header-action="export" ${!published || !publishedCells.every(Boolean) ? 'disabled' : ''}>빙고 내보내기</button>
           <button type="button" class="small-btn" data-bingo-header-action="share" ${!published || !publishedCells.every(Boolean) ? 'disabled' : ''}>빙고 공유</button>
           <button type="button" class="small-btn danger" data-bingo-header-action="delete">빙고 삭제</button>`;
    list.innerHTML = `<div class="bingo-layout">
      <aside class="bingo-sidebar">
        <button type="button" class="social-follow-add-btn bingo-add-board-btn" data-bingo-add-new="1" title="빙고 추가" ${bingo.draft.updatedAt ? 'disabled' : ''}>
          <span class="social-follow-add-icon">+</span>
          <span class="social-follow-add-text bingo-add-board-text">빙고 추가</span>
        </button>
        <div class="bingo-sidebar-panel">
          <div class="bingo-sidebar-list">
            ${draftListCard}${savedBoardCards || (!draftListCard ? '<div class="bingo-sidebar-empty">저장된 빙고가 없습니다.</div>' : '')}
          </div>
        </div>
      </aside>
      <div class="bingo-layout-main">
        <div class="bingo-board-shell">
          <div class="bingo-board-head">
            <div class="bingo-board-headline">${published?.name ? esc(published.name) : '칸을 선택한 후 목표를 설정하세요.'}</div>
            <div class="bingo-board-head-actions">
              ${boardActionsHtml}
              ${isBoardComplete ? '<div class="bingo-finished-banner">BINGO!</div>' : ''}
            </div>
          </div>
          <div class="bingo-board-grid size-${displayBoard.size || 3}">
            ${cellsHtml}
          </div>
        </div>
      </div>
    </div>`;
    lastGoalAnimationSignature = boardSignature;
  } catch (error) {
    renderGoalsFallback(ctx, error);
  }
}

export function openGoalDialog(chart, isAuthorized) {
  if (!isAuthorized) {
    showToast('로그인 후 프로필을 등록하면 곡별 목표를 추가할 수 있습니다.');
    return false;
  }
  $('songGoalMeta').textContent = `${chart.tableName} / ${chart.title} / ${chart.type}`;
  syncGoalTargetInputVisibility('songGoal');
  document.getElementById('songGoalDialog')?.showModal();
  return true;
}

export function renderSongGoalBingoPicker(ctx) {
  const body = $('songGoalBingoBody');
  if (!body) return;
  const payload = ctx.state.songGoalPickerPayload;
  if (!payload || !ctx.isAuthorized()) {
    body.innerHTML = '';
    return;
  }
  const bingo = normalizeBingoState(ctx.state.profile?.bingoState);
  const size = Number(bingo.draft?.size || 3);
  const cells = Array.isArray(bingo.draft?.cells) ? [...bingo.draft.cells] : [];
  const cellsHtml = cells.map((goal, index) => {
    const filled = !!goal;
    return `<button type="button" class="song-goal-bingo-picker-cell ${filled ? 'filled' : 'empty'}" data-song-goal-cell="${index}">
      <div class="song-goal-bingo-picker-index">${index + 1}</div>
      <div class="song-goal-bingo-picker-cell-title">${filled ? `${esc(goal.title)} [${esc(goal.chartType)}]` : 'Empty'}</div>
      <div class="song-goal-bingo-picker-sub">${filled ? `${esc(goal.kind)} : ${esc(bingoGoalTargetText(goal))}` : '비어 있는 칸'}</div>
    </button>`;
  }).join('');
  body.innerHTML = `<div class="song-goal-bingo-picker-head">
    <div class="song-goal-bingo-picker-title">추가할 칸을 선택하세요.</div>
    <div class="song-goal-bingo-picker-meta">${esc(payload.title || '')} [${esc(payload.chartType || '')}] / ${esc(payload.kind || '')}</div>
  </div>
  <div class="song-goal-bingo-picker-grid size-${size}">
    ${cellsHtml}
  </div>`;
}
