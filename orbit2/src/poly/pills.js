// RD-7 the pills: what is on, in one place (DECISION §2, Greta's "modes as pills", Nils's state table). Pure: the app
// reads its state into a snapshot, this says which pills are on, their words and which ones fold into "+N more".
// A pill appears when its mode turns on and goes when it turns off; it is announced once (the region is role=status),
// so its words never carry a counter that moves with the clock (no beats, no bars to go, no external bpm): the jam's
// beats live on the jam word and the canvas, the countdown on the generative arc (RD-8).

/** The fixed order (DECISION RD-7; the Move pill heads the column on its own, beside "?"). */
export const PILL_ORDER = ['rec', 'chain', 'solo', 'evolve', 'dice', 'clock', 'welcome', 'quest', 'jam'];
/** At most this many are drawn; the rest fold into "+N more ▾" (1280×720 keeps the sheet ≥ 340 px). */
export const PILL_MAX = 4;

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/**
 * A pill's words for a state snapshot, or null when it is off. s = {
 *   rec: { armed, knobs }, chain: { chain: [slot index], pending, switchAt, mutes }, solo: [lane names],
 *   evolve: { on, every }, dice: { locked, seed, repeat }, clock: { follow, inName }, welcome: bool,
 *   quest: { n, of, title } | null, jam: { state, bars } }
 */
export function pillText(k, s) {
  switch (k) {
    case 'rec': return s.rec?.armed ? `● rec armed${s.rec.knobs && s.rec.knobs !== 'off' ? ` · ${s.rec.knobs}` : ''}` : null;
    case 'chain': {
      const c = s.chain; if (!c) return null;
      if (c.chain?.length > 1) return `chain ${c.chain.map(i => i + 1).join(' → ')}`;   // the slot it is on moves with the clock: not said
      const at = c.switchAt === 'now' ? 'next tick' : c.switchAt === 'cycle' ? 'next cycle' : 'next bar';
      const parts = [c.pending >= 0 ? `slot ${c.pending + 1}` : '', c.mutes > 0 ? plural(c.mutes, 'mute') : ''].filter(Boolean);
      return parts.length ? `${parts.join(' · ')} · ${c.pending >= 0 ? at : 'next bar'}` : null;
    }
    case 'solo': return s.solo?.length ? `solo · ${s.solo.join(', ')}` : null;
    case 'evolve': return s.evolve?.on ? `evolve · every ${plural(s.evolve.every, 'bar')}` : null;
    case 'dice': return s.dice?.locked ? `dice ${s.dice.seed}${s.dice.repeat > 1 ? ` · repeat ${s.dice.repeat}` : ''}` : null;
    case 'clock': return s.clock?.follow && s.clock.follow !== 'off' && s.clock.inName ? `clock · ${s.clock.inName}` : null;
    case 'welcome': return s.welcome ? 'welcome back · play' : null;
    case 'quest': return s.quest ? `quest ${s.quest.n} of ${s.quest.of} · ${s.quest.title}` : null;
    case 'jam': {
      const st = s.jam?.state;
      return st === 'armed' ? '● jam · next bar' : st === 'rec' ? '● jam · recording' : st === 'finishing' ? '◌ jam · closing on the bar' : st === 'done' ? `take ready · ${plural(s.jam.bars || 0, 'bar')}` : null;
    }
    default: return null;
  }
}

/** The pills on now: [{ k, text }] in the fixed order. */
export const pillsOn = (s) => PILL_ORDER.map(k => ({ k, text: pillText(k, s) })).filter(p => p.text != null);

/** Which of the pills on (keys, any order) are drawn and which fold: { shown, folded, more } in the fixed order. */
export function pillLayout(on, max = PILL_MAX) {
  const list = PILL_ORDER.filter(k => on.includes(k));
  return list.length <= max ? { shown: list, folded: [], more: 0 } : { shown: list.slice(0, max), folded: list.slice(max), more: list.length - max };
}

/** Which pills a × turns off (the jam's take has download / discard instead; a waiting slot or mute just lands). */
export const pillOff = (k, s) => (k === 'chain' ? (s.chain?.chain?.length || 0) > 1 : k !== 'jam');
