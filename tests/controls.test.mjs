import assert from 'node:assert/strict';
import test from 'node:test';

import { getGameControl } from '../lib/controls.ts';

test('maps arrows and matching number keys to the same movement controls', () => {
  const pairs = [
    ['ArrowLeft', '1', 'left'],
    ['ArrowRight', '3', 'right'],
    ['ArrowDown', '2', 'softDrop'],
    ['ArrowUp', '5', 'rotateClockwise'],
  ];

  for (const [arrow, number, control] of pairs) {
    assert.equal(getGameControl({ key: arrow }), control);
    assert.equal(getGameControl({ key: number }), control);
  }
});

test('supports the requested controls on the number pad independent of Num Lock', () => {
  assert.equal(getGameControl({ key: 'End', code: 'Numpad1' }), 'left');
  assert.equal(getGameControl({ key: 'ArrowDown', code: 'Numpad2' }), 'softDrop');
  assert.equal(getGameControl({ key: 'PageDown', code: 'Numpad3' }), 'right');
  assert.equal(getGameControl({ key: 'Clear', code: 'Numpad5' }), 'rotateClockwise');
});

test('maps the action controls to their configured keys', () => {
  assert.equal(getGameControl({ key: 'x' }), 'rotateClockwise');
  assert.equal(getGameControl({ key: 'Y' }), 'rotateCounterClockwise');
  assert.equal(getGameControl({ key: 'C' }), 'rotate180');
  assert.equal(getGameControl({ key: ' ' }), 'hardDrop');
  assert.equal(getGameControl({ key: 'V' }), 'hold');
  assert.equal(getGameControl({ key: 'Escape' }), 'pause');
  assert.equal(getGameControl({ key: 'z' }), null);
  assert.equal(getGameControl({ key: 'a' }), null);
});
