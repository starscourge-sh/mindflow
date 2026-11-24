import { isTagWord } from './tag-words.ts'

/** Where a note keeps tags that were added in Properties, not typed into its words. */
export const TAGS_KEY = '_tags'

/**
 * A tag as Properties keeps it: the "#" and the spaces dropped, lower case.
 * "App idea" is app-idea. A word that is not a tag (a number, two words that
 * will not join) is nothing.
 */
export function cleanTag(raw: string): string | null {
  const word = raw.trim().replace(/^#+/, '').replace(/\s+/g, '-').toLowerCase()
  return word && isTagWord(word) ? word : null
}

/** The tags kept on a note apart from its words, in the order they were added. */
export function tagsKept(fields: unknown): string[] {
  let value = fields
  if (typeof value === 'string') {
    try { value = JSON.parse(value) } catch { return [] }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  const raw = (value as Record<string, unknown>)[TAGS_KEY]
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const one of raw) {
    if (typeof one !== 'string') continue
    const tag = cleanTag(one)
    if (tag && !out.includes(tag)) out.push(tag)
  }
  return out
}

/** Word tags first, then any kept in Properties that the words do not already say. */
export function tagsBeside(fromWords: string[], fields: unknown): string[] {
  return [...fromWords, ...tagsKept(fields).filter((tag) => !fromWords.includes(tag))]
}

/**
 * The note's properties with this tag added, as Properties keeps one. The words
 * are not in this. `added` is false when it was already kept, or it is not a tag.
 * A properties value that will not read is left as it was.
 */
export function keptWith(fields: unknown, raw: string): { fields: string | null; added: boolean } {
  const tag = cleanTag(raw)
  const asObject = (value: unknown): Record<string, unknown> | null => {
    if (value == null) return {}
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value) as unknown
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? { ...(parsed as Record<string, unknown>) } : null
      } catch {
        return null
      }
    }
    return typeof value === 'object' && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : null
  }
  const same = typeof fields === 'string' ? fields : fields == null ? null : JSON.stringify(fields)
  const obj = asObject(fields)
  if (!tag || !obj) return { fields: same, added: false }
  const had = tagsKept(obj)
  if (had.includes(tag)) return { fields: Object.keys(obj).length ? JSON.stringify(obj) : null, added: false }
  obj[TAGS_KEY] = [...had, tag]
  return { fields: JSON.stringify(obj), added: true }
}
