/**
 * An article's title and its site's name, as the reader keeps them: the title without the site's name it often
 * trails ("Roman Empire - Wikipedia", "The Essay | Probe Times"), and that name as the site where the page states
 * none of its own. A trailing part is the site's only when it is the site's stated name or its address's own
 * ("wikipedia" in en.wikipedia.org), so a title's own part ("Chapter 1: The Beginning") stays whole, and a
 * publisher's legal name ("Wikimedia Foundation, Inc.", which no one calls Wikipedia) is the last resort.
 */
export function articleNames(page: { title: string; siteName: string; publisher: string; hostname: string }): { title: string; site: string } {
  const plain = (words: string): string => words.toLowerCase().replace(/[^a-z0-9]/g, '')
  const host = page.hostname.replace(/^www\./, '')
  const trail = /\s+[|\-–—:·]\s+([^|–—·]{2,40})$/.exec(page.title)?.[1]?.trim() ?? ''
  const owned = !!trail && [page.siteName, page.publisher, host.split('.').slice(-2)[0] ?? ''].some((one) => plain(one).length > 2 && plain(one) === plain(trail))
  const site = (page.siteName || (owned ? trail : '') || page.publisher || host).trim()
  const title = (owned ? page.title.slice(0, page.title.length - trail.length) : page.title)
    // The site's name trailing however it is joined on ("Essay|Probe Times"), as it always was taken off.
    .replace(new RegExp(`\\s*[|\\-\\u2013\\u2014:\\u00b7]\\s*${site.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i'), '')
    .replace(/\s+[|\-–—:·]\s*$/, '')
    .trim()
  return { title: title || host, site }
}
