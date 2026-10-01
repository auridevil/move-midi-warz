# move-keymap

Turn an **Ableton Move** into a keyboard (and a bit of mouse) for browser games, on top of
[`movewire`](https://github.com/auridevil/movewire). Pads, step buttons, buttons and encoders become key actions; sinks decide
where the keys go. Zero dependencies.

```js
import { MoveKeymap, DomKeySink, JsDosSink, PRESETS } from 'move-keymap';

const km = new MoveKeymap(device, new DomKeySink(window), PRESETS.doom);   // device = a connected MoveDevice
// later, if the game exposes js-dos' CommandInterface:
km.setSink(new JsDosSink(ci));
```

## Mapping
```js
{
  pads:     { 25: 'ArrowUp', 0: { keys: 'ControlLeft', role: 'fire', label: 'Fire' }, 1: ['ShiftLeft', 'KeyW'] },
  steps:    { 0: 'Digit1' },                 // 16 step buttons
  buttons:  { play: 'Enter', back: 'Escape' },
  wheel:    { cw: 'ArrowRight', ccw: 'ArrowLeft', tapMs: 60 },   // relative controls tap a key per tick, holds merge
  encoders: { 0: { mouse: 'x', scale: 8 } },                      // or drive relative mouse motion
  hardHit:  { velocity: 105, keys: 'ShiftLeft' },                 // pads hit hard also hold these keys
}
```
Key names are tolerant: `'w'`, `'KeyW'`, `'ctrl'`, `'left'`, `'1'`, `','`. Roles colour the Move's LEDs
(`move` blue, `fire` red, `use` green, `run` orange, `menu` white, `weapon` yellow); a control goes white while pressed.

## Sinks
- `DomKeySink(target)` — synthetic `KeyboardEvent`s with `code`, `key` and legacy `keyCode` (`isTrusted` is false; fine for nearly all JS/WASM games on the same origin).
- `JsDosSink(ci)` — calls `ci.sendKeyEvent` with js-dos/GLFW key ids, plus relative mouse motion.
- `RecordingSink()` — for tests and UIs.

## Learn mode
`km.startLearn()` → press a control on the Move → `km.learnKey('KeyE', 'use')`. Or `km.assign({type:'pad', id: 7}, 'KeyE')` directly. `change` / `learn` / `learned` / `action` events keep a UI in sync.

## Presets
`PRESETS.doom` (DOS Doom: arrows, `,`/`.` strafe, Ctrl fire, Space use, Shift run, 1–7 weapons, wheel turns) and `PRESETS.retro` (arrows + Z/X).

## Test
```sh
npm test
```
