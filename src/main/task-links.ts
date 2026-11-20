/**
 * A task named by a link, kept as a bookmark: the address comes out of its name and is kept beside it, and the name is
 * the person's own words, or, with none, the page's title once it is fetched (the site and path until then).
 * Shared by main (making and renaming a task) and the window (the address under a task's name).
 */

/** A web address in a task's words: with its scheme, or starting www. */
const ADDRESS = /(?:https?:\/\/|www\.)[^\s<>"']+/i

/**
 * The first web address in a task's words, and the words with it blanked out (to the same length, so places kept in
 * them still point at the same words). No address: the words as they were and no href.
 */
export function linkOut(text: string): { text: string; href: string | null } {
  const found = ADDRESS.exec(text)
  if (!found) return { text, href: null }
  // A sentence's last mark is not the address's: "watch https://x.com/a." links x.com/a.
  const raw = found[0].replace(/[.,;:!?)\]]+$/, '')
  const href = /^www\./i.test(raw) ? `https://${raw}` : raw
  if (!URL.canParse(href)) return { text, href: null }
  return { text: text.slice(0, found.index) + ' '.repeat(raw.length) + text.slice(found.index + raw.length), href }
}

/** The words left once the address is out: spaces closed up, and no dash or colon left hanging at either end (nor a stop the address ended on). */
export const wordsLeft = (text: string): string => text.replace(/\s+/g, ' ').trim().replace(/^[\s\-\u2013\u2014:|,\u00b7]+|[\s\-\u2013\u2014:|,.\u00b7]+$/g, '').trim()

/** A path's words as they read, or as they are when they are not escapes. */
const plainly = (path: string): string => {
  try {
    return decodeURIComponent(path)
  } catch {
    return path
  }
}

/** Where a link goes, said quietly: the site and its path, never the query ("youtu.be · hi8meiPUt84"). */
export function linkName(href: string): string {
  const at = URL.parse(href)
  if (!at) return href
  const site = at.hostname.replace(/^www\./, '')
  // A YouTube watch page is named by its video, which is all its path says.
  const video = /(^|\.)youtube\.com$/.test(at.hostname) && at.pathname === '/watch' ? at.searchParams.get('v') : null
  const path = video ?? plainly(at.pathname).replace(/^\/+|\/+$/g, '')
  return path ? `${site} · ${path}` : site
}

/** The address as it is shown under the name: no scheme, no query, no last slash. */
export const linkShown = (href: string): string => {
  const at = URL.parse(href)
  return at ? `${at.hostname.replace(/^www\./, '')}${plainly(at.pathname).replace(/\/$/, '')}` : href
}
