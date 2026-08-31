'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ChevronUp,
  CirclePause,
  Download,
  Moon,
  Pause,
  Play,
  RotateCw,
  Save,
  Sun,
  Trophy,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { getGameControl } from '@/lib/controls';
import {
  ARR_MS,
  BOARD_HEIGHT,
  BOARD_WIDTH,
  DAS_MS,
  HIDDEN_ROWS,
  LOCK_DELAY_MS,
  MAX_LOCK_RESETS,
  PIECE_TYPES,
  SOFT_DROP_INTERVAL_MS,
  type ActivePiece,
  type Board,
  type PieceType,
  attemptHalfTurn,
  attemptRotation,
  clearCompletedLines,
  collides,
  createEmptyBoard,
  createPiece,
  dropInterval,
  ensureQueue,
  getGhostY,
  getPieceCells,
  isBoardEmpty,
  isGrounded,
  isLockOut,
  levelForLines,
  mergePiece,
  movePiece,
  detectTSpin,
  placementScore,
} from '@/lib/game';

type GameStatus = 'ready' | 'playing' | 'paused' | 'saved' | 'over';
type StartLevel = 0 | 9;
type GameStartLevel = StartLevel | 1;
type Theme = 'light' | 'dark';

interface GameState {
  board: Board;
  active: ActivePiece | null;
  queue: PieceType[];
  hold: PieceType | null;
  canHold: boolean;
  score: number;
  lines: number;
  level: number;
  startLevel: GameStartLevel;
  status: GameStatus;
  runId: number;
  lastClear: number;
  clearedRows: number[];
  clearAnimationId: number;
  combo: number;
  backToBack: boolean;
  lastEvent: string;
  groundedAt: number | null;
  lockResets: number;
  lastFallAt: number;
  lastMoveWasRotation: boolean;
  lastKickIndex: number;
}

interface ScoreEntry {
  score: number;
  lines: number;
  level: number;
  date: string;
}

interface SavedSession {
  version: 1;
  savedAt: string;
  game: GameState;
}

interface DeferredInstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const SCORE_STORAGE_KEY = 'falling-blocks-scores-v1';
const THEME_STORAGE_KEY = 'falling-blocks-theme';
const SESSION_STORAGE_KEY = 'falling-blocks-active-game-v1';
const formatter = new Intl.NumberFormat('de-DE');
const savedAtFormatter = new Intl.DateTimeFormat('de-DE', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function initialGame(startLevel: StartLevel = 0): GameState {
  return {
    board: createEmptyBoard(),
    active: null,
    queue: [],
    hold: null,
    canHold: true,
    score: 0,
    lines: 0,
    level: startLevel,
    startLevel,
    status: 'ready',
    runId: 0,
    lastClear: 0,
    clearedRows: [],
    clearAnimationId: 0,
    combo: -1,
    backToBack: false,
    lastEvent: '',
    groundedAt: null,
    lockResets: 0,
    lastFallAt: 0,
    lastMoveWasRotation: false,
    lastKickIndex: 0,
  };
}

function isPieceType(value: unknown): value is PieceType {
  return PIECE_TYPES.includes(value as PieceType);
}

function createSavedSession(game: GameState): SavedSession {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    game: {
      ...game,
      status: 'saved',
      clearedRows: [],
    },
  };
}

function parseSavedSession(raw: string | null): SavedSession | null {
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as Partial<SavedSession>;
    const game = session.game as Partial<GameState> | undefined;
    const boardIsValid =
      Array.isArray(game?.board) &&
      game.board.length === BOARD_HEIGHT &&
      game.board.every(
        (row) =>
          Array.isArray(row) &&
          row.length === BOARD_WIDTH &&
          row.every((cell) => cell === null || isPieceType(cell)),
      );
    const activeIsValid =
      game?.active !== null &&
      typeof game?.active === 'object' &&
      isPieceType(game.active.type) &&
      Number.isFinite(game.active.x) &&
      Number.isFinite(game.active.y) &&
      Number.isFinite(game.active.rotation);
    const queueIsValid =
      Array.isArray(game?.queue) && game.queue.every(isPieceType);
    const numbersAreValid = [
      game?.score,
      game?.lines,
      game?.level,
      game?.runId,
      game?.combo,
      game?.lockResets,
    ].every((value) => typeof value === 'number' && Number.isFinite(value));

    if (
      session.version !== 1 ||
      typeof session.savedAt !== 'string' ||
      !game ||
      !boardIsValid ||
      !activeIsValid ||
      !queueIsValid ||
      !numbersAreValid ||
      (game.startLevel !== 0 && game.startLevel !== 1 && game.startLevel !== 9) ||
      (game.hold !== null && !isPieceType(game.hold))
    ) {
      return null;
    }

    return {
      version: 1,
      savedAt: session.savedAt,
      game: {
        ...(game as GameState),
        status: 'saved',
        clearedRows: [],
      },
    };
  } catch {
    return null;
  }
}

function formatSavedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'kürzlich' : savedAtFormatter.format(date);
}

function nextPiece(queue: PieceType[]) {
  const filled = ensureQueue(queue, 10);
  return {
    active: createPiece(filled[0]),
    queue: ensureQueue(filled.slice(1), 10),
  };
}

function lockActive(state: GameState, bonus = 0): GameState {
  if (!state.active) return state;
  const lockedOut = isLockOut(state.active);
  const tSpin = detectTSpin(
    state.board,
    state.active,
    state.lastMoveWasRotation,
    state.lastKickIndex,
  );
  const merged = mergePiece(state.board, state.active);
  const cleared = clearCompletedLines(merged);
  const totalLines = state.lines + cleared.cleared;
  const level = levelForLines(state.startLevel, totalLines);
  const scoring = placementScore({
    cleared: cleared.cleared,
    level: state.level + 1,
    tSpin,
    backToBack: state.backToBack,
    combo: state.combo,
    perfectClear: cleared.cleared > 0 && isBoardEmpty(cleared.board),
  });
  const upcoming = nextPiece(state.queue);
  const gameOver = lockedOut || collides(cleared.board, upcoming.active);

  return {
    ...state,
    board: cleared.board,
    active: upcoming.active,
    queue: upcoming.queue,
    canHold: true,
    score: state.score + bonus + scoring.points,
    lines: totalLines,
    level,
    status: gameOver ? 'over' : state.status,
    lastClear: cleared.cleared,
    clearedRows: cleared.clearedRows
      .map((row) => row - HIDDEN_ROWS)
      .filter((row) => row >= 0),
    clearAnimationId: cleared.cleared > 0
      ? state.clearAnimationId + 1
      : state.clearAnimationId,
    combo: scoring.combo,
    backToBack: scoring.backToBack,
    lastEvent: scoring.label,
    groundedAt: null,
    lockResets: 0,
    lastFallAt: Date.now(),
    lastMoveWasRotation: false,
    lastKickIndex: 0,
  };
}

function applyPlayerMove(
  state: GameState,
  active: ActivePiece,
  rotated = false,
  kickIndex = 0,
): GameState {
  const grounded = isGrounded(state.board, active);
  const canReset = state.groundedAt !== null && state.lockResets < MAX_LOCK_RESETS;
  return {
    ...state,
    active,
    groundedAt: grounded
      ? canReset || state.groundedAt === null
        ? Date.now()
        : state.groundedAt
      : null,
    lockResets: canReset ? state.lockResets + 1 : state.lockResets,
    lastMoveWasRotation: rotated,
    lastKickIndex: kickIndex,
  };
}

function MiniPiece({ type, label }: { type: PieceType | null; label: string }) {
  const cells = useMemo(() => {
    if (!type) return new Set<string>();
    const points = getPieceCells(createPiece(type));
    const minX = Math.min(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    return new Set(
      points.map((point) => `${point.x - minX}-${point.y - minY}`),
    );
  }, [type]);

  return (
    <div className="mini-board" aria-label={type ? `${label}: ${type}` : `${label}: leer`}>
      {Array.from({ length: 12 }, (_, index) => {
        const x = index % 4;
        const y = Math.floor(index / 4);
        const filled = type && cells.has(`${x}-${y}`);
        return (
          <span
            key={index}
            className={filled ? 'mini-cell is-filled' : 'mini-cell'}
            data-piece={filled ? type : undefined}
          />
        );
      })}
    </div>
  );
}

function StartLevelPicker({
  value,
  onChange,
}: {
  value: StartLevel;
  onChange: (level: StartLevel) => void;
}) {
  return (
    <div className="start-level-picker" role="radiogroup" aria-label="Startstufe auswählen">
      <Button
        type="button"
        variant="outline"
        className="start-level-option"
        aria-pressed={value === 0}
        onClick={() => onChange(0)}
      >
        <span>LEVEL 0</span>
        <strong>Ruhiger Einstieg</strong>
        <small>0,8 Sekunden pro Reihe. Level 1 beginnt nach 10 Linien.</small>
      </Button>
      <Button
        type="button"
        variant="outline"
        className="start-level-option"
        aria-pressed={value === 9}
        onClick={() => onChange(9)}
      >
        <span>LEVEL 9</span>
        <strong>Direkt auf Tempo</strong>
        <small>0,1 Sekunden pro Reihe. Level 10 beginnt nach 100 Linien.</small>
      </Button>
    </div>
  );
}

export default function Home() {
  const [theme, setTheme] = useState<Theme>('dark');
  const [game, setGame] = useState<GameState>(initialGame);
  const [selectedStartLevel, setSelectedStartLevel] = useState<StartLevel>(0);
  const [savedSession, setSavedSession] = useState<SavedSession | null>(null);
  const [scores, setScores] = useState<ScoreEntry[]>([]);
  const [installPrompt, setInstallPrompt] =
    useState<DeferredInstallPrompt | null>(null);
  const savedRuns = useRef(new Set<number>());
  const gameRef = useRef(game);

  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  useEffect(() => {
    const loadScores = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(SCORE_STORAGE_KEY);
        if (saved) setScores(JSON.parse(saved) as ScoreEntry[]);
        const storedSessionRaw = window.localStorage.getItem(SESSION_STORAGE_KEY);
        const storedSession = parseSavedSession(storedSessionRaw);
        if (storedSession) {
          setSavedSession(storedSession);
        } else if (storedSessionRaw) {
          window.localStorage.removeItem(SESSION_STORAGE_KEY);
        }
        const activeTheme = document.documentElement.dataset.theme;
        if (activeTheme === 'light' || activeTheme === 'dark') {
          setTheme(activeTheme);
          const themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
          if (themeMeta) {
            themeMeta.content = activeTheme === 'dark' ? '#090c15' : '#f3f5fb';
          }
        }
      } catch {
        setScores([]);
      }
    }, 0);

    if ('serviceWorker' in navigator) {
      if (process.env.NODE_ENV === 'production') {
        navigator.serviceWorker.register('/sw.js').catch(() => undefined);
      } else {
        navigator.serviceWorker
          .getRegistrations()
          .then((registrations) =>
            Promise.all(registrations.map((registration) => registration.unregister())),
          )
          .catch(() => undefined);
      }
    }

    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as DeferredInstallPrompt);
    };
    const installed = () => setInstallPrompt(null);
    window.addEventListener('beforeinstallprompt', capturePrompt);
    window.addEventListener('appinstalled', installed);
    return () => {
      window.clearTimeout(loadScores);
      window.removeEventListener('beforeinstallprompt', capturePrompt);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);

  useEffect(() => {
    const persistCurrentGame = () => {
      const current = gameRef.current;
      if (
        !current.active ||
        !['playing', 'paused'].includes(current.status)
      ) {
        return;
      }
      window.localStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify(createSavedSession(current)),
      );
    };

    const interval = window.setInterval(persistCurrentGame, 500);
    window.addEventListener('pagehide', persistCurrentGame);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('pagehide', persistCurrentGame);
    };
  }, []);

  useEffect(() => {
    if (game.status === 'over') {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
    }
    if (
      game.status !== 'over' ||
      game.score === 0 ||
      savedRuns.current.has(game.runId)
    ) {
      return;
    }
    savedRuns.current.add(game.runId);
    const entry: ScoreEntry = {
      score: game.score,
      lines: game.lines,
      level: game.level,
      date: new Date().toISOString(),
    };
    setScores((current) => {
      const next = [...current, entry]
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
      window.localStorage.setItem(SCORE_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, [game.level, game.lines, game.runId, game.score, game.status]);

  const startGame = useCallback(() => {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    setSavedSession(null);
    setGame((current) => {
      const upcoming = nextPiece([]);
      return {
        ...initialGame(selectedStartLevel),
        active: upcoming.active,
        queue: upcoming.queue,
        status: 'playing',
        runId: current.runId + 1,
        lastFallAt: Date.now(),
      };
    });
  }, [selectedStartLevel]);

  const tick = useCallback(() => {
    setGame((current) => {
      if (current.status !== 'playing' || !current.active) return current;
      const now = Date.now();
      if (
        current.groundedAt !== null &&
        now - current.groundedAt >= LOCK_DELAY_MS
      ) {
        return lockActive(current);
      }
      const gravityInterval = dropInterval(current.level);
      if (now - current.lastFallAt < gravityInterval) return current;
      const nextFallAt = current.lastFallAt + gravityInterval;

      const moved = movePiece(current.board, current.active, 0, 1);
      if (!moved) {
        return {
          ...current,
          groundedAt: current.groundedAt ?? now,
          lastFallAt: nextFallAt,
        };
      }
      return {
        ...current,
        active: moved,
        groundedAt: isGrounded(current.board, moved) ? now : null,
        lastFallAt: nextFallAt,
        lastClear: 0,
      };
    });
  }, []);

  const shift = useCallback((dx: -1 | 1) => {
    setGame((current) => {
      if (current.status !== 'playing' || !current.active) return current;
      const moved = movePiece(current.board, current.active, dx, 0);
      return moved ? applyPlayerMove(current, moved) : current;
    });
  }, []);

  const softDrop = useCallback(() => {
    setGame((current) => {
      if (current.status !== 'playing' || !current.active) return current;
      const moved = movePiece(current.board, current.active, 0, 1);
      return moved
        ? {
            ...applyPlayerMove(current, moved),
            score: current.score + 1,
            lastClear: 0,
            lastFallAt: Date.now(),
          }
        : {
            ...current,
            groundedAt: current.groundedAt ?? Date.now(),
          };
    });
  }, []);

  const hardDrop = useCallback(() => {
    setGame((current) => {
      if (current.status !== 'playing' || !current.active) return current;
      const landingY = getGhostY(current.board, current.active);
      const distance = landingY - current.active.y;
      return lockActive(
        { ...current, active: { ...current.active, y: landingY } },
        distance * 2,
      );
    });
  }, []);

  const rotate = useCallback((direction: 1 | -1 = 1) => {
    setGame((current) => {
      if (current.status !== 'playing' || !current.active) return current;
      const rotation = attemptRotation(current.board, current.active, direction);
      return rotation
        ? applyPlayerMove(current, rotation.piece, true, rotation.kickIndex)
        : current;
    });
  }, []);

  const rotateHalfTurn = useCallback(() => {
    setGame((current) => {
      if (current.status !== 'playing' || !current.active) return current;
      const rotation = attemptHalfTurn(current.board, current.active);
      return rotation
        ? applyPlayerMove(current, rotation.piece, true, rotation.kickIndex)
        : current;
    });
  }, []);

  const holdPiece = useCallback(() => {
    setGame((current) => {
      if (
        current.status !== 'playing' ||
        !current.active ||
        !current.canHold
      ) {
        return current;
      }

      if (current.hold) {
        const active = createPiece(current.hold);
        return {
          ...current,
          active,
          hold: current.active.type,
          canHold: false,
          status: collides(current.board, active) ? 'over' : current.status,
          groundedAt: null,
          lockResets: 0,
          lastFallAt: Date.now(),
          lastMoveWasRotation: false,
          lastKickIndex: 0,
        };
      }

      const upcoming = nextPiece(current.queue);
      return {
        ...current,
        active: upcoming.active,
        queue: upcoming.queue,
        hold: current.active.type,
        canHold: false,
        groundedAt: null,
        lockResets: 0,
        lastFallAt: Date.now(),
        lastMoveWasRotation: false,
        lastKickIndex: 0,
      };
    });
  }, []);

  const togglePause = useCallback(() => {
    setGame((current) => {
      if (current.status === 'playing') return { ...current, status: 'paused' };
      if (current.status === 'paused') {
        const now = Date.now();
        return {
          ...current,
          status: 'playing',
          lastFallAt: now,
          groundedAt: current.groundedAt === null ? null : now,
        };
      }
      return current;
    });
  }, []);

  const saveForLater = useCallback(() => {
    if (!game.active || !['playing', 'paused'].includes(game.status)) return;
    const session = createSavedSession(game);
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    setSavedSession(session);
    setGame(session.game);
  }, [game]);

  const resumeCurrentGame = useCallback(() => {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    setSavedSession(null);
    setGame((current) => {
      if (current.status !== 'saved') return current;
      const now = Date.now();
      return {
        ...current,
        status: 'playing',
        lastFallAt: now,
        groundedAt: current.groundedAt === null ? null : now,
      };
    });
  }, []);

  const resumeSavedSession = useCallback(() => {
    if (!savedSession) return;
    const now = Date.now();
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    setSelectedStartLevel(savedSession.game.startLevel === 9 ? 9 : 0);
    setGame({
      ...savedSession.game,
      status: 'playing',
      clearedRows: [],
      lastFallAt: now,
      groundedAt: savedSession.game.groundedAt === null ? null : now,
    });
    setSavedSession(null);
  }, [savedSession]);

  useEffect(() => {
    if (game.status !== 'playing') return undefined;
    let frameId = 0;
    const runFrame = () => {
      tick();
      frameId = window.requestAnimationFrame(runFrame);
    };
    frameId = window.requestAnimationFrame(runFrame);
    return () => window.cancelAnimationFrame(frameId);
  }, [game.status, tick]);

  useEffect(() => {
    if (game.clearedRows.length === 0) return undefined;
    const animationId = game.clearAnimationId;
    const timer = window.setTimeout(() => {
      setGame((current) =>
        current.clearAnimationId === animationId
          ? { ...current, clearedRows: [] }
          : current,
      );
    }, 720);
    return () => window.clearTimeout(timer);
  }, [game.clearAnimationId, game.clearedRows.length]);

  useEffect(() => {
    let horizontalDelay: number | null = null;
    let horizontalRepeat: number | null = null;
    let softDropRepeat: number | null = null;

    const stopHorizontal = () => {
      if (horizontalDelay !== null) window.clearTimeout(horizontalDelay);
      if (horizontalRepeat !== null) window.clearInterval(horizontalRepeat);
      horizontalDelay = null;
      horizontalRepeat = null;
    };

    const startHorizontal = (direction: -1 | 1) => {
      stopHorizontal();
      shift(direction);
      horizontalDelay = window.setTimeout(() => {
        horizontalRepeat = window.setInterval(() => shift(direction), ARR_MS);
      }, DAS_MS);
    };

    const stopSoftDrop = () => {
      if (softDropRepeat !== null) window.clearInterval(softDropRepeat);
      softDropRepeat = null;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      if (game.status !== 'playing' && event.target instanceof HTMLButtonElement) return;
      const control = getGameControl(event);
      if (control || event.key === 'Enter') event.preventDefault();

      if ((game.status === 'ready' || game.status === 'over') && ['Enter', ' '].includes(event.key)) {
        startGame();
        return;
      }
      if (game.status === 'saved' && ['Enter', ' '].includes(event.key)) {
        resumeCurrentGame();
        return;
      }
      if (control === 'left' && !event.repeat) startHorizontal(-1);
      if (control === 'right' && !event.repeat) startHorizontal(1);
      if (control === 'softDrop' && !event.repeat) {
        softDrop();
        stopSoftDrop();
        softDropRepeat = window.setInterval(softDrop, SOFT_DROP_INTERVAL_MS);
      }
      if (control === 'rotateClockwise') rotate(1);
      if (control === 'rotateCounterClockwise') rotate(-1);
      if (control === 'rotate180') rotateHalfTurn();
      if (control === 'hardDrop') hardDrop();
      if (control === 'hold') holdPiece();
      if (control === 'pause') togglePause();
    };

    const onKeyUp = (event: KeyboardEvent) => {
      const control = getGameControl(event);
      if (control === 'left' || control === 'right') stopHorizontal();
      if (control === 'softDrop') stopSoftDrop();
    };

    const pauseWhenHidden = () => {
      if (document.hidden) {
        setGame((current) =>
          current.status === 'playing'
            ? { ...current, status: 'paused' }
            : current,
        );
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    document.addEventListener('visibilitychange', pauseWhenHidden);
    return () => {
      stopHorizontal();
      stopSoftDrop();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('visibilitychange', pauseWhenHidden);
    };
  }, [game.status, hardDrop, holdPiece, resumeCurrentGame, rotate, rotateHalfTurn, shift, softDrop, startGame, togglePause]);

  const visualBoard = useMemo(() => {
    const cells = game.board.map((row) =>
      row.map((type) => ({ type, ghost: false })),
    );
    if (!game.active) return cells.slice(HIDDEN_ROWS);

    const ghostY = getGhostY(game.board, game.active);
    for (const point of getPieceCells({ ...game.active, y: ghostY })) {
      if (point.y >= 0 && !cells[point.y][point.x].type) {
        cells[point.y][point.x] = { type: game.active.type, ghost: true };
      }
    }
    for (const point of getPieceCells(game.active)) {
      if (point.y >= 0) {
        cells[point.y][point.x] = { type: game.active.type, ghost: false };
      }
    }
    return cells.slice(HIDDEN_ROWS);
  }, [game.active, game.board]);

  const highScore = Math.max(scores[0]?.score ?? 0, game.score);

  async function installApp() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  function toggleTheme() {
    const nextTheme: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    const themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (themeMeta) themeMeta.content = nextTheme === 'dark' ? '#090c15' : '#f3f5fb';
  }

  return (
    <main className="game-shell">
      <header className="game-header">
        <div className="game-brand">
          <div className="brand-mark small" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
          <div>
            <p className="eyebrow">FALLING BLOCKS</p>
            <h1>Bleib im Flow.</h1>
          </div>
        </div>
        <div className="header-actions">
          <Button
            variant="outline"
            className="header-text-button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Light Mode aktivieren' : 'Dark Mode aktivieren'}
          >
            {theme === 'dark' ? <Sun /> : <Moon />}
            <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
          </Button>
          {installPrompt && (
            <Button variant="outline" onClick={installApp}>
              <Download aria-hidden="true" /> Installieren
            </Button>
          )}
          {(game.status === 'playing' || game.status === 'paused') && (
            <Button
              variant="outline"
              className="save-game-button"
              onClick={saveForLater}
              aria-label="Spiel speichern und später fortsetzen"
            >
              <Save aria-hidden="true" /> <span>Für später</span>
            </Button>
          )}
          {(game.status === 'playing' || game.status === 'paused') && (
            <Button
              variant="outline"
              className="header-text-button"
              onClick={togglePause}
              aria-label={game.status === 'paused' ? 'Fortsetzen' : 'Pausieren'}
            >
              {game.status === 'paused' ? <Play /> : <Pause />}
              <span>{game.status === 'paused' ? 'Fortsetzen' : 'Pausieren'}</span>
            </Button>
          )}
        </div>
      </header>

      <section className="game-layout" aria-label="Falling Blocks Spiel">
        <aside className="side-column left-column">
          <section className="panel hold-panel">
            <div className="panel-heading">
              <span>HALTEN</span>
              <kbd>V</kbd>
            </div>
            <MiniPiece type={game.hold} label="Gehaltener Stein" />
          </section>

          <section className="panel controls-panel" aria-labelledby="controls-title">
            <p id="controls-title" className="panel-label">STEUERUNG</p>
            <ul className="controls-list">
              <li>
                <span>Nach links</span>
                <span className="control-keys"><kbd>←</kbd><em>oder</em><kbd>1</kbd></span>
              </li>
              <li>
                <span>Nach rechts</span>
                <span className="control-keys"><kbd>→</kbd><em>oder</em><kbd>3</kbd></span>
              </li>
              <li>
                <span>Schneller fallen</span>
                <span className="control-keys"><kbd>↓</kbd><em>oder</em><kbd>2</kbd></span>
              </li>
              <li>
                <span>Rechts drehen</span>
                <span className="control-keys"><kbd>↑</kbd><kbd>5</kbd><kbd>X</kbd></span>
              </li>
              <li>
                <span>Weitere Drehungen</span>
                <span className="control-keys">
                  <kbd>Y</kbd><em>links</em><kbd>C</kbd><em>180°</em>
                </span>
              </li>
              <li>
                <span>Sofort ablegen</span>
                <span className="control-keys"><kbd className="wide-key">Leertaste</kbd></span>
              </li>
              <li>
                <span>Stein halten</span>
                <span className="control-keys"><kbd>V</kbd></span>
              </li>
              <li>
                <span>Pause</span>
                <span className="control-keys"><kbd>P</kbd><em>oder</em><kbd>Esc</kbd></span>
              </li>
            </ul>
          </section>
        </aside>

        <div className="play-column">
          <div className="board-wrap">
            <figure
              className="board"
              aria-label={`Blockspielfeld. ${game.lines} Linien, Level ${game.level}, ${game.score} Punkte.`}
            >
              {visualBoard.flat().map((cell, index) => (
                <span
                  key={index}
                  className={`board-cell${cell.type ? ' is-filled' : ''}${cell.ghost ? ' is-ghost' : ''}`}
                  data-piece={cell.type ?? undefined}
                />
              ))}
              {game.clearedRows.length > 0 && (
                <span className="line-clear-layer" aria-hidden="true">
                  {game.clearedRows.map((row) => (
                    <span
                      key={`${game.clearAnimationId}-${row}`}
                      className="line-clear-flash"
                      style={{ gridRow: row + 1 }}
                    />
                  ))}
                </span>
              )}
            </figure>

            {game.status === 'playing' && game.lastEvent && (
              <div key={game.clearAnimationId} className="clear-event" aria-live="polite">
                <strong>{game.lastEvent}</strong>
                {game.combo > 0 && <span>{game.combo + 1}× Combo</span>}
              </div>
            )}

            {game.status !== 'playing' && (
              <div className="game-overlay">
                {game.status === 'ready' && (
                  <>
                    <div className="overlay-icon"><Play /></div>
                    <p>Wähle deine Startstufe</p>
                    <span>Du kannst ruhig einsteigen oder direkt ins schnelle Spiel springen.</span>
                    {savedSession && (
                      <section className="saved-session-card" aria-label="Gespeichertes Spiel">
                        <div>
                          <strong>Gespeichertes Spiel</strong>
                          <small>
                            Level {savedSession.game.level} · {savedSession.game.lines} Linien ·{' '}
                            {formatter.format(savedSession.game.score)} Punkte
                          </small>
                          <small>Gespeichert: {formatSavedAt(savedSession.savedAt)}</small>
                        </div>
                        <Button onClick={resumeSavedSession}>Fortsetzen</Button>
                      </section>
                    )}
                    <StartLevelPicker
                      value={selectedStartLevel}
                      onChange={setSelectedStartLevel}
                    />
                    <p className="auto-save-note">
                      <Save aria-hidden="true" /> Deine laufende Runde wird automatisch lokal
                      gesichert und kann nach dem Schließen des Browsers fortgesetzt werden.
                    </p>
                    <Button onClick={startGame}>Neues Spiel starten</Button>
                  </>
                )}
                {game.status === 'paused' && (
                  <>
                    <div className="overlay-icon"><CirclePause /></div>
                    <p>Kurze Pause.</p>
                    <span>Für eine kurze Unterbrechung. Zum Schließen nutze „Für später“.</span>
                    <div className="overlay-actions">
                      <Button onClick={togglePause}>Fortsetzen</Button>
                      <Button variant="outline" onClick={saveForLater}>
                        <Save aria-hidden="true" /> Für später speichern
                      </Button>
                    </div>
                  </>
                )}
                {game.status === 'saved' && (
                  <>
                    <div className="overlay-icon"><Save /></div>
                    <p>Für später gespeichert.</p>
                    <span>
                      Du kannst den Browser jetzt schließen. Diese Runde bleibt lokal auf diesem
                      Gerät erhalten.
                    </span>
                    <Button onClick={resumeCurrentGame}>Jetzt fortsetzen</Button>
                  </>
                )}
                {game.status === 'over' && (
                  <>
                    <div className="overlay-icon trophy"><Trophy /></div>
                    <p>Runde beendet</p>
                    <span>{formatter.format(game.score)} Punkte</span>
                    <StartLevelPicker
                      value={selectedStartLevel}
                      onChange={setSelectedStartLevel}
                    />
                    <Button onClick={startGame}>Nochmal spielen</Button>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="touch-controls" aria-label="Touch-Steuerung">
            <Button variant="outline" size="icon-lg" onClick={() => shift(-1)} aria-label="Nach links">
              <ArrowLeft />
            </Button>
            <Button variant="outline" size="icon-lg" onClick={() => rotate(1)} aria-label="Drehen">
              <RotateCw />
            </Button>
            <Button variant="outline" size="icon-lg" onClick={() => shift(1)} aria-label="Nach rechts">
              <ArrowRight />
            </Button>
            <Button variant="outline" size="icon-lg" onClick={softDrop} aria-label="Schneller nach unten">
              <ArrowDown />
            </Button>
            <Button variant="outline" size="icon-lg" onClick={hardDrop} aria-label="Sofort ablegen">
              <ChevronUp className="hard-drop-icon" />
            </Button>
            <Button variant="outline" className="hold-control" onClick={holdPiece} aria-label="Stein halten">
              HALTEN
            </Button>
          </div>

        </div>

        <aside className="side-column right-column">
          <section className="panel next-panel">
            <p className="panel-label">ALS NÄCHSTES</p>
            <div className="next-list">
              {game.queue.slice(0, 3).map((type, index) => (
                <MiniPiece key={`${type}-${index}`} type={type} label={`Vorschau ${index + 1}`} />
              ))}
            </div>
          </section>

          <section className="panel score-panel">
            <p className="panel-label">PUNKTE</p>
            <strong>{formatter.format(game.score)}</strong>
            <dl>
              <div>
                <dt>Highscore</dt>
                <dd>{formatter.format(highScore)}</dd>
              </div>
              <div>
                <dt>Level</dt>
                <dd>{game.level}</dd>
              </div>
              <div>
                <dt>Linien</dt>
                <dd>{game.lines}</dd>
              </div>
            </dl>
          </section>

          <section className="panel leaderboard-panel">
            <div className="panel-heading">
              <span>LOKALE BESTENLISTE</span>
              <Trophy aria-hidden="true" />
            </div>
            {scores.length === 0 ? (
              <p className="empty-scores">Dein erster Highscore wartet.</p>
            ) : (
              <ol>
                {scores.map((entry, index) => (
                  <li key={`${entry.date}-${entry.score}`}>
                    <span>{index + 1}</span>
                    <strong>{formatter.format(entry.score)}</strong>
                    <small>{entry.lines} Linien</small>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </aside>
      </section>

      <div className="sr-only" aria-live="polite">
        {game.lastEvent ||
          (game.lastClear > 0
            ? `${game.lastClear} ${game.lastClear === 1 ? 'Linie' : 'Linien'} entfernt.`
            : '')}
      </div>
    </main>
  );
}
