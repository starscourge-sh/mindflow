/**
 * An article's title and its site's name, as the reader keeps them: the title without the site's name it often
 * trails ("Roman Empire - Wikipedia", "The Essay | Probe Times"), and that name as the site where the page states
 * none of its own. A trailing part is the site's only when it is the site's stated name or its address's own
 * ("wikipedia" in en.wikipedia.org), so a title's own part ("Chapter 1: The Beginning") stays whole, and a
 * publisher's legal name ("Wikimedia Foundation, Inc.", which no one calls Wikipedia) is the last resort.
 * A page names itself in several places, asked in turn (its og:title, Readability's title, its first heading): the
 * first that says what the page is wins, so a front page that calls itself only "Home", "Welcome" or the site's own
 * name is named by the next; when none does, the address names it.
 */
export function articleNames(page: { titles: string[]; siteName: string; publisher: string; hostname: string }): { title: string; site: string } {
  const plain = (words: string): string => words.toLowerCase().replace(/[^a-z0-9]/g, '')
  const host = page.hostname.replace(/^www\./, '')
  const titles = page.titles.map((one) => one.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const trailOf = (title: string): string => /\s+[|\-–—:·]\s+([^|–—·]{2,40})$/.exec(title)?.[1]?.trim() ?? ''
  // The site's own names: the one it states, its publisher's, its address's ("notability" in notability.com).
  const own = [page.siteName, page.publisher, host.split('.').slice(-2)[0] ?? ''].map(plain).filter((one) => one.length > 2)
  const owned = (trail: string): boolean => !!trail && own.includes(plain(trail))
  const site = (page.siteName || titles.map(trailOf).find(owned) || page.publisher || host).trim()
  const cut = (title: string): string => {
    const trail = trailOf(title)
    return (owned(trail) ? title.slice(0, title.length - trail.length) : title)
      // The site's name trailing however it is joined on ("Essay|Probe Times"), as it always was taken off.
      .replace(new RegExp(`\\s*[|\\-\\u2013\\u2014:\\u00b7]\\s*${site.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i'), '')
      .replace(/\s+[|\-–—:·]\s*$/, '')
      .trim()
  }
  const says = (title: string): boolean => !!title && !GENERIC.has(plain(title)) && ![...own, plain(site), plain(host)].includes(plain(title))
  return { title: titles.map(cut).find(says) ?? host, site }
}

/** What a front page calls itself in place of a name ("Home page" and "Homepage" read alike once plain). */
const GENERIC = new Set(['home', 'homepage', 'index', 'welcome', 'untitled'])
