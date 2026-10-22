import { howLong } from '../../../main/dates'
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

/** "5 min", "1 h 30 min", "45 sec": how long a timer is, said back. */
export function lengthSaid(ms: number): string {
  const s = Math.round(ms / 1000)
  return [s >= 60 && howLong(Math.floor(s / 60)), s % 60 && `${s % 60} sec`].filter(Boolean).join(' ')
}

/**
 * Pomodoro rounds said in the box: "4x25" is four 25-minute rounds with a
 * 5-minute break between them, "4x25/5" says the break too. Every fourth
 * round is followed by a long break. The words after it name what the rounds
 * are for. Null for anything else; a round under 5 minutes is not one, so
 * "2x4 lumber" stays a note.
 */
export type Rounds = { rounds: number; workMs: number; breakMs: number; longMs: number; goal: string; span: { from: number; to: number } }
const ROUNDS = /(?:^|\s)((\d{1,2})\s*[x×]\s*(\d{1,3})(?:\s*m(?:in)?)?(?:\s*\/\s*(\d{1,2})(?:\s*m(?:in)?)?)?)(?=\s|$)/i
export function roundsFrom(text: string): Rounds | null {
  const line = text.trim()
  if (!line || line.includes('\n') || line.length > 80) return null
  const said = ROUNDS.exec(line)
  if (!said) return null
  const [rounds, work, rest] = [Number(said[2]), Number(said[3]), said[4] === undefined ? 5 : Number(said[4])]
  if (rounds < 1 || rounds > 12 || work < 5 || work > 180 || rest < 1 || rest > 60) return null
  const from = said.index + said[0].length - said[1].length
  const goal = (line.slice(0, from) + line.slice(from + said[1].length)).replace(/\s+/g, ' ').replace(/^\s*(?:for|of|-|:)\s+/i, '').trim()
  return { rounds, workMs: work * 60_000, breakMs: rest * 60_000, longMs: Math.max(15, rest * 3) * 60_000, goal: goal || 'Focus', span: { from, to: from + said[1].length } }
}

/** Where a set of rounds stands: which round, and whether this stretch is work or a break. */
export type RoundsAt = { rounds: number; round: number; phase: 'work' | 'break' | 'long'; workMs: number; breakMs: number; longMs: number }

/** What comes after this stretch, or null once the last one is over. A long break follows every fourth round. */
export function nextStretch(at: RoundsAt): RoundsAt | null {
  if (at.phase === 'work') {
    if (at.round % 4 === 0) return { ...at, phase: 'long' }
    return at.round >= at.rounds ? null : { ...at, phase: 'break' }
  }
  return at.round >= at.rounds ? null : { ...at, round: at.round + 1, phase: 'work' }
}

/** How long a stretch lasts. */
export const stretchMs = (at: RoundsAt): number => (at.phase === 'work' ? at.workMs : at.phase === 'long' ? at.longMs : at.breakMs)
