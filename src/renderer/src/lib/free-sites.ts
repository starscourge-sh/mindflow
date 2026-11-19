/**
 * The free sites ⌘K searches when asked and the reader reads (main/free-sites.ts):
 * Wikipedia, Wiktionary, Project Gutenberg and the Stanford Encyclopedia of
 * Philosophy; and Fandom, whose own search ⌘K opens in the browser. `prefix` and a space before the words in ⌘K searches one alone;
 * `pages` says which of a site's links are its own pages, followed in the reader.
 */
/**
 * `name` in full (the preview), `say` as its line in ⌘K names it, `word` at a row's right edge.
 * `asYouType`: its terms let a paid app ask its search as a person types, so “Look things up as I search” may
 * (Wikimedia's API terms ask only that the app name itself, main/free-sites.ts AGENT). Project Gutenberg's are for
 * people only and the Stanford Encyclopedia's for personal use: each is asked once its line is picked.
 * `opens`: never asked by the app at all (Fandom's terms forbid any automated asking without its written leave): its
 * line opens the site's own search, in the browser, where the site builds it.
 */
export type FreeSite = { id: 'wikipedia' | 'wiktionary' | 'gutenberg' | 'sep' | 'fandom'; name: string; say: string; word: string; prefix: string; host: string; pages: RegExp; asYouType?: boolean; opens?: (words: string) => string }
/** A wiki's own pages: its articles and entries, not its files, help, talk or special pages. */
const WIKI_PAGES = /^\/wiki\/(?!(File|Image|Media|Special|Help|Category|Talk|User|Wikipedia|Wiktionary|Portal|Template|Draft|Module|MediaWiki|Appendix|Thesaurus|Citations|Index)(_talk)?:)[^/]/i
export const FREE_SITES: FreeSite[] = [
  { id: 'wikipedia', name: 'Wikipedia', say: 'Wikipedia', word: 'Wikipedia', prefix: 'w', host: 'en.wikipedia.org', pages: WIKI_PAGES, asYouType: true },
  { id: 'wiktionary', name: 'Wiktionary', say: 'Wiktionary', word: 'Wiktionary', prefix: 'wikt', host: 'en.wiktionary.org', pages: WIKI_PAGES, asYouType: true },
  { id: 'gutenberg', name: 'Project Gutenberg', say: 'Project Gutenberg', word: 'Gutenberg', prefix: 'pg', host: 'www.gutenberg.org', pages: /^\/(ebooks\/\d+|cache\/epub\/\d+\/)/ },
  { id: 'sep', name: 'the Stanford Encyclopedia of Philosophy', say: 'the Stanford Encyclopedia', word: 'Stanford Encyclopedia', prefix: 'sep', host: 'plato.stanford.edu', pages: /^\/entries\/[\w-]+/ },
  // No page of it is followed in the reader as one of these sites' own: `pages` matches nothing.
  { id: 'fandom', name: 'Fandom', say: 'Fandom', word: 'Fandom', prefix: 'fan', host: 'www.fandom.com', pages: /(?!)/, opens: (words) => `https://www.fandom.com/?s=${encodeURIComponent(words)}` }
]
/** The sites “Look things up as I search” may ask, ticked in Settings: those whose terms allow it. */
export const AS_YOU_TYPE = FREE_SITES.filter((one) => one.asYouType)

/** One answer to a search: its name, one line about it, the page the reader opens, its free picture (as words) or none. */
export type FreeHit = { title: string; line: string; href: string; picture: string | null }

/** The free site a link is one of the pages of: such a link, followed in an article of the same site, stays in the reader. */
export const freeSiteOf = (href: string | null | undefined): FreeSite | null => {
  const at = href ? URL.parse(href) : null
  return (at && FREE_SITES.find((one) => one.host === at.hostname && one.pages.test(at.pathname))) ?? null
}

/** Words typed after a site's prefix and a space ("w roman empire"): that site alone, and the words. */
export const prefixed = (typed: string): { site: FreeSite; words: string } | null => {
  const found = /^(\S+)\s+(\S.*)$/.exec(typed)
  const site = found && FREE_SITES.find((one) => one.prefix === found[1].toLowerCase())
  return site ? { site, words: found[2].trim() } : null
}
