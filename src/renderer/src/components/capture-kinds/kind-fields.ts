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
  /** A faint example shown while it is empty: never saved. */
  ghost?: string
  /** What it does, in a line on hover, while it is empty. */
  does?: string
  /** Shown only once this other field holds this value, or once it has words of its own. */
  when?: [key: string, value: string]
}

export const KIND_FIELDS: Record<string, Field[]> = {
  note: [],
  todo: [],
  // A long quote is what an excerpt was: where in the book it is.
  quote: [{ key: 'location', label: 'Page or place', placeholder: 'e.g. p. 42, chapter 3' }],
  word: [
    { key: 'definition', label: 'Definition', type: 'long', placeholder: 'What it means', ghost: 'Feeling sad that a happy time has passed', does: 'What the word means, in your own words: the answer when it comes back in review' },
    { key: 'example', label: 'Example', type: 'long', placeholder: 'A sentence it is used in', ghost: 'A wistful look back at the summer', does: 'A sentence that uses it, so you remember how it sounds' },
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
    { key: 'state', label: 'Status', type: 'choice', options: ['Open', 'Deciding', 'Decided'], does: 'Where it stands. Decided dates it and asks you not to argue it again without a new reason' },
    { key: 'call', label: 'The call', placeholder: 'What you decided, in a line', ghost: 'The call: take the job in Leeds', does: 'What you decided, in one line, so you never have to argue it again' },
    { key: 'options', label: 'Options weighed', type: 'long', placeholder: 'What else was on the table', ghost: 'Stay where I am, or ask for a raise', does: 'What else you looked at, so you know it was a real choice' },
    { key: 'working', label: 'Working out', type: 'long', placeholder: 'Pros, cons, and whatever you found out', ghost: 'pros, cons, what you found out', does: 'Your thinking while you decide. Open while Deciding, folded away once Decided' },
    { key: 'reopen', label: 'Reopen only if', type: 'long', placeholder: 'What would have to change to open it again', ghost: 'The rent goes up by more than a third', does: 'The one thing that would make it worth deciding again' },
    { key: 'revisit', label: 'Look again', type: 'date', placeholder: 'Look again on…', ghost: 'in 3 months', does: 'Comes back on this date to check it still holds', suggest: ['in a month', 'in 3 months', 'in 6 months', 'in a year'] },
    { key: 'decidedAt', label: 'Decided on', type: 'hidden' },
    { key: 'heldAt', label: 'Last said it holds', type: 'hidden' }
  ],
  // A try with a finding at the end, never a pass or a fail: what launched
  // it, what it is working out, how long it runs (then it comes back asking
  // what you found), and what came of it, short enough to skim.
  experiment: [
    { key: 'status', label: 'Status', type: 'choice', options: ['Running', 'Finished'], does: 'Running until it ends; Finished asks for the outcome' },
    { key: 'context', label: 'Started by', type: 'link', placeholder: 'A day, a decision or an experiment', ghost: "e.g. Monday's page", does: 'What set it going: a day, a decision or another experiment. Linked both ways' },
    { key: 'question', label: 'Main question', type: 'long', placeholder: 'What are you trying to find out?' },
    { key: 'until', label: 'Run until', type: 'date', placeholder: 'Run until…', ghost: 'in 2 weeks', does: 'Runs until this date, then comes back to ask how it went', suggest: ['in a week', 'in 2 weeks', 'in a month', 'in 3 months'] },
    { key: 'outcome', label: 'Outcome', type: 'long', placeholder: 'What came of it, in a line or two', ghost: 'Slept better on the nights with no phone', does: 'What you found out, short enough to skim later' }
  ]
}

/**
 * What a tag asks for, whatever the note's kind: #book makes any note a book,
 * the way a tag marked "makes a task" makes it a todo.
 */
export const TAG_FIELDS: Record<string, Field[]> = {
  book: [
    { key: 'status', label: 'Status', type: 'choice', options: ['Want to read', 'Reading', 'Finished', 'Dropped'], does: "Where you are with it. The year's books page counts the ones you finish" },
    { key: 'rating', label: 'Rating', type: 'rating', does: "Rate it once you've read it" },
    { key: 'takeaway', label: 'Takeaway', type: 'long', placeholder: 'What you will keep from it', ghost: 'First impressions can be badly wrong', does: 'The one thing you will keep from it, in a line', when: ['status', 'Finished'] }
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
