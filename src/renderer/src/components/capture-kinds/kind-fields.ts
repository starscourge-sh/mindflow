/**
 * What each kind asks for besides its words, in one table: shown in the
 * properties column, saved with the note, and found by search. A kind that
 * asks for nothing has an empty list.
 *
 * A quote's author and source are not here: they are the who and where every
 * capture already has (attribution and medium), asked in the kind's own words
 * by ASKS. These are only what no other kind needs.
 */
export type Field = {
  key: string
  label: string
  /**
   * Text by default; long for a sentence or more, a choice, or 1 to 5 stars.
   * A link holds where another note is (`day:2026-10-05`, `nugget:…`, a
   * capture's id); hidden is kept by the app, never typed.
   */
  type?: 'text' | 'long' | 'choice' | 'rating' | 'link' | 'hidden'
  options?: string[]
  placeholder?: string
}

export const KIND_FIELDS: Record<string, Field[]> = {
  note: [],
  todo: [],
  quote: [],
  word: [
    { key: 'definition', label: 'Definition', type: 'long', placeholder: 'What it means' },
    { key: 'language', label: 'Language', placeholder: 'e.g. French' }
  ],
  link: [
    { key: 'title', label: 'Title', placeholder: "The page's own title" },
    { key: 'site', label: 'Site', placeholder: 'e.g. nytimes.com' }
  ],
  excerpt: [{ key: 'location', label: 'Page or place', placeholder: 'e.g. p. 42, chapter 3' }],
  // A decision's record is there to stop it being argued again: open, being
  // weighed up (the working out folded under it), then decided, and dated.
  decision: [
    { key: 'state', label: 'Status', type: 'choice', options: ['Open', 'Deciding', 'Decided'] },
    { key: 'working', label: 'Working out', type: 'long', placeholder: 'Pros, cons, and whatever you found out' },
    { key: 'revisit', label: 'Look again', placeholder: 'When to check it still holds' },
    { key: 'decidedAt', label: 'Decided on', type: 'hidden' }
  ],
  bit: [],
  book: [
    { key: 'status', label: 'Status', type: 'choice', options: ['Want to read', 'Reading', 'Finished', 'Dropped'] },
    { key: 'rating', label: 'Rating', type: 'rating' }
  ],
  // A try with a finding at the end, never a pass or a fail: what launched
  // it, what it is working out, and what came of it, short enough to skim.
  experiment: [
    { key: 'status', label: 'Status', type: 'choice', options: ['Running', 'Finished'] },
    { key: 'context', label: 'Started by', type: 'link', placeholder: 'A day, a decision or an experiment' },
    { key: 'question', label: 'Main question', type: 'long', placeholder: 'What are you trying to find out?' },
    { key: 'outcome', label: 'Outcome', type: 'long', placeholder: 'What came of it, in a line or two' }
  ]
}

/** The field names a kind has room for: what survives a change of kind. */
export const fieldKeys = (kind: string): string[] => (KIND_FIELDS[kind] ?? []).map((field) => field.key)
