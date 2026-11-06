import { dateIn } from '../../../../main/task-words.ts'
import dayjs from 'dayjs'

/**
 * A word aim as said: "800", "1.5k words", "800 by Friday", "by Friday, 800
 * words". The words and the day (YYYY-MM-DD), or null when no number of
 * words is given.
 */
export function parseAim(said: string, now = new Date()): { words: number; by: string | null } | null {
  const text = said.trim().toLowerCase()
  const at = text.search(/\bby\b/)
  const head = at < 0 ? text : text.slice(0, at)
  let tail = at < 0 ? '' : text.slice(at + 2)
  // The number before "by"; or, said after the day, the one that ends it with "words".
  let count = head.match(/(\d[\d,.]*)\s*(k)?/)
  if (!count) {
    count = tail.match(/(\d[\d,.]*)\s*(k)?\s*words?\s*$/)
    if (count) tail = tail.slice(0, count.index)
  }
  if (!count) return null
  const words = Math.round(parseFloat(count[1].replace(/,/g, '')) * (count[2] ? 1000 : 1))
  if (!(words > 0) || words > 1_000_000) return null
  const when = tail.trim() ? dateIn(tail.replace(/[,\s]+$/, '').trim(), now) : null
  return { words, by: when ? dayjs(when).format('YYYY-MM-DD') : null }
}
