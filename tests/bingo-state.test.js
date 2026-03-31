import test from 'node:test';
import assert from 'node:assert/strict';

import {
  boardHasAssignments,
  createEmptyBingoDraft,
  createEmptyBingoState,
  mergeAcceptedSharedBingo,
  normalizeBingoStateShape
} from '../lib/bingo-state.js';

function makeBoard(id, name, cells, size = 3) {
  return {
    id,
    name,
    size,
    cells,
    savedAt: '2026-03-31T00:00:00.000Z'
  };
}

test('normalizeBingoStateShape promotes legacy published board into saved boards', () => {
  const legacyPublished = makeBoard('shared-1', '공유 빙고', ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']);
  const bingo = normalizeBingoStateShape({
    draft: createEmptyBingoDraft(3),
    published: legacyPublished
  });
  assert.equal(bingo.savedBoards.length, 1);
  assert.equal(bingo.activeBoardId, 'shared-1');
  assert.equal(bingo.published?.id, 'shared-1');
});

test('mergeAcceptedSharedBingo adds accepted board without creating a mirrored draft when nothing existed', () => {
  const acceptedBoard = makeBoard('shared-2', '받은 빙고', ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']);
  const merged = mergeAcceptedSharedBingo(createEmptyBingoState(3), acceptedBoard);
  assert.equal(merged.savedBoards.length, 1);
  assert.equal(merged.activeBoardId, 'shared-2');
  assert.equal(merged.published?.id, 'shared-2');
  assert.equal(merged.draft.updatedAt, '');
  assert.equal(boardHasAssignments(merged.draft), false);
});

test('mergeAcceptedSharedBingo keeps an in-progress draft and existing saved boards', () => {
  const previousState = {
    draft: {
      size: 3,
      cells: ['goal-1', null, null, null, null, null, null, null, null],
      updatedAt: '2026-03-31T01:00:00.000Z'
    },
    savedBoards: [
      makeBoard('saved-1', '기존 빙고', ['1', '2', '3', '4', '5', '6', '7', '8', '9'])
    ],
    activeBoardId: 'saved-1',
    published: makeBoard('saved-1', '기존 빙고', ['1', '2', '3', '4', '5', '6', '7', '8', '9']),
    selectedGoalId: '',
    selectedCellIndex: -1
  };
  const acceptedBoard = makeBoard('shared-3', '새로 받은 빙고', ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']);
  const merged = mergeAcceptedSharedBingo(previousState, acceptedBoard);
  assert.equal(merged.savedBoards.length, 2);
  assert.equal(merged.activeBoardId, 'shared-3');
  assert.equal(merged.published?.id, 'shared-3');
  assert.equal(merged.draft.updatedAt, '2026-03-31T01:00:00.000Z');
  assert.equal(boardHasAssignments(merged.draft), true);
});

test('mergeAcceptedSharedBingo does not duplicate an already saved shared board', () => {
  const acceptedBoard = makeBoard('shared-4', '공유 빙고', ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']);
  const previousState = {
    ...createEmptyBingoState(3),
    savedBoards: [acceptedBoard],
    activeBoardId: acceptedBoard.id,
    published: acceptedBoard
  };
  const merged = mergeAcceptedSharedBingo(previousState, acceptedBoard);
  assert.equal(merged.savedBoards.length, 1);
  assert.equal(merged.activeBoardId, 'shared-4');
});
