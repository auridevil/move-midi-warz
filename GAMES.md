# Games for the Move — ideas list

Pad‑native games: the 4×8 RGB pads are the screen, the browser is the scoreboard. Mechanics are public domain or
MIT‑licensed originals; everything is re‑implemented with our own code and sounds.

## Perfect fits for a 4×8 grid
| Game | Fit | Effort | Notes |
|---|---|---|---|
| **MIDI Warz · rhythm battle** | ★★★ | 1–2 days | Player A plays a one‑bar pattern, B echoes it in time and dynamics, graded by the drill engine. Rounds speed up; loser's half goes red. Flagship, original. |
| **2048** | ★★★ | hours | Left 4×4 block is the board, tile value = colour, knob or 4 pads to slide. MIT original. |
| **Lights Out** ✅ | ★★★ | done | `lights.html`: 4×4 or 4×8, levels, par, hint, undo, best in localStorage. |
| **Echo (Simon)** | ★★★ | 1 h | Move plays a sequence with the synth kit, you repeat it; knob = speed. Doubles as reflex training. |
| **Whack‑a‑mole** | ★★☆ | 1 h | Random pads light, hit fast, velocity bonus. Close to the note‑hunt drill. |
| **Memory pairs** | ★★☆ | 2 h | 16 pairs under 32 pads, colours as symbols. |
| **Minesweeper 4×8** | ★★☆ | 3 h | Numbers as colour intensity, Shift+pad flags. |
| **Snake** | ★★☆ | ½ day | Wheel steers; tight on 4 rows but fun. |
| **Falling blocks** | ★☆☆ | ½ day | Grid used sideways: 4 wide × 8 tall. Quirky. |
| **Breakout / Pong** | ★☆☆ | ½ day | Wheel = paddle on the bottom row. Crude, funny. |

## Two players, one Move
| Game | Notes |
|---|---|
| **Battleship** | Each player owns a 4×4 half, step buttons pick the shot, track buttons pass the turn. |
| **Rhythm battle** | see above |

## Uses every control
| Game | Notes |
|---|---|
| **Bop‑It style** | "hit / twist / press / spin" with rising tempo. Wants prompts on the Move's display → needs the display SysEx protocol (not extracted yet). |

## Browser games driven by the Move (keymap package)
Doom (done, js‑dos), Quake (WebQuake), Wolfenstein 3D, DOS classics via js‑dos, NES/SNES via EmulatorJS.

## Not worth it on this grid
Chess/checkers, Connect Four (needs 6 rows), platformers, anything text‑heavy.

## Order
1. Rhythm battle  2. 2048  3. Lights Out  → then a "Games" card in the launcher.
