import { parseHTML } from 'linkedom'
import { Readability } from '@mozilla/readability'
import { articleNames } from './article-names'
import { beforeReading, cleanInParts, type Kept, type Missed } from './article-clean'

/**
 * A page read into an article: parsed, its wiki marks out of the way, read by
 * Mozilla's Readability and cleaned (article-clean.ts). No Electron here: it
 * runs on a thread of its own (article-worker.ts), so a page of hours to read
 * (Fandom's Harry Potter, 386 minutes) never holds main, whose one thread
 * carries every key and click to every window.
 */

/** A page of Wikipedia or Wiktionary, read the wiki's own way below. */
export const isWiki = (at: URL): boolean => /\.(wikipedia|wiktionary)\.org$/.test(at.hostname)

/**
 * A wiki's page before Readability reads it: its "[edit]" marks, skip links
 * and navigation boxes gone. Each heading stood in a box beside its edit
 * link, which Readability took for a box of links and dropped: a page of eight
 * sections kept two, and every one left an "[edit]" line in the column. The
 * wiki's tagline over the words ("From Wikipedia, the free encyclopedia", in
 * #siteSub) and the marks beside the title go too: Readability kept the
 * tagline as the article's first paragraph, under its big first letter. An
 * infobox is marked, so the reader sets it as a box of its own (pdf.css).
 */
export function wikiChrome(page: ReturnType<typeof parseHTML>['document']): void {
  for (const one of [...page.querySelectorAll('.mw-editsection, .mw-jump-link, .navbox, #siteSub, #contentSub, #contentSub2, .mw-indicators, .vector-body-before-content')]) one.remove()
  for (const one of page.querySelectorAll('table.infobox')) one.setAttribute('data-infobox', '')
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

/** Why a page gave no article (web-articles.ts says each in words). */
export type NoArticle = 'paid' | 'signIn' | 'script'
/** The article's words and names, and its pictures still to bring. */
export type Read = { title: string; byline: string; site: string; published: string; html: string; pictures: string[] }

export function readPage(page: string, href: string, url: string): { error: NoArticle } | { read: Read; judge: (at: number, got: Kept | Missed) => string; finish: () => string } {
  const base = new URL(url || href)
  const { document } = parseHTML(page)
  // A wiki's own marks out of the way first, so every section keeps its heading: any MediaWiki's, Fandom's too, whose
  // "[edit]" stood in every heading and its contents; pictures that load as they scroll given their real addresses,
  // and a Fandom infobox kept (article-clean.ts).
  wikiChrome(document)
  beforeReading(document)
  const meta = (name: string): string => document.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.getAttribute('content')?.trim() ?? ''
  // The page's first heading, read before Readability takes the page apart: a name when its titles say only "Home".
  const heading = document.querySelector('h1')?.textContent ?? ''
  const paywalled = /"isAccessibleForFree"\s*:\s*(false|"False")/i.test(page)
  // Its classes kept for now: they say which of a picture's versions a wide window shows, and which links are buttons.
  const found = new Readability(document as unknown as Document, { charThreshold: 300, keepClasses: true }).parse()
  const words = found?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  if (!found?.content || words.length < 300) {
    if (paywalled) return { error: 'paid' }
    if (/type=["']password["']|sign in to continue|log in to continue/i.test(page)) return { error: 'signIn' }
    return { error: 'script' }
  }
  // Wikipedia's and Wiktionary's pictures: Commons' alone, each credited, read from the page as it came (each
  // picture's own size marks), before the cleaning chooses and measures what is left.
  let content = found.content
  if (isWiki(base)) {
    const { document: wiki } = parseHTML(`<!doctype html><html><body>${content}</body></html>`)
    creditCommons(wiki, base)
    content = wiki.body.innerHTML
  }
  // Its title without the site's name it trails, the first of its names that is not only "Home", and the site's own name (article-names.ts).
  const names = articleNames({ titles: [meta('og:title'), found.title ?? '', heading], siteName: meta('og:site_name'), publisher: found.siteName ?? '', hostname: base.hostname })
  // The cleaned article: only what reads, every link whole, and no heading that only repeats its title; its pictures
  // stand-ins until each is kept and measured.
  const site = meta('og:site_name') || base.hostname.replace(/^www\./, '').split('.')[0]
  const parts = cleanInParts(content, base, site, names.title)
  return {
    read: { title: names.title, byline: (found.byline ?? '').trim(), site: names.site, published: (found.publishedTime || meta('article:published_time') || '').trim(), html: parts.html, pictures: parts.pictures },
    judge: parts.judge,
    finish: parts.finish
  }
}
