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
  /** Text by default; long for a sentence or more, a choice, or 1 to 5 stars. */
  type?: 'text' | 'long' | 'choice' | 'rating'
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
  decision: [
    { key: 'state', label: 'Status', type: 'choice', options: ['Proposed', 'Decided', 'Reversed'] },
    { key: 'revisit', label: 'Look again', placeholder: 'When to check it still holds' }
  ],
  bit: [],
  book: [
    { key: 'status', label: 'Status', type: 'choice', options: ['Want to read', 'Reading', 'Finished', 'Dropped'] },
    { key: 'rating', label: 'Rating', type: 'rating' }
  ]
}

/** The field names a kind has room for: what survives a change of kind. */
export const fieldKeys = (kind: string): string[] => (KIND_FIELDS[kind] ?? []).map((field) => field.key)
