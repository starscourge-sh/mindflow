/**
 * A list sorted by any property its notes have: one "By Author" for each
 * property in use (the app's own kept keys left out), each sorting the notes
 * that have it first, by its value: numbers and dates in order, words A to Z.
 */

/** A property's name as it reads anywhere it is shown: its first letter capital ("tags" reads "Tags"); the stored key is never changed. */
export const propSaid = (name: string): string => name.charAt(0).toUpperCase() + name.slice(1)

const KEPT = new Set(['_kept', 'decidedAt', 'heldAt', 'answeredAt', 'rating', 'status'])

const read = (fields: string | null | undefined): Record<string, unknown> => {
  try {
    const value = JSON.parse(fields ?? 'null') as unknown
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export function propertySorts<T extends { fields?: string | null }>(rows: T[], tie: (a: T, b: T) => number): { choices: { id: string; label: string }[]; compare: Record<string, (a: T, b: T) => number> } {
  const names = [...new Set(rows.flatMap((one) => Object.keys(read(one.fields))))].filter((name) => !KEPT.has(name)).sort((a, b) => a.localeCompare(b)).slice(0, 12)
  const compare: Record<string, (a: T, b: T) => number> = {}
  for (const name of names) {
    compare[`prop:${name}`] = (a, b) => {
      const x = read(a.fields)[name]
      const y = read(b.fields)[name]
      const none = (v: unknown): boolean => v === undefined || v === null || v === ''
      if (none(x) || none(y)) return Number(none(x)) - Number(none(y)) || tie(a, b)
      if (typeof x === 'number' && typeof y === 'number') return x - y || tie(a, b)
      return String(x).localeCompare(String(y), undefined, { numeric: true }) || tie(a, b)
    }
  }
  return { choices: names.map((name) => ({ id: `prop:${name}`, label: `By ${propSaid(name)}` })), compare }
}
