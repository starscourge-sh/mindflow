/**
 * Small sounds for the actions that change something, synthesised on the spot
 * the way sensory-ui does it: no files, no latency, a few lines of Web Audio.
 * A click that sounds feels faster than one that does not, even with the same
 * pixels. Quiet by design, and silent for anyone who asked their system for
 * reduced motion.
 */
let context: AudioContext | null = null
let enabled = true

/** The Sounds setting. */
export const soundOn = (on: boolean): void => {
  enabled = on
}

const NOTES = {
  // Done: two rising notes, the small "ta-da" of a ticked box.
  done: [660, 990],
  // Promote: a single bright note, something kept.
  promote: [880],
  // A grade: one soft low note, so a run of them is not tiring.
  grade: [520],
  // Let go: a falling pair, quieter.
  away: [440, 330]
} as const

export function chime(cue: keyof typeof NOTES): void {
  if (!enabled || matchMedia('(prefers-reduced-motion: reduce)').matches) return
  context ??= new AudioContext()
  const start = context.currentTime
  NOTES[cue].forEach((frequency, index) => {
    const at = start + index * 0.07
    const tone = context!.createOscillator()
    const level = context!.createGain()
    tone.type = 'sine'
    tone.frequency.value = frequency
    level.gain.setValueAtTime(0, at)
    level.gain.linearRampToValueAtTime(0.04, at + 0.01)
    level.gain.exponentialRampToValueAtTime(0.0001, at + 0.18)
    tone.connect(level).connect(context!.destination)
    tone.start(at)
    tone.stop(at + 0.2)
  })
}
