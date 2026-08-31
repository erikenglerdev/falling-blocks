import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  HIDDEN_ROWS,
  attemptHalfTurn,
  attemptRotation,
  clearCompletedLines,
  collides,
  createEmptyBoard,
  createPiece,
  detectTSpin,
  dropInterval,
  ensureQueue,
  getGhostY,
  getPieceCells,
  isLockOut,
  levelForLines,
  lineClearScore,
  mergePiece,
  movePiece,
  placementScore,
  shuffledBag,
} from '../lib/game.ts';

test('creates a 10 by 22 board with two hidden rows', () => {
  const board = createEmptyBoard();
  assert.equal(BOARD_HEIGHT, 22);
  assert.equal(HIDDEN_ROWS, 2);
  assert.equal(board.length, BOARD_HEIGHT);
  assert.ok(board.every((row) => row.length === BOARD_WIDTH));
  assert.ok(board.flat().every((cell) => cell === null));
});

test('all seven pieces spawn horizontally inside the hidden rows', () => {
  for (const type of ['I', 'J', 'L', 'O', 'S', 'T', 'Z']) {
    const cells = getPieceCells(createPiece(type));
    assert.ok(cells.every((cell) => cell.y < HIDDEN_ROWS), type);
    assert.ok(cells.every((cell) => cell.x >= 3 && cell.x <= 6), type);
  }
});

test('prevents pieces from crossing the side walls', () => {
  const board = createEmptyBoard();
  const piece = { ...createPiece('T'), x: 0 };
  assert.equal(movePiece(board, piece, -1, 0), null);
});

test('merges a landed piece and clears a completed line', () => {
  const board = createEmptyBoard();
  board[21] = Array(BOARD_WIDTH).fill('J');
  board[21][4] = null;
  board[21][5] = null;
  const piece = { ...createPiece('O'), x: 3, y: 20 };
  const merged = mergePiece(board, piece);
  const result = clearCompletedLines(merged);
  assert.equal(result.cleared, 1);
  assert.deepEqual(result.clearedRows, [21]);
  assert.ok(result.board[0].every((cell) => cell === null));
});

test('finds a ghost position directly above the floor', () => {
  const board = createEmptyBoard();
  assert.equal(getGhostY(board, createPiece('I')), 20);
});

test('uses the dedicated I-piece SRS kick table', () => {
  const board = createEmptyBoard();
  const piece = { ...createPiece('I'), x: -2, y: 5, rotation: 1 };
  const result = attemptRotation(board, piece, 1);
  assert.ok(result);
  assert.equal(result.kickIndex, 2);
  assert.equal(result.piece.x, 0);
  assert.equal(collides(board, result.piece), false);
});

test('uses the shared JLSTZ SRS kick table', () => {
  const board = createEmptyBoard();
  const piece = { ...createPiece('T'), x: -1, y: 5, rotation: 1 };
  const result = attemptRotation(board, piece, -1);
  assert.ok(result);
  assert.equal(result.kickIndex, 1);
  assert.equal(result.piece.x, 0);
});

test('does not translate the O piece while rotating', () => {
  const board = createEmptyBoard();
  const piece = { ...createPiece('O'), y: 8 };
  const result = attemptRotation(board, piece, 1);
  assert.deepEqual(result?.piece, { ...piece, rotation: 1 });
});

test('rotates a piece by 180 degrees using consecutive SRS turns', () => {
  const board = createEmptyBoard();
  const piece = { ...createPiece('T'), y: 8 };
  const result = attemptHalfTurn(board, piece);

  assert.ok(result);
  assert.equal(result.piece.rotation, 2);
  assert.equal(result.piece.x, piece.x);
  assert.equal(result.piece.y, piece.y);
});

test('a seven-bag contains every piece exactly once', () => {
  const bag = shuffledBag(() => 0.4);
  assert.deepEqual([...bag].sort(), ['I', 'J', 'L', 'O', 'S', 'T', 'Z']);
});

test('queue generation preserves complete consecutive seven-bags', () => {
  const queue = ensureQueue([], 14);
  assert.deepEqual(queue.slice(0, 7).sort(), ['I', 'J', 'L', 'O', 'S', 'T', 'Z']);
  assert.deepEqual(queue.slice(7, 14).sort(), ['I', 'J', 'L', 'O', 'S', 'T', 'Z']);
});

test('recognizes full and mini T-Spins with the three-corner rule', () => {
  const piece = { ...createPiece('T'), x: 3, y: 18 };
  const fullBoard = createEmptyBoard();
  fullBoard[18][3] = 'J';
  fullBoard[18][5] = 'J';
  fullBoard[20][3] = 'J';
  assert.equal(detectTSpin(fullBoard, piece, true, 0), 'full');

  const miniBoard = createEmptyBoard();
  miniBoard[18][3] = 'J';
  miniBoard[20][3] = 'J';
  miniBoard[20][5] = 'J';
  assert.equal(detectTSpin(miniBoard, piece, true, 0), 'mini');
  assert.equal(detectTSpin(fullBoard, piece, false, 0), null);
});

test('applies Back-to-Back and combo bonuses to a four-line clear', () => {
  const result = placementScore({
    cleared: 4,
    level: 2,
    tSpin: null,
    backToBack: true,
    combo: 0,
    perfectClear: false,
  });
  assert.equal(result.points, 2500);
  assert.equal(result.backToBack, true);
  assert.equal(result.combo, 1);
  assert.equal(result.label, 'Back-to-Back Vier Reihen');
});

test('rewards a Perfect Clear', () => {
  const result = placementScore({
    cleared: 1,
    level: 1,
    tSpin: null,
    backToBack: false,
    combo: -1,
    perfectClear: true,
  });
  assert.equal(result.points, 900);
  assert.equal(result.label, 'Perfect Clear');
});

test('locks out only when the entire piece remains above the visible field', () => {
  assert.equal(isLockOut(createPiece('T')), true);
  assert.equal(isLockOut({ ...createPiece('T'), y: 1 }), false);
});

test('uses guideline-style line scoring', () => {
  assert.equal(lineClearScore(4, 3), 2400);
});

test('uses the requested gravity milestones in milliseconds', () => {
  const milestones = [
    [0, 800],
    [9, 100],
    [19, 33],
    [29, 16],
  ];

  for (const [level, milliseconds] of milestones) {
    assert.equal(dropInterval(level), milliseconds);
  }
});

test('keeps the classic gravity plateaus between milestone levels', () => {
  assert.equal(dropInterval(10), 83);
  assert.equal(dropInterval(12), 83);
  assert.equal(dropInterval(13), 67);
  assert.equal(dropInterval(15), 67);
  assert.equal(dropInterval(16), 50);
  assert.equal(dropInterval(18), 50);
  assert.equal(dropInterval(28), 33);
  assert.equal(dropInterval(40), 16);
});

test('speeds up on every level from level 1 through level 9', () => {
  const intervals = Array.from({ length: 9 }, (_, index) =>
    dropInterval(index + 1),
  );

  for (let index = 1; index < intervals.length; index += 1) {
    assert.ok(intervals[index] < intervals[index - 1]);
  }
});

test('uses the selected start level until its line threshold is reached', () => {
  assert.equal(levelForLines(0, 0), 0);
  assert.equal(levelForLines(0, 9), 0);
  assert.equal(levelForLines(0, 10), 1);
  assert.equal(levelForLines(0, 20), 2);
  assert.equal(levelForLines(9, 99), 9);
  assert.equal(levelForLines(9, 100), 10);
  assert.equal(levelForLines(9, 110), 11);
});
