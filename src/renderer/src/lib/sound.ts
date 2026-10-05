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
let volume = 1
/** The Volume setting, 0 to 1: every sound is scaled by it. */
export const setVolume = (level: number): void => {
  volume = Math.max(0, Math.min(1, level))
}

// `to` glides the pitch there over the note, and `swell` is how long it takes
// to come in: together, a sound that grows rather than strikes.
type Note = [frequency: number, delay: number, length?: number, level?: number, to?: number, swell?: number]

const CUES = {
  // A light tick: switching a tab, moving to a section.
  tap: [[1320, 0, 0.05]],
  // A menu or panel unfolds: a quick upward flick, quieter than anything you do.
  open: [[988, 0, 0.04, 0.035], [1318, 0.025, 0.06, 0.035]],
  // A switch turned on climbs a fifth; turned off, it comes back down.
  on: [[523, 0, 0.07, 0.05], [784, 0.045, 0.1, 0.05]],
  off: [[784, 0, 0.07, 0.04], [523, 0.045, 0.1, 0.04]],
  // Undo: three quick steps back down, a rewind.
  undo: [[1046, 0, 0.05, 0.05], [880, 0.04, 0.05, 0.05], [698, 0.08, 0.1, 0.05]],
  // Copy: the same high note twice, a duplicate.
  copy: [[1568, 0, 0.04, 0.045], [1568, 0.06, 0.05, 0.045]],
  // Pin: a note pressed down and held, a clip closing.
  pin: [[1175, 0, 0.04], [880, 0.03, 0.14]],
  // Search: one ping with a long tail, sonar going out.
  search: [[1318, 0, 0.45, 0.04]],
  // The side panel slides out (rising) or folds away (falling), low and soft.
  // Something opening out (the side panel, a taller box): a warm swell
  // that rises a fifth as it grows, two voices a fifth apart. Folding away is
  // the same, falling, and a little quieter.
  slide: [[196, 0, 0.36, 0.05, 294, 0.09], [294, 0.03, 0.34, 0.03, 440, 0.1]],
  fold: [[294, 0, 0.3, 0.04, 196, 0.05], [440, 0.02, 0.28, 0.025, 294, 0.06]],
  // A task written down: two light knocks, something noted.
  noted: [[740, 0, 0.06], [740, 0.08, 0.1]],
  // A theme kept: a small major chord, the room settled.
  settled: [[523, 0, 0.3, 0.045], [659, 0.03, 0.3, 0.045], [784, 0.06, 0.4, 0.045]],
  // Reading: a page turned.
  page: [[660, 0, 0.05, 0.03]],
  // A capture sent: a quick rising pair, the "got it".
  send: [[587, 0, 0.12], [880, 0.06, 0.18]],
  // Done: a rising third, the small ta-da of a ticked box.
  done: [[660, 0, 0.14], [990, 0.07, 0.22]],
  // Resolve: a short cadence that comes home, dealt with.
  resolve: [[880, 0, 0.08], [784, 0.05, 0.08], [1046, 0.1, 0.22]],
  // Promote: one bright, ringing note, something kept.
  promote: [[880, 0, 0.1], [1320, 0.05, 0.3]],
  // Not allowed: the same low note twice, a soft "uh-uh". Already done, needs
  // something first, nothing to do it to.
  nope: [[196, 0, 0.07], [196, 0.1, 0.1]],
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

export type Cue = keyof typeof CUES

/**
 * One soft note from a pentatonic scale, by step: how a row of choices can
 * each have a voice of its own (each theme in the theme menu) and still sound
 * like they belong together.
 */
export function step(n: number): void {
  const SCALE = [523, 587, 659, 784, 880]
  const octave = Math.floor(n / SCALE.length)
  play([[SCALE[((n % SCALE.length) + SCALE.length) % SCALE.length] * 2 ** octave, 0, 0.12, 0.035]])
}

export function chime(cue: Cue): void {
  play(CUES[cue] as Note[])
}

function play(notes: Note[]): void {
  if (!enabled || !volume) return
  context ??= new AudioContext()
  // A context made before any click starts suspended; resuming is free after.
  if (context.state === 'suspended') void context.resume()
  const start = context.currentTime
  const sound = PACKS[pack]
  // Square and saw are loud for their level; they are brought down to match.
  const loud = sound.osc === 'square' || sound.osc === 'sawtooth' ? 0.45 : 1
  for (const [frequency, delay, length = 0.18, peak = 0.07, to, swell = 0.004] of notes) {
    const at = start + delay
    const tone = context.createOscillator()
    const level = context.createGain()
    tone.type = sound.osc
    tone.frequency.setValueAtTime(frequency * sound.pitch, at)
    if (to) tone.frequency.exponentialRampToValueAtTime(to * sound.pitch, at + length * sound.decay)
    level.gain.setValueAtTime(0.0001, at)
    level.gain.linearRampToValueAtTime(Math.max(0.0002, peak * sound.gain * loud * volume), at + swell)
    level.gain.exponentialRampToValueAtTime(0.0001, at + length * sound.decay)
    // A glide is kept warm: its brightness taken off above a soft corner.
    const warm = to ? context.createBiquadFilter() : null
    if (warm) {
      warm.type = 'lowpass'
      warm.frequency.value = 1400
      warm.Q.value = 0.5
      tone.connect(warm).connect(level).connect(context.destination)
    } else tone.connect(level).connect(context.destination)
    tone.start(at)
    tone.stop(at + length * sound.decay + 0.02)
  }
}

/**
 * sensory-ui's clicks, to its own recipe: a few milliseconds of white noise
 * with an exponential decay, through a bandpass, under a quiet tone at the
 * same pitch, all bent by the chosen pack.
 */
const CLICKS = {
  // Hovering a row: sensory-ui's "subtle", the gentlest of the three.
  soft: { duration: 0.008, frequency: 3600, q: 3.5, volume: 0.25, decay: 25 },
  // Scrolling: its "tap", the "tock" in its button demo.
  tock: { duration: 0.008, frequency: 3800, q: 2.5, volume: 0.28, decay: 35 },
  // Hovering a rot card, something asking for you: lower and rounder, a knock.
  knock: { duration: 0.016, frequency: 1700, q: 2, volume: 0.3, decay: 70 },
  // Opening a note: its "confirm", the brighter "tick".
  tick: { duration: 0.012, frequency: 5500, q: 4, volume: 0.3, decay: 40 }
}
/**
 * sensory-ui's nine packs, from its published table: the waveform under each
 * sound, and how each pack bends the pitch, the resonance, the length and the
 * level. Every cue plays through whichever pack is chosen in Settings.
 */
export const PACKS = {
  soft: { label: 'Soft', feel: 'Warm and rounded, felt mallets on soft pads', osc: 'sine', pitch: 0.8, q: 1, decay: 1.5, gain: 0.7 },
  aero: { label: 'Aero', feel: 'Airy and breathy, wind through chimes', osc: 'sine', pitch: 1, q: 2, decay: 1, gain: 0.9 },
  organic: { label: 'Organic', feel: 'Natural and wooden, marimba and wood blocks', osc: 'triangle', pitch: 0.9, q: 3, decay: 1.3, gain: 0.85 },
  glass: { label: 'Glass', feel: 'Crystalline and bright, struck glass or bells', osc: 'sine', pitch: 1.8, q: 10, decay: 1.2, gain: 0.75 },
  minimal: { label: 'Minimal', feel: 'Clean and sparse, pure tones only', osc: 'sine', pitch: 1, q: 1, decay: 0.8, gain: 0.4 },
  crisp: { label: 'Crisp', feel: 'Sharp and defined, good headphones', osc: 'triangle', pitch: 1.1, q: 4, decay: 0.6, gain: 1 },
  retro: { label: 'Retro', feel: 'Analog synth, vintage and warm', osc: 'square', pitch: 0.85, q: 2, decay: 1.1, gain: 0.8 },
  arcade: { label: 'Arcade', feel: '8-bit chiptune, square waves, punchy', osc: 'square', pitch: 1.5, q: 8, decay: 0.5, gain: 1 },
  industrial: { label: 'Industrial', feel: 'Metallic and mechanical', osc: 'sawtooth', pitch: 0.7, q: 12, decay: 0.6, gain: 1.2 }
} as const
export type PackName = keyof typeof PACKS
let pack: PackName = 'soft'

/** The Sound pack setting. */
export const setPack = (name: PackName): void => {
  if (name in PACKS) pack = name
}

/** Play with another pack for a moment: how Settings previews one. */
export function withPack(name: PackName, play: () => void): void {
  const was = pack
  pack = name
  play()
  pack = was
}

export type ClickName = keyof typeof CLICKS
export function click(name: ClickName): void {
  if (!enabled || !volume) return
  context ??= new AudioContext()
  if (context.state === 'suspended') void context.resume()
  const tune = CLICKS[name]
  const SOFT = PACKS[pack]
  const t = context.currentTime
  const level = Math.max(0.002, tune.volume * SOFT.gain * volume)
  const duration = tune.duration * SOFT.decay
  const frequency = tune.frequency * SOFT.pitch

  const length = Math.floor(context.sampleRate * duration)
  const buffer = context.createBuffer(1, length, context.sampleRate)
  const data = buffer.getChannelData(0)
  const tau = (tune.decay / context.sampleRate) * SOFT.decay
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / context.sampleRate / tau)
  const noise = context.createBufferSource()
  noise.buffer = buffer
  const filter = context.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = frequency
  filter.Q.value = tune.q * SOFT.q
  const gain = context.createGain()
  gain.gain.value = level
  noise.connect(filter).connect(gain).connect(context.destination)
  noise.start(t)

  const tone = context.createOscillator()
  tone.type = SOFT.osc
  tone.frequency.value = frequency
  const envelope = context.createGain()
  envelope.gain.setValueAtTime(0.001, t)
  envelope.gain.linearRampToValueAtTime(level * 0.3, t + 0.001)
  envelope.gain.exponentialRampToValueAtTime(0.001, t + duration * 1.5)
  tone.connect(envelope).connect(context.destination)
  tone.start(t)
  tone.stop(t + duration * 1.5 + 0.01)
}

/**
 * The tick everywhere, from two listeners on the whole page rather than one
 * per list: once each time the pointer arrives on something you can press,
 * and once for every 40 or so pixels any scrolling area travels, like the
 * detents of a wheel. Installed once per window.
 */
export function installTicks(): () => void {
  let over: Element | null = null
  // Only a hand on the mouse makes a sound. A list redrawing, a menu opening
  // or a page scrolling slides things under a still pointer, and the browser
  // calls that "pointer over" too: without this, ticks came from nowhere.
  let movedAt = 0
  const onMove = (event: PointerEvent): void => {
    if (event.movementX || event.movementY) movedAt = event.timeStamp
  }
  // The same for scrolling: a detent is felt only when you turned the wheel
  // or dragged, not when the list scrolled itself to follow the cursor.
  let wheelAt = -Infinity
  const onWheel = (event: Event): void => {
    wheelAt = event.timeStamp
  }
  const onOver = (event: PointerEvent): void => {
    const at = event.target as Element | null
    // Not here: the Settings preview plays its own sounds; a menu speaks when
    // it opens and when you choose, not for every row passed; and writing or
    // drawing surfaces are not things you press.
    if (!at || at.closest('[data-silent], [role="menu"], [contenteditable="true"], .excalidraw, canvas')) {
      over = null
      return
    }
    if (!event.movementX && !event.movementY && event.timeStamp - movedAt > 80) return
    // Tabs and chips sound when pressed, not when passed over: a row of them
    // crossed on the way somewhere else would rattle.
    if (at.closest('[data-hover-quiet]')) {
      over = null
      return
    }
    // The outermost thing you can press: a card and the buttons on it are one
    // sound, made on arriving at the card, not one more for each button.
    // Named, not guessed from tabindex: a focusable editor or canvas is not
    // a button. A card that knocks says so with its own data-tone.
    const PRESSABLE = 'button, [role="button"], [role="tab"], a[href], [data-tone]'
    let target = at.closest(PRESSABLE)
    for (let outer = target?.parentElement?.closest(PRESSABLE); outer; outer = outer.parentElement?.closest(PRESSABLE)) target = outer
    if (target === over) return
    over = target
    // A row can name its own sound; anything else gets the soft click.
    const tone = target?.closest('[data-tone]')?.getAttribute('data-tone') as keyof typeof CLICKS | null
    if (target && !(target as HTMLButtonElement).disabled) click(tone && tone in CLICKS ? tone : 'soft')
  }
  const travelled = new WeakMap<Element, number>()
  const onScroll = (event: Event): void => {
    const box = event.target instanceof Element ? event.target : document.scrollingElement
    if (!box || box.closest('[data-silent]')) return
    const last = travelled.get(box)
    if (last === undefined) return void travelled.set(box, box.scrollTop)
    // A detent every 40px, like the notches of a wheel: no limit on how often.
    if (Math.abs(box.scrollTop - last) < 40) return
    travelled.set(box, box.scrollTop)
    // Smooth scrolling coasts on after the wheel stops; a moment's grace
    // keeps the last few detents, anything later moved by itself.
    if (event.timeStamp - wheelAt < 600) click('tock')
  }
  // Opening a note: a press on any row marked as one, the brighter tick.
  const onDown = (event: PointerEvent): void => {
    const target = event.target as Element | null
    // The left button only: a right-click opens a menu, which has its own sound.
    if (event.button !== 0) return
    if (target?.closest('[data-row]') && !target.closest('[data-silent]')) click('tick')
  }
  document.addEventListener('pointerdown', onDown)
  document.addEventListener('pointermove', onMove, true)
  document.addEventListener('pointerover', onOver)
  document.addEventListener('wheel', onWheel, { capture: true, passive: true })
  document.addEventListener('touchmove', onWheel, { capture: true, passive: true })
  document.addEventListener('scroll', onScroll, true)
  return () => {
    document.removeEventListener('pointerdown', onDown)
    document.removeEventListener('pointermove', onMove, true)
    document.removeEventListener('wheel', onWheel, true)
    document.removeEventListener('touchmove', onWheel, true)
    document.removeEventListener('pointerover', onOver)
    document.removeEventListener('scroll', onScroll, true)
  }
}
