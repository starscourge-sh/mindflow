/**
 * Small sounds for the things you do, synthesised on the spot the way
 * sensory-ui does it: no files, no latency, a few lines of Web Audio. A click
 * that sounds feels faster than one that does not, even with the same pixels.
 *
 * Each cue is a short run of notes on a soft triangle wave with a fast attack
 * and an exponential tail, quiet enough to sit under music. The Sounds setting
 * turns them all off. Not tied to reduced motion: a sound is not motion.
 */
let context: AudioContext | null = null
let enabled = true

/** The Sounds setting. */
export const soundOn = (on: boolean): void => {
  enabled = on
}

type Note = [frequency: number, delay: number, length?: number, level?: number]

const CUES = {
  // Moving over a row: the faintest tick, so a list feels like it has detents.
  tick: [[2400, 0, 0.022, 0.018]],
  // A light tick: switching a tab, moving to a section, opening an item.
  tap: [[1320, 0, 0.05]],
  // A capture sent: a quick rising pair, the "got it".
  send: [[587, 0, 0.12], [880, 0.06, 0.18]],
  // Done: a rising third, the small ta-da of a ticked box.
  done: [[660, 0, 0.14], [990, 0.07, 0.22]],
  // Promote: one bright, ringing note, something kept.
  promote: [[880, 0, 0.1], [1320, 0.05, 0.3]],
  // Let go: a falling pair, quieter.
  away: [[440, 0, 0.12], [330, 0.06, 0.18]],
  // A hint arrives: two soft bells, rare enough to be noticed.
  hint: [[1046, 0, 0.25], [1568, 0.09, 0.35]],
  // Reveal an answer in review.
  reveal: [[740, 0, 0.12]],
  // The four grades: the further from "again", the higher.
  again: [[311, 0, 0.18]],
  hard: [[440, 0, 0.14]],
  good: [[587, 0, 0.14]],
  easy: [[784, 0, 0.1], [1175, 0.05, 0.2]]
} satisfies Record<string, Note[]>

export function chime(cue: keyof typeof CUES): void {
  if (!enabled) return
  context ??= new AudioContext()
  // A context made before any click starts suspended; resuming is free after.
  if (context.state === 'suspended') void context.resume()
  const start = context.currentTime
  for (const [frequency, delay, length = 0.18, peak = 0.07] of CUES[cue] as Note[]) {
    const at = start + delay
    const tone = context.createOscillator()
    const level = context.createGain()
    tone.type = 'triangle'
    tone.frequency.value = frequency
    level.gain.setValueAtTime(0, at)
    level.gain.linearRampToValueAtTime(peak, at + 0.004)
    level.gain.exponentialRampToValueAtTime(0.0001, at + length)
    tone.connect(level).connect(context.destination)
    tone.start(at)
    tone.stop(at + length + 0.02)
  }
}

let lastTick = 0
/**
 * The hover tick, as sensory-ui does it on list items: one per row the pointer
 * crosses, held to one every 40ms so a fast sweep is a purr, not a rattle.
 */
export function tick(): void {
  const now = performance.now()
  if (now - lastTick < 40) return
  lastTick = now
  chime('tick')
}

/**
 * The tick everywhere, from two listeners on the whole page rather than one
 * per list: once each time the pointer arrives on something you can press,
 * and once for every 40 or so pixels any scrolling area travels, like the
 * detents of a wheel. Installed once per window.
 */
export function installTicks(): () => void {
  let over: Element | null = null
  const onOver = (event: PointerEvent): void => {
    const target = (event.target as Element | null)?.closest('button, [role="button"], [role="tab"], a[href], [tabindex="0"]') ?? null
    if (target === over) return
    over = target
    if (target && !(target as HTMLButtonElement).disabled) tick()
  }
  const travelled = new WeakMap<Element, number>()
  const onScroll = (event: Event): void => {
    const box = event.target instanceof Element ? event.target : document.scrollingElement
    if (!box) return
    const last = travelled.get(box)
    if (last === undefined) return void travelled.set(box, box.scrollTop)
    if (Math.abs(box.scrollTop - last) < 40) return
    travelled.set(box, box.scrollTop)
    tick()
  }
  document.addEventListener('pointerover', onOver)
  document.addEventListener('scroll', onScroll, true)
  return () => {
    document.removeEventListener('pointerover', onOver)
    document.removeEventListener('scroll', onScroll, true)
  }
}
