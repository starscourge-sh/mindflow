import { app, ipcMain } from 'electron'
import { parseHTML } from 'linkedom'
import { fetchOutside, unreached } from './outside'

/**
 * The free sites ⌘K searches and the reader reads: Wikipedia, Wiktionary,
 * Project Gutenberg and the Stanford Encyclopedia of Philosophy. Each is asked
 * only when a person picks its line in ⌘K, with the words typed and nothing
 * else (never a note), through the same guard as every page the app reads.
 */
export const SITES = ['wikipedia', 'wiktionary', 'gutenberg', 'sep'] as const
export type Site = (typeof SITES)[number]
/** One answer: its name, one line about it, the page the reader opens, and its picture where it is free (Commons). */
export type Hit = { title: string; line: string; href: string; picture: string | null }

// The app named as Wikimedia's rules for its APIs ask (a bare "node" was answered 429 every time), and the same for
// Gutenberg's and the Stanford Encyclopedia's.
const AGENT = { 'User-Agent': `Haligtree/${app.getVersion()} (a commonplace book)`, 'Api-User-Agent': 'Haligtree (a commonplace book)' }
const ask = (url: string, wait = 8000): Promise<Response> =>
  fetchOutside(url, { headers: AGENT, signal: AbortSignal.timeout(wait) }).then((response) => {
    if (!response.ok) throw new Error(`${response.status}`)
    return response
  })
/** A site's marked-up words as plain words: its tags gone, its entities read. */
const words = (html: string | null | undefined): string =>
  (parseHTML(`<p>${html ?? ''}</p>`).document.querySelector('p')?.textContent ?? '').replace(/\s+/g, ' ').trim()

/** A picture of an answer, only one on Wikimedia Commons (freely licensed): an English-only file can be fair use. */
async function commons(src: string | null | undefined): Promise<string | null> {
  if (!src || !/^(https:)?\/\/(upload|thumb)\.wikimedia\.org\/wikipedia\/commons\//.test(src)) return null
  try {
    const response = await ask(new URL(src.replace(/\?.*$/, ''), 'https://upload.wikimedia.org').href, 5000)
    const type = (response.headers.get('content-type') ?? '').split(';')[0].trim()
    if (!/^image\//.test(type)) return null
    // Kept as words, so the list draws it at once and no page asks the internet for it.
    return `data:${type};base64,${Buffer.from(await response.arrayBuffer()).toString('base64')}`
  } catch {
    return null
  }
}

/** How many pages a site's search gives ⌘K: the first four, its best (the user, 19 Nov 2026: "only do first four results"). */
const HITS = 4

/** Wikipedia's or Wiktionary's own search: each page's name, its one-line description (else the start of its words), its picture. */
async function mediaWiki(host: string, typed: string): Promise<Hit[]> {
  const found = (await (await ask(`https://${host}/w/rest.php/v1/search/page?q=${encodeURIComponent(typed)}&limit=${HITS}`)).json()) as {
    pages?: { key: string; title: string; excerpt?: string | null; description?: string | null; thumbnail?: { url?: string } | null }[]
  }
  return Promise.all(
    (found.pages ?? []).map(async (page) => ({
      title: page.title,
      line: page.description?.trim() || words(page.excerpt),
      href: `https://${host}/wiki/${page.key.split('/').map(encodeURIComponent).join('/')}`,
      picture: await commons(page.thumbnail?.url)
    }))
  )
}

/** Project Gutenberg's own catalogue (its OPDS feed): each book's title and author, read as one page of the whole book. */
async function gutenberg(typed: string): Promise<Hit[]> {
  const feed = await (await ask(`https://www.gutenberg.org/ebooks/search.opds/?query=${encodeURIComponent(typed)}`, 10000)).text()
  const hits: Hit[] = []
  for (const [entry] of feed.matchAll(/<entry>[\s\S]*?<\/entry>/g)) {
    // A book's entry; the feed's first ones are ways to narrow the search ("Authors", "Subjects").
    const book = /<id>https?:\/\/www\.gutenberg\.org\/ebooks\/(\d+)\.opds<\/id>/.exec(entry)?.[1]
    if (!book) continue
    const title = words(/<title>([\s\S]*?)<\/title>/.exec(entry)?.[1])
    if (title) hits.push({ title, line: words(/<content[^>]*>([\s\S]*?)<\/content>/.exec(entry)?.[1]), href: `https://www.gutenberg.org/cache/epub/${book}/pg${book}-images.html`, picture: null })
    if (hits.length === 8) break
  }
  return hits
}

/** The Stanford Encyclopedia of Philosophy's own search: each entry's title and who wrote it. */
async function sep(typed: string): Promise<Hit[]> {
  const { document } = parseHTML(await (await ask(`https://plato.stanford.edu/search/searcher.py?query=${encodeURIComponent(typed)}`, 10000)).text())
  return [...document.querySelectorAll('.result_listing')]
    .flatMap((one) => {
      const href = one.querySelector('.result_url')?.textContent?.trim() ?? ''
      const title = words(one.querySelector('.result_title')?.innerHTML)
      return /^https:\/\/plato\.stanford\.edu\/entries\/[\w-]+\/?$/.test(href) && title ? [{ title, line: words(one.querySelector('.result_author')?.innerHTML), href, picture: null }] : []
    })
    .slice(0, HITS)
}

/** A page of Wikipedia or Wiktionary, read the wiki's own way below. */
export const isWiki = (at: URL): boolean => /\.(wikipedia|wiktionary)\.org$/.test(at.hostname)

/**
 * A wiki's page before Readability reads it: its "[edit]" marks, skip links
 * and navigation boxes gone. Each heading stood in a box beside its edit
 * link, which Readability took for a box of links and dropped: a page of eight
 * sections kept two, and every one left an "[edit]" line in the column.
 */
export function wikiChrome(page: ReturnType<typeof parseHTML>['document']): void {
  for (const one of [...page.querySelectorAll('.mw-editsection, .mw-jump-link, .navbox')]) one.remove()
}

/** The file a Commons picture's address names: `…/commons/thumb/0/00/Name.png/250px-Name.png` is Name.png. */
const commonsFile = (src: string): string | null => /\/wikipedia\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/?#]+)/.exec(src)?.[1] ?? null

/**
 * A Wikipedia or Wiktionary page's pictures as the reader keeps them: only
 * those on Wikimedia Commons (freely licensed), each credited to its page
 * there, which names who made it and its licence. One held under fair use (an
 * English-only file) goes, and so does the link round a picture to its page on
 * the wiki. A formula drawn by Wikipedia's maths renderer stays as it is.
 */
export function creditCommons(page: ReturnType<typeof parseHTML>['document'], base: URL): void {
  for (const picture of [...page.querySelectorAll('img')]) {
    const src = URL.parse(picture.getAttribute('src') ?? '', base)?.href ?? ''
    if (/^https:\/\/wikimedia\.org\/api\/rest_v1\/media\/math\//.test(src)) continue
    const file = commonsFile(src)
    const link = picture.parentElement?.closest('a')
    const bare = !!link && !link.textContent?.trim()
    // Drawn under 48px (a flag, a logo, a sister project's mark): decoration, not a picture to credit.
    const small = [picture.getAttribute('width'), picture.getAttribute('height')].some((one) => one && Number(one) < 48)
    if (!file || small) {
      // With its caption, which would say nothing without it.
      ;(picture.closest('figure') ?? (bare ? link : picture)).remove()
      continue
    }
    if (bare) link.replaceWith(picture)
    const credit = page.createElement('span')
    credit.setAttribute('data-credit', '')
    const to = page.createElement('a')
    to.setAttribute('href', `https://commons.wikimedia.org/wiki/File:${file}`)
    to.textContent = 'Picture: Wikimedia Commons'
    credit.append(to)
    const caption = picture.closest('figure')?.querySelector('figcaption')
    if (caption) caption.append(credit)
    else picture.after(credit)
  }
}

const SEARCH: Record<Site, (typed: string) => Promise<Hit[]>> = {
  wikipedia: (typed) => mediaWiki('en.wikipedia.org', typed),
  wiktionary: (typed) => mediaWiki('en.wiktionary.org', typed),
  gutenberg,
  sep
}

/** ⌘K asks one site for the words typed: its answers, or that it could not be reached. */
export function registerFreeSites(): void {
  ipcMain.handle('haligtree:free:search', async (_event, site: unknown, typed: unknown) => {
    const asked = typeof typed === 'string' ? typed.replace(/\s+/g, ' ').trim() : ''
    if (!SITES.includes(site as Site) || !asked || asked.length > 200) return { hits: [] }
    try {
      return { hits: await SEARCH[site as Site](asked) }
    } catch {
      // Offline only when the Mac is: a site that turned the asking away, or was slow, did not answer.
      return unreached()
    }
  })
}
