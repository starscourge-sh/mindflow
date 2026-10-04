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
  const sound = PACKS[pack]
  // Square and saw are loud for their level; they are brought down to match.
  const loud = sound.osc === 'square' || sound.osc === 'sawtooth' ? 0.45 : 1
  for (const [frequency, delay, length = 0.18, peak = 0.07] of CUES[cue] as Note[]) {
    const at = start + delay
    const tone = context.createOscillator()
    const level = context.createGain()
    tone.type = sound.osc
    tone.frequency.value = frequency * sound.pitch
    level.gain.setValueAtTime(0, at)
    level.gain.linearRampToValueAtTime(peak * sound.gain * loud, at + 0.004)
    level.gain.exponentialRampToValueAtTime(0.0001, at + length * sound.decay)
    tone.connect(level).connect(context.destination)
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
  if (!enabled) return
  context ??= new AudioContext()
  if (context.state === 'suspended') void context.resume()
  const tune = CLICKS[name]
  const SOFT = PACKS[pack]
  const t = context.currentTime
  const volume = tune.volume * SOFT.gain
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
  const level = context.createGain()
  level.gain.value = volume
  noise.connect(filter).connect(level).connect(context.destination)
  noise.start(t)

  const tone = context.createOscillator()
  tone.type = SOFT.osc
  tone.frequency.value = frequency
  const envelope = context.createGain()
  envelope.gain.setValueAtTime(0.001, t)
  envelope.gain.linearRampToValueAtTime(volume * 0.3, t + 0.001)
  envelope.gain.exponentialRampToValueAtTime(0.001, t + duration * 1.5)
  tone.connect(envelope).connect(context.destination)
  tone.start(t)
  tone.stop(t + duration * 1.5 + 0.01)
}

let last = 0
/** Held to one every so often, so a fast sweep is a purr, not a rattle. */
const often = (name: keyof typeof CLICKS, gap = 40): void => {
  const now = performance.now()
  if (now - last < gap) return
  last = now
  click(name)
}
// While a list scrolls, rows slide under a still pointer and would each tick
// as if hovered: the scroll speaks for itself, so hover stays quiet until the
// scrolling has stopped for a moment.
let scrolledAt = 0

/**
 * The tick everywhere, from two listeners on the whole page rather than one
 * per list: once each time the pointer arrives on something you can press,
 * and once for every 40 or so pixels any scrolling area travels, like the
 * detents of a wheel. Installed once per window.
 */
export function installTicks(): () => void {
  let over: Element | null = null
  const onOver = (event: PointerEvent): void => {
    // The Settings preview plays its own sounds, through the pack being tried.
    if ((event.target as Element | null)?.closest('[data-silent]')) return
    if (performance.now() - scrolledAt < 160) return
    const target = (event.target as Element | null)?.closest('button, [role="button"], [role="tab"], a[href], [tabindex="0"]') ?? null
    if (target === over) return
    over = target
    // A row can name its own sound; anything else gets the soft click.
    const tone = target?.closest('[data-tone]')?.getAttribute('data-tone') as keyof typeof CLICKS | null
    if (target && !(target as HTMLButtonElement).disabled) often(tone && tone in CLICKS ? tone : 'soft')
  }
  const travelled = new WeakMap<Element, number>()
  const onScroll = (event: Event): void => {
    const box = event.target instanceof Element ? event.target : document.scrollingElement
    if (!box || box.closest('[data-silent]')) return
    scrolledAt = performance.now()
    const last = travelled.get(box)
    if (last === undefined) return void travelled.set(box, box.scrollTop)
    // A detent every 90px, and never more than one every 110ms however fast
    // the wheel goes: a steady, unhurried tock under a long scroll.
    if (Math.abs(box.scrollTop - last) < 90) return
    travelled.set(box, box.scrollTop)
    often('tock', 110)
  }
  // Opening a note: a press on any row marked as one, the brighter tick.
  const onDown = (event: PointerEvent): void => {
    const target = event.target as Element | null
    if (target?.closest('[data-row]') && !target.closest('[data-silent]')) click('tick')
  }
  document.addEventListener('pointerdown', onDown)
  document.addEventListener('pointerover', onOver)
  document.addEventListener('scroll', onScroll, true)
  return () => {
    document.removeEventListener('pointerdown', onDown)
    document.removeEventListener('pointerover', onOver)
    document.removeEventListener('scroll', onScroll, true)
  }
}
