// One rAF loop per page, capped at `fps`: ProMotion screens tick rAF at 120 Hz, which doubles the
// canvas work for no visible gain. Hidden tabs pause rAF on their own.
export function frameLoop(fn, fps = 60) {
  const min = 1000 / fps - 2; let last = 0;
  const tick = (now) => { requestAnimationFrame(tick); if (now - last < min) return; last = now; fn(now); };
  requestAnimationFrame(tick);
}
