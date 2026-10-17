/**
 * Whose words a thing is, in three voices:
 * - theirs: what they said, word for word (a quote, an excerpt, or words marked "p131");
 * - understood: what you understood they said (a gem with a source, or words marked "(p131)");
 * - mine: what you said (a note, a decision, a gem with no source).
 * Shared by the main side and the window, so lists, the editor and the
 * source pages all colour the same thing the same way.
 */
export type Voice = 'theirs' | 'understood' | 'mine'

/** A page reference: "p131" or "p. 131" is a direct quote, "(p131)" a paraphrase. */
export type PageRef = { page: string; direct: boolean }

/** The page reference at the end of some words, or in a page field by itself. */
export function pageRef(text: string | null | undefined): PageRef | null {
  const words = (text ?? '').trim()
  const wrapped = /\(\s*pp?\.?\s*(\d+(?:\s*[-–]\s*\d+)?)\s*\)\s*$/i.exec(words)
  if (wrapped) return { page: wrapped[1].replace(/\s+/g, ''), direct: false }
  const bare = /(?:^|[\s,;])pp?\.?\s*(\d+(?:\s*[-–]\s*\d+)?)\s*$/i.exec(words)
  return bare ? { page: bare[1].replace(/\s+/g, ''), direct: true } : null
}

export function voiceOf(item: { type?: string; kind: string; attribution?: string | null; medium?: string | null; label?: string; location?: string | null }): Voice {
  const sourced = !!(item.attribution?.trim() || item.medium?.trim())
  const ref = pageRef(item.location) ?? pageRef(item.label)
  if (sourced && ref) return ref.direct ? 'theirs' : 'understood'
  if (item.kind === 'quote' || item.kind === 'excerpt') return 'theirs'
  // A gem with a source is your reading of them; with none, it is a note of your own.
  if (item.type === 'nugget' && sourced) return 'understood'
  return 'mine'
}

/** What each voice is called wherever it is explained. */
export const VOICE_SAID: Record<Voice, string> = {
  theirs: 'Their words',
  understood: 'What I understood',
  mine: 'My words'
}
