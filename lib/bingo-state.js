function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

export function normalizeBingoSize(sizeRaw) {
  const size = Number(sizeRaw || 3);
  return [3, 4, 5].includes(size) ? size : 3;
}

function createEmptyBingoCells(size) {
  return Array.from({ length: normalizeBingoSize(size) ** 2 }, () => null);
}

export function createEmptyBingoDraft(size = 3) {
  const normalizedSize = normalizeBingoSize(size);
  return {
    size: normalizedSize,
    cells: createEmptyBingoCells(normalizedSize),
    updatedAt: ''
  };
}

export function createEmptyBingoState(size = 3) {
  return {
    draft: createEmptyBingoDraft(size),
    savedBoards: [],
    activeBoardId: '',
    published: null,
    selectedGoalId: '',
    selectedCellIndex: -1
  };
}

export function boardHasAssignments(board) {
  return Array.isArray(board?.cells) && board.cells.some(Boolean);
}

export function boardIsFull(board) {
  return Array.isArray(board?.cells) && board.cells.length > 0 && board.cells.every(Boolean);
}

export function boardSignature(board) {
  return JSON.stringify({
    size: normalizeBingoSize(board?.size),
    cells: Array.isArray(board?.cells) ? board.cells : []
  });
}

function normalizeBingoCells(rawCells, size, normalizeCell) {
  const cells = Array.isArray(rawCells)
    ? rawCells.slice(0, size * size).map((cell) => normalizeCell(cell))
    : [];
  while (cells.length < size * size) cells.push(null);
  return cells;
}

export function normalizeBingoBoard(rawBoard, options = {}) {
  if (!rawBoard || typeof rawBoard !== 'object') return null;
  const normalizeCell = typeof options.normalizeCell === 'function'
    ? options.normalizeCell
    : (cell) => cell;
  const size = normalizeBingoSize(rawBoard.size);
  return {
    id: String(
      rawBoard.id
      || rawBoard.savedAt
      || `${String(rawBoard.name || 'bingo').trim()}-${size}`
    ).trim(),
    name: String(rawBoard.name || '').trim(),
    size,
    cells: normalizeBingoCells(rawBoard.cells, size, normalizeCell),
    savedAt: String(rawBoard.savedAt || '').trim(),
    sharedFromUserId: String(rawBoard.sharedFromUserId || '').trim(),
    sharedFromDjName: String(rawBoard.sharedFromDjName || '').trim(),
    sharedFromInfinitasId: String(rawBoard.sharedFromInfinitasId || '').trim(),
    completionNotifiedAt: String(rawBoard.completionNotifiedAt || '').trim()
  };
}

export function normalizeBingoStateShape(rawState, options = {}) {
  const normalizeCell = typeof options.normalizeCell === 'function'
    ? options.normalizeCell
    : (cell) => cell;
  const src = rawState && typeof rawState === 'object' ? rawState : {};
  const draft = {
    ...createEmptyBingoDraft(src?.draft?.size),
    size: normalizeBingoSize(src?.draft?.size),
    cells: normalizeBingoCells(src?.draft?.cells, normalizeBingoSize(src?.draft?.size), normalizeCell),
    updatedAt: String(src?.draft?.updatedAt || '').trim()
  };
  const rawSavedBoards = Array.isArray(src.savedBoards) ? src.savedBoards : [];
  const savedBoards = rawSavedBoards
    .map((board) => normalizeBingoBoard(board, { normalizeCell }))
    .filter(Boolean)
    .slice(0, 5);
  const legacyPublished = normalizeBingoBoard(src.published, { normalizeCell });
  if (legacyPublished && !savedBoards.some((board) => board.id === legacyPublished.id)) {
    savedBoards.unshift(legacyPublished);
  }
  if (savedBoards.length > 5) savedBoards.length = 5;
  const requestedActiveBoardId = Object.prototype.hasOwnProperty.call(src, 'activeBoardId')
    ? String(src.activeBoardId || '').trim()
    : String(savedBoards[0]?.id || '').trim();
  const published = requestedActiveBoardId
    ? savedBoards.find((board) => board.id === requestedActiveBoardId) || null
    : null;
  return {
    draft,
    savedBoards,
    activeBoardId: published?.id || '',
    published: published ? cloneJson(published) : null,
    selectedGoalId: String(src.selectedGoalId || '').trim(),
    selectedCellIndex: Number.isInteger(src.selectedCellIndex) ? src.selectedCellIndex : -1
  };
}

export function mergeAcceptedSharedBingo(previousState, acceptedBoard, options = {}) {
  const maxSavedBoards = Number.isInteger(options.maxSavedBoards) ? options.maxSavedBoards : 5;
  const nextAcceptedBoard = normalizeBingoBoard(acceptedBoard);
  const previous = normalizeBingoStateShape(previousState);
  if (!nextAcceptedBoard) return previous;
  const savedBoards = previous.savedBoards.map((board) => cloneJson(board));
  const existingIndex = savedBoards.findIndex((board) => (
    String(board?.id || '') === String(nextAcceptedBoard.id || '')
      || boardSignature(board) === boardSignature(nextAcceptedBoard)
  ));
  if (existingIndex < 0 && savedBoards.length >= maxSavedBoards) {
    throw new Error('bingo_board_limit_exceeded');
  }
  if (existingIndex >= 0) savedBoards[existingIndex] = nextAcceptedBoard;
  else savedBoards.push(nextAcceptedBoard);
  const activeBoard = existingIndex >= 0 ? savedBoards[existingIndex] : savedBoards[savedBoards.length - 1];
  const keepDraft = boardHasAssignments(previous.draft) || String(previous.draft?.updatedAt || '').trim();
  return {
    draft: keepDraft ? cloneJson(previous.draft) : createEmptyBingoDraft(previous.draft?.size || activeBoard?.size || 3),
    savedBoards,
    activeBoardId: String(activeBoard?.id || '').trim(),
    published: activeBoard ? cloneJson(activeBoard) : null,
    selectedGoalId: '',
    selectedCellIndex: -1
  };
}
