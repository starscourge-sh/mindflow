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
   * capture's id); a date is a day, kept as an ISO string, that brings the
   * note back when it comes; hidden is kept by the app, never typed.
   */
  type?: 'text' | 'long' | 'choice' | 'rating' | 'link' | 'date' | 'hidden'
  options?: string[]
  placeholder?: string
  /** For a date: ways to say it, offered before you type. */
  suggest?: string[]
  /** Shown only once this other field holds this value, or once it has words of its own. */
  when?: [key: string, value: string]
}

export const KIND_FIELDS: Record<string, Field[]> = {
  note: [],
  todo: [],
  // A long quote is what an excerpt was: where in the book it is.
  quote: [{ key: 'location', label: 'Page or place', placeholder: 'e.g. p. 42, chapter 3' }],
  word: [
    { key: 'definition', label: 'Definition', type: 'long', placeholder: 'What it means' },
    { key: 'example', label: 'Example', type: 'long', placeholder: 'A sentence it is used in' },
    { key: 'language', label: 'Language', placeholder: 'e.g. French' }
  ],
  link: [
    { key: 'title', label: 'Title', placeholder: "The page's own title" },
    { key: 'site', label: 'Site', placeholder: 'e.g. nytimes.com' }
  ],
  // A decision's record is there to stop it being argued again, not to keep
  // the why: what was decided, what else was weighed, and the one thing that
  // would justify opening it again. On its look-again day it comes back.
  decision: [
    { key: 'state', label: 'Status', type: 'choice', options: ['Open', 'Deciding', 'Decided'] },
    { key: 'call', label: 'The call', placeholder: 'What you decided, in a line' },
    { key: 'options', label: 'Options weighed', type: 'long', placeholder: 'What else was on the table' },
    { key: 'working', label: 'Working out', type: 'long', placeholder: 'Pros, cons, and whatever you found out' },
    { key: 'reopen', label: 'Reopen only if', type: 'long', placeholder: 'What would have to change to open it again' },
    { key: 'revisit', label: 'Look again', type: 'date', placeholder: 'Look again on…', suggest: ['in a month', 'in 3 months', 'in 6 months', 'in a year'] },
    { key: 'decidedAt', label: 'Decided on', type: 'hidden' },
    { key: 'heldAt', label: 'Last said it holds', type: 'hidden' }
  ],
  // A try with a finding at the end, never a pass or a fail: what launched
  // it, what it is working out, how long it runs (then it comes back asking
  // what you found), and what came of it, short enough to skim.
  experiment: [
    { key: 'status', label: 'Status', type: 'choice', options: ['Running', 'Finished'] },
    { key: 'context', label: 'Started by', type: 'link', placeholder: 'A day, a decision or an experiment' },
    { key: 'question', label: 'Main question', type: 'long', placeholder: 'What are you trying to find out?' },
    { key: 'until', label: 'Run until', type: 'date', placeholder: 'Run until…', suggest: ['in a week', 'in 2 weeks', 'in a month', 'in 3 months'] },
    { key: 'outcome', label: 'Outcome', type: 'long', placeholder: 'What came of it, in a line or two' }
  ]
}

/**
 * What a tag asks for, whatever the note's kind: #book makes any note a book,
 * the way a tag marked "makes a task" makes it a todo.
 */
export const TAG_FIELDS: Record<string, Field[]> = {
  book: [
    { key: 'status', label: 'Status', type: 'choice', options: ['Want to read', 'Reading', 'Finished', 'Dropped'] },
    { key: 'rating', label: 'Rating', type: 'rating' },
    { key: 'takeaway', label: 'Takeaway', type: 'long', placeholder: 'What you will keep from it', when: ['status', 'Finished'] }
  ]
}

/** The tags that do something, and what, in a line: said in the box, the Tags page and anywhere else they are explained. */
export const TAG_DOES: Record<string, string> = {
  bit: 'Kept private: blurred in lists, never shown as a hint',
  book: 'A book: adds reading status, a 1 to 5 rating and a takeaway'
}

/** The tags in some words, lower case, once each, as every list reads them. */
export const tagsIn = (text: string): string[] => [...new Set([...text.matchAll(/(?:^|\s)#([a-z][\w-]*)/gi)].map((match) => match[1].toLowerCase()))]

/** The field names a kind has room for: what survives a change of kind. A tag's own stay with the tag. */
export const fieldKeys = (kind: string): string[] => [...(KIND_FIELDS[kind] ?? []), ...Object.values(TAG_FIELDS).flat()].map((field) => field.key)
