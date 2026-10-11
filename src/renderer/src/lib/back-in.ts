import { interval } from '@/lib/vigil'

/** When something comes back, as a time you would say: "in 9 min", "in 4 days". */
const WORD: Record<string, [string, string]> = { m: ['min', 'min'], h: ['hour', 'hours'], d: ['day', 'days'], w: ['week', 'weeks'], mo: ['month', 'months'], y: ['year', 'years'] }
export function backIn(iso: string): string {
  const [, n, unit] = /^(\d+)(\D+)$/.exec(interval(iso)) ?? []
  return WORD[unit] ? `in ${n} ${WORD[unit][Number(n) === 1 ? 0 : 1]}` : interval(iso)
}
