// Ready-made mappings. Pad index 0 = bottom-left, row = index >> 3, col = index & 7 (left 4×4 block = cols 0–3).
const P = (row, col) => row * 8 + col;
const A = (keys, role, label) => ({ keys, role, label });

export const DOOM = {
  name: 'Doom (DOS, keyboard)', version: 2,
  pads: {
    // left block: movement cluster like a D-pad, use/strafe underneath
    [P(3, 0)]: A('Escape', 'menu', 'Menu'),      [P(3, 1)]: A('ArrowUp', 'move', 'Forward'),   [P(3, 2)]: A('Enter', 'menu', 'Enter'),      [P(3, 3)]: A('Tab', 'map', 'Map'),
    [P(2, 0)]: A('ArrowLeft', 'move', 'Turn L'), [P(2, 1)]: A('ArrowDown', 'move', 'Back'),    [P(2, 2)]: A('ArrowRight', 'move', 'Turn R'), [P(2, 3)]: A('ShiftLeft', 'run', 'Run'),
    [P(1, 0)]: A('Comma', 'strafe', 'Strafe L'), [P(1, 1)]: A('Space', 'use', 'Use'),          [P(1, 2)]: A('Period', 'strafe', 'Strafe R'), [P(1, 3)]: A('KeyY', 'menu', 'Yes'),
    [P(0, 0)]: A('ControlLeft', 'fire', 'Fire'), [P(0, 1)]: A('ControlLeft', 'fire', 'Fire'),  [P(0, 2)]: A('Space', 'use', 'Use'),          [P(0, 3)]: A('KeyN', 'menu', 'No'),
    // right block: big fire area + weapons
    [P(0, 4)]: A('ControlLeft', 'fire', 'Fire'), [P(0, 5)]: A('ControlLeft', 'fire', 'Fire'),  [P(0, 6)]: A('ControlLeft', 'fire', 'Fire'),  [P(0, 7)]: A('ControlLeft', 'fire', 'Fire'),
    [P(1, 4)]: A('ControlLeft', 'fire', 'Fire'), [P(1, 5)]: A('ControlLeft', 'fire', 'Fire'),  [P(1, 6)]: A('ControlLeft', 'fire', 'Fire'),  [P(1, 7)]: A('ControlLeft', 'fire', 'Fire'),
    [P(2, 4)]: A('Digit1', 'weapon', 'Fist'),    [P(2, 5)]: A('Digit2', 'weapon', 'Pistol'),   [P(2, 6)]: A('Digit3', 'weapon', 'Shotgun'),  [P(2, 7)]: A('Digit4', 'weapon', 'Chaingun'),
    [P(3, 4)]: A('Digit5', 'weapon', 'Rocket'),  [P(3, 5)]: A('Digit6', 'weapon', 'Plasma'),   [P(3, 6)]: A('Digit7', 'weapon', 'BFG'),      [P(3, 7)]: A('F1', 'other', 'Help'),
  },
  steps: { 0: A('Digit1', 'weapon', '1'), 1: A('Digit2', 'weapon', '2'), 2: A('Digit3', 'weapon', '3'), 3: A('Digit4', 'weapon', '4'), 4: A('Digit5', 'weapon', '5'), 5: A('Digit6', 'weapon', '6'), 6: A('Digit7', 'weapon', '7'),
           12: A('F6', 'other', 'Quicksave'), 13: A('F9', 'other', 'Quickload'), 14: A('Minus', 'other', 'Screen −'), 15: A('Equal', 'other', 'Screen +') },
  buttons: { play: A('Enter', 'menu', 'Enter'), back: A('Escape', 'menu', 'Menu'), shift: A('ShiftLeft', 'run', 'Run'), left: A('ArrowLeft', 'move', 'Turn L'), right: A('ArrowRight', 'move', 'Turn R'),
             undo: A('KeyY', 'menu', 'Yes'), delete: A('KeyN', 'menu', 'No'), mute: A('Tab', 'map', 'Map'), capture: A('F6', 'other', 'Quicksave'), loop: A('F9', 'other', 'Quickload'), minus: A('Minus', 'other'), plus: A('Equal', 'other') },
  wheel: { cw: A('ArrowRight', 'move', 'Turn R'), ccw: A('ArrowLeft', 'move', 'Turn L'), tapMs: 60 },
  encoders: { 0: { cw: A('ArrowRight', 'move'), ccw: A('ArrowLeft', 'move'), tapMs: 60 }, 6: { cw: A('Equal', 'other', 'Screen +'), ccw: A('Minus', 'other', 'Screen −'), tapMs: 40 }, 7: { cw: A('Period', 'strafe'), ccw: A('Comma', 'strafe'), tapMs: 60 } },
  hardHit: { velocity: 105, keys: 'ShiftLeft' },
};

export const RETRO = {
  name: 'Retro pad (arrows + Z/X, Enter/Shift)',
  pads: {
    [P(2, 1)]: A('ArrowUp', 'move', '↑'), [P(1, 0)]: A('ArrowLeft', 'move', '←'), [P(1, 1)]: A('ArrowDown', 'move', '↓'), [P(1, 2)]: A('ArrowRight', 'move', '→'),
    [P(1, 5)]: A('KeyZ', 'fire', 'A'), [P(1, 6)]: A('KeyX', 'use', 'B'), [P(2, 5)]: A('KeyA', 'weapon', 'X'), [P(2, 6)]: A('KeyS', 'weapon', 'Y'),
    [P(0, 3)]: A('ShiftLeft', 'menu', 'Select'), [P(0, 4)]: A('Enter', 'menu', 'Start'),
  },
  buttons: { play: A('Enter', 'menu'), back: A('Escape', 'menu') },
  wheel: { cw: A('ArrowRight', 'move'), ccw: A('ArrowLeft', 'move'), tapMs: 60 },
};

export const PRESETS = { doom: DOOM, retro: RETRO };
