/**
 * A recording left behind by a crash, as words and lines: what its offer says, and the lines as they were written to
 * its folder while it recorded. No Electron here, so a test reads it (test/meeting-left.test.ts).
 */
export type Line = { id: string; track: 'you' | 'others'; text: string; start: number; end: number; final: boolean; speaker: string }

/** Under this many seconds of sound there is nothing worth asking about: cleared without a word. */
export const FEW_SECONDS = 3
/** The sound files while recording: 16 kHz, 16-bit, one channel. */
export const PCM_BYTES_A_SECOND = 32000

export function keptFor(seconds: number): string {
  if (seconds < 59.5) return `${Math.round(seconds)} sec`
  const minutes = Math.round(seconds / 60)
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`
}

/** "A recording from today at 14:10 stopped early: 42 min kept". */
export function offerWords(startedAt: string, seconds: number, now = new Date()): string {
  const at = new Date(startedAt)
  const day = (date: Date): number => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const ago = Math.round((day(now) - day(at)) / 86400000)
  const when = ago === 0 ? 'today' : ago === 1 ? 'yesterday' : at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return `A recording from ${when} at ${at.getHours()}:${String(at.getMinutes()).padStart(2, '0')} stopped early: ${keptFor(seconds)} kept`
}

/** Two lines with mostly the same words. */
function alike(a: string, b: string): boolean {
  const words = (text: string): string[] => text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []
  const one = new Set(words(a)), two = words(b)
  return two.length > 2 && two.filter((word) => one.has(word)).length / two.length > 0.6
}

/** Heard twice: a voice from the speakers came back in through the microphone. The others' line is the one kept. */
export const heardTwice = (one: Line, among: Line[]): boolean =>
  one.track === 'you' && among.some((other) => other.track === 'others' && Math.abs(other.start - one.start) < 3 && alike(other.text, one.text))

const tenth = (seconds: number): number => Math.round(seconds * 10) / 10

/**
 * The lines in a folder's words.jsonl, in the order they were said: the last written of each id (a line is written again
 * as it settles), so one a crash caught half way is kept as far as it had got. A line the crash cut off is left out.
 */
export function linesFrom(text: string): Line[] {
  const byId = new Map<string, Line>()
  for (const part of text.split('\n')) {
    try {
      const one = JSON.parse(part) as Line
      if (one.id && one.text) byId.set(one.id, { ...one, start: tenth(one.start), end: tenth(one.end) })
    } catch {
      // The last line, cut off by the crash.
    }
  }
  const all = [...byId.values()]
  return all.filter((one) => !heardTwice(one, all)).sort((a, b) => a.start - b.start)
}
