import tearUrl from '@/assets/sounds/paper-rip.m4a'
import foldUrl from '@/assets/sounds/paper-fold.m4a'
import pageUrl from '@/assets/sounds/page-turn.m4a'
import slideUrl from '@/assets/sounds/paper-slide.m4a'
import tickUrl from '@/assets/sounds/clock-tick.m4a'
import tenseUrl from '@/assets/sounds/clock-tense.m4a'
import alarmUrl from '@/assets/sounds/clock-alarm.m4a'
import saberOnUrl from '@/assets/sounds/saber-on.m4a'
import saberOffUrl from '@/assets/sounds/saber-off.m4a'
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
  // A light tick: switching a tab, moving to a section. Heard more than
  // anything else, so the quietest note here: low, short and soft.
  tap: [[1046, 0, 0.035, 0.03]],
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
  // Unpinned: the clip let go, the same two notes the other way up, quieter.
  unpin: [[880, 0, 0.04, 0.035], [1175, 0.03, 0.07, 0.03]],
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
  // Home's rows, and only them: a short airy flick that slides up, like a
  // card riffled past the thumb. Each dot the row passes is a softer one.
  riffle: [[880, 0, 0.06, 0.035, 1320], [1175, 0.04, 0.05, 0.025, 1568]],
  bead: [[1318, 0, 0.02, 0.008]],
  // Into reading: a book opened, three soft notes stepping up; out of it, down.
  read: [[440, 0, 0.16, 0.035], [554, 0.07, 0.16, 0.035], [659, 0.14, 0.26, 0.035]],
  unread: [[659, 0, 0.12, 0.03], [554, 0.06, 0.12, 0.03], [440, 0.12, 0.2, 0.03]],
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
  // Getting ready to focus: a low note winding up a fourth, a breath in.
  windup: [[262, 0, 0.22, 0.04, 349, 0.05]],
  // A timer set from the box: two quick ticks, a clock wound.
  timer: [[1760, 0, 0.03, 0.04], [1320, 0.09, 0.03, 0.04], [988, 0.18, 0.2, 0.04]],
  // A session or timer run its course: a slow open chord, the bell at the end of a sit.
  finish: [[392, 0, 0.9, 0.045], [587, 0.12, 0.9, 0.04], [784, 0.24, 1.2, 0.035]],
  // Called off: one soft note sinking, nothing to celebrate and nothing wrong.
  called: [[466, 0, 0.5, 0.04, 349, 0.08]],
  // A note stuck on the desktop: a light press and a lift; taken down, the press alone.
  stick: [[988, 0, 0.05, 0.05], [1480, 0.05, 0.16, 0.04]],
  unstick: [[1480, 0, 0.05, 0.04], [988, 0.05, 0.12, 0.035]],
  // Reveal an answer in review.
  reveal: [[740, 0, 0.12]],
  // The four grades, a little scale: "again" sinks, "hard" is one low note,
  // "good" steps up, "easy" runs up three.
  again: [[349, 0, 0.14, 0.045, 294, 0.01]],
  hard: [[440, 0, 0.1, 0.045]],
  good: [[523, 0, 0.06, 0.045], [659, 0.045, 0.1, 0.04]],
  easy: [[587, 0, 0.05, 0.04], [784, 0.04, 0.05, 0.04], [1046, 0.08, 0.14, 0.035]],
  // A row moved in your own order: a short slide of two close notes.
  shift: [[698, 0, 0.05, 0.04], [784, 0.035, 0.07, 0.04]],
  // Picked up to drag: one small note lifting. Let go where it was: one soft
  // low note, nothing changed.
  lift: [[587, 0, 0.05, 0.03, 784, 0.01]],
  stay: [[392, 0, 0.07, 0.03]],
  // Rows gathered into a group: two notes sliding in to meet on a third, a
  // bundle tied. Separated: the same notes leaving the middle, softer.
  gather: [[523, 0, 0.07, 0.035, 587, 0.01], [880, 0.02, 0.07, 0.03, 784, 0.01], [659, 0.08, 0.16, 0.035]],
  separate: [[659, 0, 0.06, 0.03], [587, 0.05, 0.1, 0.025, 523, 0.01], [784, 0.05, 0.1, 0.025, 880, 0.01]],
  // A card carried to another column: a warm glide across, then the landing.
  move: [[523, 0, 0.07, 0.04, 698, 0.01], [784, 0.06, 0.1, 0.035]],
  // A tag put on: a small rising third, a label pressed on. Taken off: the
  // same third falling, softer.
  tag: [[659, 0, 0.045, 0.04], [831, 0.035, 0.08, 0.035]],
  untag: [[831, 0, 0.045, 0.03], [659, 0.035, 0.07, 0.025]],
  // A heading folded under its title: two notes stepping down, a page tucked
  // in. Unfolded: stepping up. Shorter than a panel, which is a bigger thing.
  tuck: [[659, 0, 0.04, 0.03], [494, 0.03, 0.06, 0.025]],
  untuck: [[494, 0, 0.04, 0.025], [659, 0.03, 0.06, 0.03]],
  // Quick Look: a picture lifted up close with a soft glide up, set back with
  // the glide down. A click to zoom is a short glide in or out.
  look: [[440, 0, 0.12, 0.035, 659, 0.02], [880, 0.06, 0.1, 0.02]],
  unlook: [[659, 0, 0.1, 0.03, 440, 0.01]],
  zoomin: [[587, 0, 0.06, 0.03, 880, 0.005]],
  zoomout: [[880, 0, 0.06, 0.03, 587, 0.005]],
  // A note changes kind: two notes a fourth apart, a label swapped.
  retag: [[587, 0, 0.07, 0.05], [784, 0.05, 0.12, 0.05]],
  // Archived: a soft low lid closing, slower than a discard.
  shelve: [[392, 0, 0.16, 0.05, 294, 0.02], [262, 0.08, 0.24, 0.04]],
  // Out of the archive: the same lid lifting.
  unshelve: [[262, 0, 0.12, 0.04], [392, 0.06, 0.2, 0.05]],
  // An older version brought back: a rewind with a landing.
  rewind: [[880, 0, 0.04, 0.04], [740, 0.03, 0.04, 0.04], [587, 0.06, 0.04, 0.04], [784, 0.11, 0.2, 0.05]],
  // Files saved to a folder: three quick drops.
  saved: [[1046, 0, 0.04, 0.04], [880, 0.05, 0.04, 0.04], [698, 0.1, 0.1, 0.04]],
  // A day's page opened: a soft morning fifth.
  day: [[440, 0, 0.2, 0.04, 466, 0.02], [659, 0.06, 0.3, 0.035]],
  // A note opened in its own window: a quick rising pop.
  window: [[784, 0, 0.04, 0.04], [1175, 0.03, 0.1, 0.04]],
  // Nothing left rotting: an open major chord, rolled slowly, all clear.
  clear: [[392, 0, 0.5, 0.04], [494, 0.06, 0.5, 0.04], [587, 0.12, 0.55, 0.04], [784, 0.18, 0.7, 0.04]],
  // A memory arrives: one low bell, then the same an octave up, softly.
  memory: [[523, 0, 0.4, 0.04], [1046, 0.14, 0.5, 0.03]],
  // A recap's last page: a rising arpeggio that lands.
  wrapped: [[523, 0, 0.12], [659, 0.08, 0.12], [784, 0.16, 0.12], [1046, 0.24, 0.4]],
  // A task put off to a later list: a note drifting down and away, unhurried.
  later: [[587, 0, 0.18, 0.04, 494, 0.02], [392, 0.1, 0.3, 0.035]],
  // Another scene: two soft open fifths, slow to arrive, like a view clearing.
  scene: [[392, 0, 0.6, 0.03, undefined, 0.12], [587, 0.12, 0.7, 0.025, undefined, 0.14]],
  // The day's review queue finished: the last grade answered by a soft
  // descending third and its root, a book closed rather than a bell rung.
  reviewed: [[784, 0, 0.3, 0.035], [659, 0.1, 0.35, 0.035], [523, 0.2, 0.7, 0.04]],
  // Held as a question: an open fourth that swells in and is left unresolved,
  // a thing set down to be carried rather than finished.
  hold: [[392, 0, 0.5, 0.04, undefined, 0.06], [523, 0.08, 0.6, 0.035, undefined, 0.08]],
  // A clue dropped in: one small high note, like a pebble into a jar.
  clue: [[1175, 0, 0.06, 0.04], [1568, 0.04, 0.12, 0.03]],
  // Got it: the held fourth finally resolves, up to the octave.
  answered: [[392, 0, 0.18, 0.04], [523, 0.07, 0.18, 0.04], [784, 0.14, 0.5, 0.045]],
  // Let go: the same fourth, sinking softly away.
  release: [[523, 0, 0.3, 0.035, 440, 0.03], [392, 0.1, 0.5, 0.03, 330, 0.04]],
  // A session's recap written into the task's log: a soft low knock and the
  // note above it, a line added at the bottom of a ledger.
  logged: [[440, 0, 0.08, 0.045], [587, 0.06, 0.18, 0.04]],
  // A capture tidied and left behind: a light upward brush, a page smoothed flat.
  tidy: [[880, 0, 0.05, 0.035], [1175, 0.035, 0.09, 0.03]],
  // Set aside for deciding day: a soft low note and its fifth, put down to pick up later.
  back: [[440, 0, 0.14, 0.04, undefined, 0.01], [659, 0.06, 0.24, 0.035]],
  // The tidy pass begun: a light brush upward, sleeves rolled.
  sweep: [[659, 0, 0.1, 0.03, 988, 0.02], [1318, 0.07, 0.12, 0.02]],
  // The tidy pass finished: a small rising triad, all in order.
  tidied: [[659, 0, 0.18, 0.035], [784, 0.07, 0.2, 0.035], [988, 0.14, 0.4, 0.035]],
  // Weighing it up: two notes a step apart, back and forth, undecided.
  weigh: [[587, 0, 0.08, 0.04], [659, 0.07, 0.08, 0.04], [587, 0.14, 0.14, 0.035]],
  // The decide pass begun: two low notes a fourth apart, a breath before choosing.
  sift: [[294, 0, 0.12, 0.04], [392, 0.08, 0.18, 0.035]],
  // The decide pass finished: the same low notes, landing on their octave.
  sifted: [[294, 0, 0.12, 0.04], [392, 0.07, 0.12, 0.04], [587, 0.14, 0.36, 0.035]],
  // Decided: a low fifth set down firmly, a gavel rather than a bell.
  decided: [[196, 0, 0.12, 0.05], [294, 0.05, 0.35, 0.05]],
  // An experiment started: a bubble rising, two quick notes going up.
  trial: [[659, 0, 0.05, 0.04, 880, 0.04], [988, 0.05, 0.12, 0.035]],
  // A finding written down: three notes landing on a sixth, open but settled.
  finding: [[523, 0, 0.1, 0.04], [659, 0.06, 0.1, 0.04], [880, 0.12, 0.3, 0.04]],
  // Another name for a note: a soft echo of one note an octave up.
  alias: [[784, 0, 0.06, 0.035], [1568, 0.05, 0.1, 0.025]],
  // Kept in view: a pin's two notes, softer and lower, for a question.
  watch: [[880, 0, 0.05, 0.035], [659, 0.04, 0.16, 0.035]],
  // A milestone: two quick knocks and a held chord with a bright note on
  // top, a small "ba-da-da". Rare by design, so it can be the boldest here.
  cheer: [[784, 0, 0.06, 0.045], [784, 0.08, 0.06, 0.045], [523, 0.18, 0.7, 0.04], [659, 0.18, 0.7, 0.035], [1046, 0.19, 0.8, 0.04], [1568, 0.3, 0.6, 0.02]],
  // A goal set: a low note and its fifth, then the octave held, a flag planted far off.
  goal: [[262, 0, 0.16, 0.045], [392, 0.08, 0.2, 0.04], [523, 0.18, 0.6, 0.04, undefined, 0.04]],
  // A log against a goal: two soft steps forward, the second a tone higher.
  mark: [[587, 0, 0.07, 0.04], [659, 0.09, 0.14, 0.04]],
  // A week or a month turned over: a page, slower and lower than a day's.
  season: [[330, 0, 0.3, 0.035, 349, 0.03], [494, 0.08, 0.4, 0.03]],
  // A pomodoro round over and its break begun: a slow falling third and a
  // soft low note held, the opposite of the bell that starts work again.
  rest: [[659, 0, 0.5, 0.035], [523, 0.16, 0.6, 0.035], [392, 0.34, 1, 0.03, undefined, 0.08]],
  // The five-second rule's count, 5 to 1: a dry wooden tick, one a second.
  tick: [[1568, 0, 0.025, 0.035], [784, 0.004, 0.03, 0.02]]
} satisfies Record<string, Note[]>

export type Cue = keyof typeof CUES

/**
 * One soft note from a pentatonic scale, by step: how a row of choices can
 * each have a voice of its own (each theme in the theme menu) and still sound
 * like they belong together.
 */
export function step(n: number): void {
  if (!often()) return
  const SCALE = [523, 587, 659, 784, 880]
  const octave = Math.floor(n / SCALE.length)
  play([[SCALE[((n % SCALE.length) + SCALE.length) % SCALE.length] * 2 ** octave, 0, 0.12, 0.035]])
}

// The sounds heard all the time: a tab, a page, a dot, a step. The clicks are too.
const OFTEN = new Set<Cue>(['tap', 'page', 'bead'])

export function chime(cue: Cue): void {
  if (held() || (OFTEN.has(cue) && !often())) return
  play(CUES[cue] as Note[])
}

/** A key held down and repeating: one sound for the press, none for the repeats. */
function held(): boolean {
  const event = window.event
  return event instanceof KeyboardEvent && event.type === 'keydown' && event.repeat
}

let oftenAt = -Infinity
let keysAt = -Infinity
/**
 * Whether an everyday sound may play now: never two within 70ms, never while
 * a key repeats, and from a run of quick key presses (j j j down a list) only
 * the first, until the keys rest for a quarter of a second.
 */
function often(): boolean {
  if (held()) return false
  const now = performance.now()
  const event = window.event
  if (event instanceof KeyboardEvent && event.type === 'keydown') {
    const burst = now - keysAt < 250
    keysAt = now
    if (burst) return false
  }
  if (now - oftenAt < 70) return false
  oftenAt = now
  return true
}

/**
 * The one way in to the speakers: nothing while sounds are off or the volume
 * is down, otherwise the page's single audio context, awake.
 */
function audio(): AudioContext | null {
  if (!enabled || !volume) return null
  context ??= new AudioContext()
  // A context made before any click starts suspended; resuming is free after.
  if (context.state === 'suspended') void context.resume()
  return context
}

function play(notes: Note[]): void {
  const context = audio()
  if (!context) return
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
// Heard dozens of times a minute, so kept low, dark and short: felt more
// than heard, like a key's travel rather than a bell.
const CLICKS = {
  // Hovering a row: sensory-ui's "subtle", the gentlest of the three.
  soft: { duration: 0.006, frequency: 2200, q: 2, volume: 0.1, decay: 16 },
  // Scrolling: its "tap", the "tock" in its button demo.
  tock: { duration: 0.006, frequency: 2000, q: 2, volume: 0.09, decay: 18 },
  // Hovering a rot card, something asking for you: lower and rounder, a knock.
  knock: { duration: 0.012, frequency: 1100, q: 2, volume: 0.16, decay: 45 },
  // Opening a note: its "confirm", a little brighter than the hover.
  tick: { duration: 0.008, frequency: 2800, q: 3, volume: 0.14, decay: 24 },
  // The Brutal sticker in Settings, pointed at: a low, heavy block set down.
  clunk: { duration: 0.022, frequency: 520, q: 1.4, volume: 0.24, decay: 70 },
  // Brutal chosen: the same block, dropped from higher.
  slam: { duration: 0.04, frequency: 300, q: 1.2, volume: 0.34, decay: 110 }
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
  if (!enabled || !volume || !often()) return
  const context = audio()
  if (!context) return
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
 * per list: once each time the pointer arrives on a row or a card that names
 * its own sound, and once for every 60 or so pixels any scrolling area
 * travels, like the detents of a wheel. Plain buttons are quiet to pass over:
 * they speak when pressed. Installed once per window.
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
    // Only rows and cards that name a sound tick when passed over, and the
    // outermost one: a card and the buttons on it are one sound, not one more
    // for each button. Every button on the page ticking made a rattle.
    const PASSED = '[data-row], [data-tone]'
    let target = at.closest(PASSED)
    for (let outer = target?.parentElement?.closest(PASSED); outer; outer = outer.parentElement?.closest(PASSED)) target = outer
    if (target === over) return
    over = target
    // A card can name its own sound; a row gets the soft click.
    const tone = target?.closest('[data-tone]')?.getAttribute('data-tone') as keyof typeof CLICKS | null
    if (target && !(target as HTMLButtonElement).disabled) click(tone && tone in CLICKS ? tone : 'soft')
  }
  const travelled = new WeakMap<Element, number>()
  const onScroll = (event: Event): void => {
    const box = event.target instanceof Element ? event.target : document.scrollingElement
    if (!box || box.closest('[data-silent]')) return
    const last = travelled.get(box)
    if (last === undefined) return void travelled.set(box, box.scrollTop)
    // A detent every 60px, like the notches of a wheel.
    if (Math.abs(box.scrollTop - last) < 60) return
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
  // A to-do ticked inside a note sounds like a task done, unticked like a switch off.
  const onChange = (event: Event): void => {
    const box = event.target as HTMLInputElement | null
    if (box?.type === 'checkbox' && box.closest('li[data-type="taskItem"]')) chime(box.checked ? 'done' : 'off')
  }
  document.addEventListener('change', onChange, true)
  document.addEventListener('pointerdown', onDown)
  document.addEventListener('pointermove', onMove, true)
  document.addEventListener('pointerover', onOver)
  document.addEventListener('wheel', onWheel, { capture: true, passive: true })
  document.addEventListener('touchmove', onWheel, { capture: true, passive: true })
  document.addEventListener('scroll', onScroll, true)
  return () => {
    document.removeEventListener('pointerdown', onDown)
    document.removeEventListener('change', onChange, true)
    document.removeEventListener('pointermove', onMove, true)
    document.removeEventListener('wheel', onWheel, true)
    document.removeEventListener('touchmove', onWheel, true)
    document.removeEventListener('pointerover', onOver)
    document.removeEventListener('scroll', onScroll, true)
  }
}

/**
 * A recorded sound, for the few moments a drawn one cannot be: paper tearing
 * as a capture goes through the shredder, a card folding over. Read once and
 * kept; played through the same switch and volume as every other sound.
 */
const recordings = new Map<string, Promise<AudioBuffer | null>>()
function load(context: BaseAudioContext, url: string): Promise<AudioBuffer | null> {
  let buffer = recordings.get(url)
  // A file small enough is built into the page as a data: address, which the
  // page's rules will not fetch: read straight from its letters instead.
  const bytes = (): Promise<ArrayBuffer> =>
    url.startsWith('data:') ? Promise.resolve(Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (char) => char.charCodeAt(0)).buffer) : fetch(url).then((r) => r.arrayBuffer())
  if (!buffer) recordings.set(url, (buffer = bytes().then((data) => context.decodeAudioData(data)).catch(() => null)))
  return buffer
}

/**
 * The recorded sounds that played, newest last, by name: what the QA runs
 * read to see a sound fire (or not, with Sounds off). A few dozen at most.
 */
const heard: string[] = []
;(window as unknown as { vigilHeard?: string[] }).vigilHeard = heard
const hear = (name: string): void => void (heard.push(name), heard.length > 50 && heard.shift())

/**
 * Play a recording once (or on a loop), through the same switch and volume as
 * every other sound. Resolves to what is playing, so a loop can be stopped,
 * or to null when nothing could be (sounds off, or the file would not load).
 */
function recording(url: string, level: number, name: string, options: { loop?: boolean; at?: number; rate?: number } = {}): Promise<AudioBufferSourceNode | null> {
  if (!enabled || !volume) return Promise.resolve(null)
  const context = audio()
  if (!context) return Promise.resolve(null)
  return load(context, url).then((sound) => {
    // Turned off while it loaded: nothing after all.
    if (!sound || !enabled || !volume) return null
    const source = context.createBufferSource()
    source.buffer = sound
    source.loop = Boolean(options.loop)
    // Played faster, the same paper sounds lighter and shorter: a smaller sheet.
    source.playbackRate.value = options.rate ?? 1
    const gain = context.createGain()
    // A recording is louder than the drawn sounds: brought down to sit with them.
    gain.gain.value = level * volume
    source.connect(gain).connect(context.destination)
    source.start(context.currentTime + (options.at ?? 0))
    hear(name)
    return source
  })
}
export const tear = (): void => void recording(tearUrl, 0.55, 'tear')
/** A review card turned over. */
export const fold = (): void => void recording(foldUrl, 0.5, 'fold')

// When each kind of page last turned: the soft one of the arrow keys has a clock of its own.
const turnedAt = { soft: -Infinity, full: -Infinity }
/**
 * An article or a piece of writing opened: a page turned, short and soft.
 * Stepping down a list faster than one every 400ms turns no pages. `soft`
 * is the lighter turn of stepping between pieces with the arrow keys: the
 * same page, quicker and quieter.
 */
export function pageTurn(soft = false): void {
  const now = performance.now()
  const key = soft ? 'soft' : 'full'
  const quick = now - turnedAt[key] < 400
  turnedAt[key] = now
  if (quick) return
  if (soft) void recording(pageUrl, 0.16, 'page-leaf', { rate: 1.18 })
  else void recording(pageUrl, 0.3, 'page-turn')
}

/**
 * The rest of the paper sounds, all quiet. `slide`: a sheet slid across the
 * desk (into read mode, or the reading queue moving on to the next piece).
 * `fold`: a pane folded away, the card fold quicker and softer.
 */
export function paper(kind: 'slide' | 'fold'): void {
  if (kind === 'slide') void recording(slideUrl, 0.14, 'paper-slide')
  else void recording(foldUrl, 0.3, 'paper-fold', { rate: 1.3 })
}

/**
 * Into the sandbox: a lightsaber swung, then its hum swelling and settling,
 * just over a second. Out of it: the hum drawn back in, softer. Recorded; the
 * drawn hum below stands in if the file will not load.
 */
export function hum(up = true): void {
  void recording(up ? saberOnUrl : saberOffUrl, up ? 0.3 : 0.2, up ? 'saber-on' : 'saber-off').then((playing) => playing || drawnHum(up))
}

/** The drawn hum's own lengths, ms, for when the recordings will not load. */
const DRAWN_MS = { on: 860, off: 610 }
let reader: OfflineAudioContext | null = null
/**
 * How long the saber's sound runs, in ms, read from the decoded recording
 * itself: the clock the blade is timed by. Read whether or not Sounds is on
 * (decoding plays nothing), so the moment lasts the same either way. Decoding
 * here also means `hum` then starts at once, on the frame the blade does.
 */
export async function saberLength(up: boolean): Promise<number> {
  const decoder = context ?? (reader ??= new OfflineAudioContext(1, 1, 44100))
  const sound = await load(decoder, up ? saberOnUrl : saberOffUrl)
  return sound ? Math.round(sound.duration * 1000) : up ? DRAWN_MS.on : DRAWN_MS.off
}

/**
 * A focus session's clock. Ticking, if you asked for it, while it runs; the
 * last ten seconds a slower, tenser tick, one a second, whether or not; and
 * at the end an alarm clock's three rings. All of it stops the moment the
 * session pauses, ends or is called off, and none of it plays in safe mode.
 */
type Clock = { running: boolean; left: number | null; tick: boolean; level: number }
let ticking: { key: string; source: Promise<AudioBufferSourceNode | null> } | null = null
const hush = (): void => {
  if (!ticking) return
  void ticking.source.then((source) => source && (source.stop(), hear('clock-stop')))
  ticking = null
}
export function sessionClock({ running, left, tick, level }: Clock): void {
  const last = left !== null && left > 0 && left <= 10_000
  const kind = !running || !enabled || !volume ? null : last ? 'tense' : tick && (left === null || left > 0) ? 'calm' : null
  // Started again only when what should play changes, or how loud.
  const key = kind && `${kind} ${level} ${volume}`
  if (key === (ticking?.key ?? null)) return
  hush()
  if (!kind || !key) return
  // The tense tick lands as the seconds turn over on the clock, which rounds
  // to the nearest second: at each half second left.
  const at = kind === 'tense' && left !== null ? (((left - 500) % 1000) + 1000) % 1000 / 1000 : 0
  ticking = { key, source: recording(kind === 'tense' ? tenseUrl : tickUrl, (kind === 'tense' ? 0.5 : 0.35) * level, kind === 'tense' ? 'clock-tense' : 'clock-tick', { loop: true, at }) }
}
/** Time up: the alarm clock, short; the drawn bell if it cannot load. */
export function alarm(): void {
  hush()
  void recording(alarmUrl, 0.3, 'clock-alarm').then((playing) => playing || chime('finish'))
}

/**
 * The sandbox's hum drawn, for when its recordings will not load: a low hum
 * that rises and ignites, then settles, about 0.8s. Out of it (`up` false):
 * the same hum falling away, softer and shorter. Drawn here like every other sound, two slightly apart saw waves
 * under a filter that opens as the pitch climbs, with a breath of noise at
 * the strike. Same switch and volume as the rest.
 */
function drawnHum(up: boolean): void {
  const context = audio()
  if (!context) return
  const at = context.currentTime + 0.01
  const end = at + (up ? 0.85 : 0.6)
  const peak = (up ? 0.024 : 0.013) * volume
  const out = context.createGain()
  out.gain.setValueAtTime(0.0001, at)
  if (up) {
    out.gain.exponentialRampToValueAtTime(peak, at + 0.16)
    out.gain.exponentialRampToValueAtTime(peak * 0.45, at + 0.42)
  } else {
    out.gain.exponentialRampToValueAtTime(peak, at + 0.04)
    out.gain.exponentialRampToValueAtTime(peak * 0.5, at + 0.3)
  }
  out.gain.exponentialRampToValueAtTime(0.0001, end)
  const warm = context.createBiquadFilter()
  warm.type = 'lowpass'
  warm.Q.value = 2
  warm.frequency.setValueAtTime(up ? 180 : 1100, at)
  if (up) {
    warm.frequency.exponentialRampToValueAtTime(2200, at + 0.18)
    warm.frequency.exponentialRampToValueAtTime(700, at + 0.5)
  } else warm.frequency.exponentialRampToValueAtTime(140, end)
  warm.connect(out).connect(context.destination)
  // The hum's slow wobble, the way a held note never sits quite still.
  const wobble = context.createOscillator()
  const depth = context.createGain()
  wobble.frequency.value = 5.5
  depth.gain.value = 1.5
  wobble.connect(depth)
  for (const [ratio, type] of [[1, 'sawtooth'], [1.012, 'sawtooth'], [2, 'triangle']] as const) {
    const tone = context.createOscillator()
    tone.type = type
    tone.frequency.setValueAtTime((up ? 55 : 98) * ratio, at)
    if (up) {
      tone.frequency.exponentialRampToValueAtTime(118 * ratio, at + 0.2)
      tone.frequency.exponentialRampToValueAtTime(98 * ratio, at + 0.45)
    } else tone.frequency.exponentialRampToValueAtTime(40 * ratio, end)
    depth.connect(tone.frequency)
    tone.connect(warm)
    tone.start(at)
    tone.stop(end + 0.02)
  }
  wobble.start(at)
  wobble.stop(end + 0.02)
  if (!up) return
  // The strike: a short breath of noise as it catches.
  const length = Math.round(context.sampleRate * 0.12)
  const noise = context.createBuffer(1, length, context.sampleRate)
  const data = noise.getChannelData(0)
  for (let n = 0; n < length; n++) data[n] = (Math.random() * 2 - 1) * (1 - n / length) ** 2
  const source = context.createBufferSource()
  source.buffer = noise
  const band = context.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = 2400
  band.Q.value = 0.8
  const breath = context.createGain()
  breath.gain.value = 0.02 * volume
  source.connect(band).connect(breath).connect(context.destination)
  source.start(at + 0.1)
}
