/**
 * A timer said in plain words in the box: "5m tea", "timer 25m", "25 min
 * pasta", "set a timer for 1h 30m", "timer tea 10 minutes". Null for anything
 * else, so a note that merely starts with a length ("5 minutes of reading a
 * day is enough") stays a note: without the word "timer", the length comes
 * first and the name after it is a few words at most.
 */
const UNIT = '(h|hrs?|hours?|m|mins?|minutes?|s|secs?|seconds?)'
const LENGTH = new RegExp(`^((?:\\d+(?:\\.\\d+)?\\s*${UNIT}\\s*)+)\\b`, 'i')

const lengthOf = (said: string): number =>
  [...said.matchAll(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${UNIT}`, 'gi'))].reduce((ms, [, n, unit]) => {
    const per = /^h/i.test(unit) ? 3600000 : /^m/i.test(unit) ? 60000 : 1000
    return ms + Number(n) * per
  }, 0)

export function timerFrom(text: string): { ms: number; goal: string; spans: { from: number; to: number }[] } | null {
  const line = text.trim()
  if (!line || line.includes('\n') || line.length > 60) return null
  const asked = /^(?:set\s+a\s+)?timer\b(?:\s+for)?\s*/i.exec(line)
  const rest = asked ? line.slice(asked[0].length) : line
  const skip = asked ? asked[0].length : 0
  // The words that say it is a timer, by where they sit in the trimmed line.
  const spans = asked ? [{ from: 0, to: asked[0].trimEnd().length }] : []
  let length = LENGTH.exec(rest)
  let goal = ''
  if (length) {
    goal = rest.slice(length[0].length)
    spans.push({ from: skip, to: skip + length[0].trimEnd().length })
  } else if (asked) {
    // "timer tea 10 minutes": the length can come last when "timer" said it is one.
    const at = rest.search(new RegExp(`\\d+(?:\\.\\d+)?\\s*${UNIT}\\b`, 'i'))
    if (at < 0) return null
    length = LENGTH.exec(rest.slice(at))
    if (!length) return null
    goal = rest.slice(0, at)
    spans.push({ from: skip + at, to: skip + at + length[0].trimEnd().length })
  } else return null
  goal = goal.replace(/^\s*(?:for|of|-|:)\s+/i, '').replace(/^[-:]\s*/, '').trim()
  // Not said "timer": a short name only, and nothing that reads like a sentence.
  if (!asked && (goal.split(/\s+/).length > 4 || /[.!?,;]/.test(goal))) return null
  const ms = lengthOf(length[1])
  if (ms < 1000 || ms > 24 * 3600000) return null
  // "timer for 10m": one span, when the length follows the word straight on.
  const joined = spans.length === 2 && spans[1].from <= spans[0].to + 1 ? [{ from: 0, to: spans[1].to }] : spans
  return { ms, goal: goal || 'Timer', spans: joined }
}

/** "5 min", "1 h 30 min", "45 s": how long a timer is, said back. */
export function lengthSaid(ms: number): string {
  const s = Math.round(ms / 1000)
  const [h, m, sec] = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
  return [h && `${h} h`, m && `${m} min`, sec && `${sec} s`].filter(Boolean).join(' ')
}
