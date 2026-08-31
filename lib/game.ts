export const BOARD_WIDTH = 10;
export const VISIBLE_HEIGHT = 20;
export const HIDDEN_ROWS = 2;
export const BOARD_HEIGHT = VISIBLE_HEIGHT + HIDDEN_ROWS;
export const LOCK_DELAY_MS = 500;
export const MAX_LOCK_RESETS = 15;
export const DAS_MS = 167;
export const ARR_MS = 33;
export const SOFT_DROP_INTERVAL_MS = 33;

export const PIECE_TYPES = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'] as const;

export type PieceType = (typeof PIECE_TYPES)[number];
export type Cell = PieceType | null;
export type Board = Cell[][];
export type Rotation = 0 | 1 | 2 | 3;
export type TSpinType = 'full' | 'mini' | null;

export interface ActivePiece {
  type: PieceType;
  rotation: Rotation;
  x: number;
  y: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface RotationResult {
  piece: ActivePiece;
  kickIndex: number;
}

export interface PlacementScoreInput {
  cleared: number;
  level: number;
  tSpin: TSpinType;
  backToBack: boolean;
  combo: number;
  perfectClear: boolean;
}

export interface PlacementScoreResult {
  points: number;
  combo: number;
  backToBack: boolean;
  label: string;
}

const SHAPES: Record<PieceType, ReadonlyArray<ReadonlyArray<Point>>> = {
  I: [
    [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }],
    [{ x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 2, y: 3 }],
    [{ x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 }],
    [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 1, y: 3 }],
  ],
  J: [
    [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
    [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }],
    [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }],
    [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 2 }],
  ],
  L: [
    [{ x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
    [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }],
    [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 0, y: 2 }],
    [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }],
  ],
  O: [
    [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
    [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
    [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
    [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
  ],
  S: [
    [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
    [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }],
    [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 2 }],
    [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }],
  ],
  T: [
    [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
    [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }],
    [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }],
    [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }],
  ],
  Z: [
    [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
    [{ x: 2, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }],
    [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }],
    [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 0, y: 2 }],
  ],
};

type KickTable = Record<string, ReadonlyArray<Point>>;

// Hard Drop lists y as positive upwards. These tables use browser/grid
// coordinates, so the y values are inverted.
const JLSTZ_KICKS: KickTable = {
  '0>1': [{ x: 0, y: 0 }, { x: -1, y: 0 }, { x: -1, y: -1 }, { x: 0, y: 2 }, { x: -1, y: 2 }],
  '1>0': [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: -2 }, { x: 1, y: -2 }],
  '1>2': [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: -2 }, { x: 1, y: -2 }],
  '2>1': [{ x: 0, y: 0 }, { x: -1, y: 0 }, { x: -1, y: -1 }, { x: 0, y: 2 }, { x: -1, y: 2 }],
  '2>3': [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: -1 }, { x: 0, y: 2 }, { x: 1, y: 2 }],
  '3>2': [{ x: 0, y: 0 }, { x: -1, y: 0 }, { x: -1, y: 1 }, { x: 0, y: -2 }, { x: -1, y: -2 }],
  '3>0': [{ x: 0, y: 0 }, { x: -1, y: 0 }, { x: -1, y: 1 }, { x: 0, y: -2 }, { x: -1, y: -2 }],
  '0>3': [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: -1 }, { x: 0, y: 2 }, { x: 1, y: 2 }],
};

const I_KICKS: KickTable = {
  '0>1': [{ x: 0, y: 0 }, { x: -2, y: 0 }, { x: 1, y: 0 }, { x: -2, y: 1 }, { x: 1, y: -2 }],
  '1>0': [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: -1, y: 0 }, { x: 2, y: -1 }, { x: -1, y: 2 }],
  '1>2': [{ x: 0, y: 0 }, { x: -1, y: 0 }, { x: 2, y: 0 }, { x: -1, y: -2 }, { x: 2, y: 1 }],
  '2>1': [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: -2, y: 0 }, { x: 1, y: 2 }, { x: -2, y: -1 }],
  '2>3': [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: -1, y: 0 }, { x: 2, y: -1 }, { x: -1, y: 2 }],
  '3>2': [{ x: 0, y: 0 }, { x: -2, y: 0 }, { x: 1, y: 0 }, { x: -2, y: 1 }, { x: 1, y: -2 }],
  '3>0': [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: -1, y: 0 }, { x: 2, y: 1 }, { x: -1, y: -2 }],
  '0>3': [{ x: 0, y: 0 }, { x: -1, y: 0 }, { x: 2, y: 0 }, { x: -1, y: -2 }, { x: 2, y: 1 }],
};

export const PIECE_COLORS: Record<PieceType, string> = {
  I: '#49dff2',
  J: '#6688ff',
  L: '#ffad56',
  O: '#f8dd5b',
  S: '#72e09a',
  T: '#a879ff',
  Z: '#ff6e8a',
};

export function createEmptyBoard(): Board {
  return Array.from({ length: BOARD_HEIGHT }, () =>
    Array<Cell>(BOARD_WIDTH).fill(null),
  );
}

export function createPiece(type: PieceType): ActivePiece {
  return { type, rotation: 0, x: 3, y: 0 };
}

export function getPieceCells(piece: ActivePiece): Point[] {
  return SHAPES[piece.type][piece.rotation].map((cell) => ({
    x: piece.x + cell.x,
    y: piece.y + cell.y,
  }));
}

export function collides(board: Board, piece: ActivePiece): boolean {
  return getPieceCells(piece).some(({ x, y }) => {
    if (x < 0 || x >= BOARD_WIDTH || y < 0 || y >= BOARD_HEIGHT) return true;
    return board[y][x] !== null;
  });
}

export function movePiece(
  board: Board,
  piece: ActivePiece,
  dx: number,
  dy: number,
): ActivePiece | null {
  const moved = { ...piece, x: piece.x + dx, y: piece.y + dy };
  return collides(board, moved) ? null : moved;
}

export function attemptRotation(
  board: Board,
  piece: ActivePiece,
  direction: 1 | -1,
): RotationResult | null {
  const rotation = ((piece.rotation + direction + 4) % 4) as Rotation;
  if (piece.type === 'O') {
    const rotated = { ...piece, rotation };
    return collides(board, rotated) ? null : { piece: rotated, kickIndex: 0 };
  }

  const table = piece.type === 'I' ? I_KICKS : JLSTZ_KICKS;
  const kicks = table[`${piece.rotation}>${rotation}`];
  for (let index = 0; index < kicks.length; index += 1) {
    const kick = kicks[index];
    const rotated = {
      ...piece,
      rotation,
      x: piece.x + kick.x,
      y: piece.y + kick.y,
    };
    if (!collides(board, rotated)) return { piece: rotated, kickIndex: index };
  }
  return null;
}

export function attemptHalfTurn(
  board: Board,
  piece: ActivePiece,
): RotationResult | null {
  const directions = [1, -1] as const;

  for (const direction of directions) {
    const firstTurn = attemptRotation(board, piece, direction);
    if (!firstTurn) continue;
    const secondTurn = attemptRotation(board, firstTurn.piece, direction);
    if (secondTurn) return secondTurn;
  }

  return null;
}

export function rotatePiece(
  board: Board,
  piece: ActivePiece,
  direction: 1 | -1,
): ActivePiece | null {
  return attemptRotation(board, piece, direction)?.piece ?? null;
}

export function isGrounded(board: Board, piece: ActivePiece): boolean {
  return movePiece(board, piece, 0, 1) === null;
}

export function getGhostY(board: Board, piece: ActivePiece): number {
  let ghostY = piece.y;
  while (!collides(board, { ...piece, y: ghostY + 1 })) ghostY += 1;
  return ghostY;
}

export function mergePiece(board: Board, piece: ActivePiece): Board {
  const merged = board.map((row) => [...row]);
  for (const { x, y } of getPieceCells(piece)) merged[y][x] = piece.type;
  return merged;
}

export function clearCompletedLines(board: Board): {
  board: Board;
  cleared: number;
  clearedRows: number[];
} {
  const clearedRows = board.flatMap((row, index) =>
    row.every((cell) => cell !== null) ? [index] : [],
  );
  const remaining = board.filter((row) => row.some((cell) => cell === null));
  const cleared = clearedRows.length;
  const emptyRows = Array.from({ length: cleared }, () =>
    Array<Cell>(BOARD_WIDTH).fill(null),
  );
  return { board: [...emptyRows, ...remaining], cleared, clearedRows };
}

export function isBoardEmpty(board: Board): boolean {
  return board.every((row) => row.every((cell) => cell === null));
}

export function isLockOut(piece: ActivePiece): boolean {
  return getPieceCells(piece).every((cell) => cell.y < HIDDEN_ROWS);
}

function occupied(board: Board, x: number, y: number): boolean {
  return x < 0 || x >= BOARD_WIDTH || y < 0 || y >= BOARD_HEIGHT || board[y][x] !== null;
}

export function detectTSpin(
  board: Board,
  piece: ActivePiece,
  lastMoveWasRotation: boolean,
  kickIndex: number,
): TSpinType {
  if (piece.type !== 'T' || !lastMoveWasRotation) return null;
  const centerX = piece.x + 1;
  const centerY = piece.y + 1;
  const corners = {
    topLeft: occupied(board, centerX - 1, centerY - 1),
    topRight: occupied(board, centerX + 1, centerY - 1),
    bottomLeft: occupied(board, centerX - 1, centerY + 1),
    bottomRight: occupied(board, centerX + 1, centerY + 1),
  };
  const occupiedCorners = Object.values(corners).filter(Boolean).length;
  if (occupiedCorners < 3) return null;

  const frontCorners: [boolean, boolean] = {
    0: [corners.topLeft, corners.topRight],
    1: [corners.topRight, corners.bottomRight],
    2: [corners.bottomLeft, corners.bottomRight],
    3: [corners.topLeft, corners.bottomLeft],
  }[piece.rotation] as [boolean, boolean];

  return (frontCorners[0] && frontCorners[1]) || kickIndex === 4
    ? 'full'
    : 'mini';
}

export function shuffledBag(random: () => number = Math.random): PieceType[] {
  const bag = [...PIECE_TYPES];
  for (let index = bag.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [bag[index], bag[swapIndex]] = [bag[swapIndex], bag[index]];
  }
  return bag;
}

export function ensureQueue(queue: PieceType[], minimum = 7): PieceType[] {
  const filled = [...queue];
  while (filled.length < minimum) filled.push(...shuffledBag());
  return filled;
}

export function lineClearScore(cleared: number, level: number): number {
  return ([0, 100, 300, 500, 800][cleared] ?? 0) * level;
}

export function placementScore(input: PlacementScoreInput): PlacementScoreResult {
  const { cleared, level, tSpin, backToBack, perfectClear } = input;
  const nextCombo = cleared > 0 ? input.combo + 1 : -1;
  const difficult = cleared === 4 || (tSpin !== null && cleared > 0);
  const baseTable = tSpin === 'full'
    ? [400, 800, 1200, 1600]
    : tSpin === 'mini'
      ? [100, 200, 400, 0]
      : [0, 100, 300, 500, 800];
  const base = (baseTable[cleared] ?? 0) * level;
  const backToBackBonus = difficult && backToBack ? Math.floor(base * 0.5) : 0;
  const comboBonus = nextCombo > 0 ? 50 * nextCombo * level : 0;
  const perfectClearBonus = perfectClear
    ? ([0, 800, 1200, 1800, 2000][cleared] ?? 0) * level
    : 0;
  const nextBackToBack = difficult ? true : cleared > 0 ? false : backToBack;

  let label = '';
  if (tSpin) label = tSpin === 'mini' ? 'T-Spin Mini' : 'T-Spin';
  if (!tSpin && cleared === 4) label = 'Vier Reihen';
  if (!tSpin && cleared > 0 && cleared < 4) {
    label = ['', 'Single', 'Double', 'Triple'][cleared];
  }
  if (backToBackBonus > 0) label = `Back-to-Back ${label}`;
  if (perfectClear) label = 'Perfect Clear';

  return {
    points: base + backToBackBonus + comboBonus + perfectClearBonus,
    combo: nextCombo,
    backToBack: nextBackToBack,
    label,
  };
}

export function dropInterval(level: number): number {
  const normalizedLevel = Math.max(0, Math.floor(level));
  const earlyLevelIntervalsMs = [
    800,
    717,
    633,
    550,
    467,
    383,
    300,
    217,
    133,
    100,
  ];

  if (normalizedLevel <= 9) return earlyLevelIntervalsMs[normalizedLevel];
  if (normalizedLevel <= 12) return 83;
  if (normalizedLevel <= 15) return 67;
  if (normalizedLevel <= 18) return 50;
  if (normalizedLevel <= 28) return 33;
  return 16;
}

export function levelForLines(startLevel: number, lines: number): number {
  const safeStartLevel = Math.max(0, Math.floor(startLevel));
  const safeLines = Math.max(0, Math.floor(lines));
  return Math.max(safeStartLevel, Math.floor(safeLines / 10));
}
