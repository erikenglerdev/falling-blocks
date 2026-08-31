export type GameControl =
  | 'left'
  | 'right'
  | 'softDrop'
  | 'rotateClockwise'
  | 'rotateCounterClockwise'
  | 'rotate180'
  | 'hardDrop'
  | 'hold'
  | 'pause';

interface KeyboardInput {
  key: string;
  code?: string;
}

const NUMBER_PAD_CONTROLS: Partial<Record<string, GameControl>> = {
  Numpad1: 'left',
  Numpad2: 'softDrop',
  Numpad3: 'right',
  Numpad5: 'rotateClockwise',
};

export function getGameControl({ key, code }: KeyboardInput): GameControl | null {
  if (code && NUMBER_PAD_CONTROLS[code]) return NUMBER_PAD_CONTROLS[code] ?? null;

  switch (key.toLowerCase()) {
    case 'arrowleft':
    case '1':
      return 'left';
    case 'arrowright':
    case '3':
      return 'right';
    case 'arrowdown':
    case '2':
      return 'softDrop';
    case 'arrowup':
    case '5':
    case 'x':
      return 'rotateClockwise';
    case 'y':
      return 'rotateCounterClockwise';
    case 'c':
      return 'rotate180';
    case ' ':
      return 'hardDrop';
    case 'v':
      return 'hold';
    case 'p':
    case 'escape':
      return 'pause';
    default:
      return null;
  }
}
