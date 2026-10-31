/**
 * A transcript as speech bubbles: its timed lines ("[0:12] words") joined into
 * one bubble while the talk runs on, and split where the speaker paused, 1.2s
 * or more. A line's own length is read from its words (about a third of a
 * second a word), never past where the next starts. Lines with no times are
 * split by sentence instead.
 */
export type Bubble = { at: number | null; text: string }

const TIMED = /^\[(?:(\d{1,2}):)?(\d{1,2}):([0-5]\d)\]\s*(.*)$/
const PAUSE = 1.2
/** Seconds a word takes to say, about. */
const WORD = 0.33

export function bubblesOf(lines: string[]): Bubble[] {
  const timed = lines.map((line) => {
    const at = TIMED.exec(line.trim())
    return at ? { at: Number(at[1] ?? 0) * 3600 + Number(at[2]) * 60 + Number(at[3]), text: at[4].trim() } : null
  })
  if (!timed.length || timed.some((one) => !one)) {
    // No times: one bubble a sentence.
    return lines.join(' ').split(/(?<=[.!?])\s+/).map((text) => text.trim()).filter(Boolean).map((text) => ({ at: null, text }))
  }
  const out: Bubble[] = []
  timed.forEach((one, i) => {
    if (!one) return
    const before = timed[i - 1]
    // How long the line before ran: its words' length, never past where this one starts.
    const ran = before ? Math.min(one.at - before.at, before.text.split(/\s+/).length * WORD) : 0
    const pause = before ? one.at - before.at - ran : Infinity
    if (out.length && pause < PAUSE) out[out.length - 1].text += ` ${one.text}`
    else out.push({ at: one.at, text: one.text })
  })
  return out
}
