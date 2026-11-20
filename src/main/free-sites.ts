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

type WikiPage = { key: string; title: string; excerpt?: string | null; description?: string | null; thumbnail?: { url?: string } | null }

/**
 * Wikipedia's or Wiktionary's own search, as its search box answers (the user, 20 Nov 2026: "Thought you said wiki can
 * autocomplete and guess?"): its title autocomplete first, the prefix search that forgives spelling ("serendipit" and
 * "serendipty" both find Serendipity), then its full-text search's pages to fill the four where titles give fewer.
 * Each page's name, its one-line description (else the start of its words), its picture. Nothing found by either:
 * the search's own "Did you mean", the words it would try instead.
 */
async function mediaWiki(host: string, typed: string): Promise<{ hits: Hit[]; suggest?: string }> {
  const q = encodeURIComponent(typed)
  const pages = (kind: 'title' | 'page'): Promise<WikiPage[]> =>
    ask(`https://${host}/w/rest.php/v1/search/${kind}?q=${q}&limit=${HITS}`).then(async (response) => ((await response.json()) as { pages?: WikiPage[] }).pages ?? [])
  // Asked together, so the four come no later than the slower of the two; titles failing alone still leave the words' pages.
  const [titles, text] = await Promise.all([pages('title').catch((): WikiPage[] => []), pages('page')])
  const inText = new Map(text.map((page) => [page.key, page]))
  const seen = new Set<string>()
  const chosen = [...titles, ...text].filter((page) => !seen.has(page.key) && !!seen.add(page.key)).slice(0, HITS)
  if (!chosen.length) return { hits: [], suggest: await didYouMean(host, q) }
  const hits = await Promise.all(
    chosen.map(async (page) => {
      // A title's own excerpt is only its title again: its words come from the full-text search, where that found it too.
      const found = inText.get(page.key)
      return {
        title: page.title,
        line: page.description?.trim() || found?.description?.trim() || (found ? words(found.excerpt) : ''),
        href: `https://${host}/wiki/${page.key.split('/').map(encodeURIComponent).join('/')}`,
        picture: await commons(page.thumbnail?.url ?? found?.thumbnail?.url)
      }
    })
  )
  return { hits }
}

/** The search's own "Did you mean": the words it would try instead, or none (it has none, or did not say in time). */
async function didYouMean(host: string, q: string): Promise<string | undefined> {
  try {
    const found = (await (await ask(`https://${host}/w/api.php?action=query&list=search&srsearch=${q}&srinfo=suggestion&srlimit=1&srprop=&format=json&formatversion=2`, 5000)).json()) as {
      query?: { searchinfo?: { suggestion?: string } }
    }
    return found.query?.searchinfo?.suggestion?.trim() || undefined
  } catch {
    return undefined
  }
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

const SEARCH: Record<Site, (typed: string) => Promise<{ hits: Hit[]; suggest?: string }>> = {
  wikipedia: (typed) => mediaWiki('en.wikipedia.org', typed),
  wiktionary: (typed) => mediaWiki('en.wiktionary.org', typed),
  gutenberg: async (typed) => ({ hits: await gutenberg(typed) }),
  sep: async (typed) => ({ hits: await sep(typed) })
}

/** ⌘K asks one site for the words typed: its answers (and, with none, its "Did you mean"), or that it could not be reached. */
export function registerFreeSites(): void {
  ipcMain.handle('haligtree:free:search', async (_event, site: unknown, typed: unknown) => {
    const asked = typeof typed === 'string' ? typed.replace(/\s+/g, ' ').trim() : ''
    if (!SITES.includes(site as Site) || !asked || asked.length > 200) return { hits: [] }
    try {
      return await SEARCH[site as Site](asked)
    } catch {
      // Offline only when the Mac is: a site that turned the asking away, or was slow, did not answer.
      return unreached()
    }
  })
}
