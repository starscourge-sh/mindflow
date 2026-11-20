import { ipcMain, app, net, type WebContents } from 'electron'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { Readability } from '@mozilla/readability'
import { parseHTML } from 'linkedom'
import { imageSizeFromFile } from 'image-size/fromFile'
import { database } from './captures'
import { fetchOutside } from './outside'
import { begin, end } from './jobs'
import { WEB_ARTICLES as TABLE } from './find-files'
import { articleNames } from './article-names'
import { creditCommons, isWiki, wikiChrome } from './free-sites'
import { beforeReading, cleanInParts, type Kept, type Missed } from './article-clean'
import { assetsDir } from './pictures'

/** An article kept from the web: its words and pictures, read offline in the reader. */
export type Article = { id: string; href: string; title: string; byline: string; site: string; published: string; html: string; savedAt: string }

/**
 * The cleaning an article was kept by, first in its HTML: one kept by an earlier reader is read again when next opened.
 * 4: a wiki's tagline gone at the source, a space held in a span of its own kept ("Followed by"), an infobox marked.
 */
const CLEANING = '<!-- reader 5 -->'
/** A wiki's tagline as an earlier reader kept it, its first paragraph: taken off a kept copy shown as it was (offline). */
const TAGLINE = /<p>\s*From (Wikipedia|Wiktionary), the free (encyclopedia|dictionary)\.?\s*<\/p>/i

/** How long the page has to answer, and each of its pictures (index.ts keepWhy) has 8 seconds. */
const PAGE_WAIT = 15
/** Pictures asked of the site at once, in reading order, so the first ones come first and a site is not flooded. */
const AT_ONCE = 6
/** This many pictures in a row too slow and the site is taken as slow: the rest are said so, not asked. */
const SLOW_RUN = 8

/**
 * Why a page gave no article, in plain words: the reader says this in its
 * pane, and the link card stays as it was.
 */
const WHY = {
  signIn: 'This page asks you to sign in before it shows its words, so the reader cannot keep it.',
  // A site's guard against robots (Cloudflare's "Just a moment…") answers the app's ask with a check only a browser can pass.
  check: 'This site checks that a person is visiting before it shows its words, and the reader cannot pass that check. Open it in your browser.',
  paid: 'This page keeps its words behind a paywall, so the reader cannot keep it.',
  script: 'This page builds its words with scripts as it opens, so there is no article here for the reader to keep.',
  offline: 'This Mac is offline, so the page could not be read. Try again once you are online.',
  gone: 'This page could not be reached. Check the link.',
  missing: 'The site says there is no page at this link.',
  fault: (status: number) => `The site had a fault and sent no page (error ${status}). Try again later.`,
  slow: (host: string) => `${host} did not send the page within ${PAGE_WAIT} seconds. Try again, or open it in your browser.`,
  notPage: 'This link is not a web page the reader can open.'
}

/** A picture being brought, told to the reader that asked: its place's new HTML, or how many are settled of how many. */
type Told = (what: 'article:picture' | 'article:pictures', ...args: unknown[]) => void

/**
 * Reading a page into an article: fetched through the same guard as a card's
 * picture (never this machine or its network), cleaned by Mozilla's
 * Readability, its pictures kept with your notes as a card's are. The words
 * come back as soon as they are read; the pictures come after, each told to
 * the reader as it is settled, and the article is kept whole once they all are.
 */
export function registerWebArticles(keep: (src: string, stop: AbortSignal) => Promise<string | Missed>): void {
  const db = database()
  db.exec(TABLE)
  const save = (one: Article): void =>
    void db.prepare('insert or replace into web_articles (id, href, title, byline, site, published, html, saved_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run(one.id, one.href, one.title, one.byline, one.site, one.published, one.html, one.savedAt)

  /** Pages whose pictures are coming: what they read as now, so a reader opened on one meanwhile shows it and hears the rest. */
  const coming = new Map<string, { article: Article; now: () => string; told: Set<WebContents>; reading: string }>()

  const read = async (href: string, stop: AbortSignal): Promise<{ article: Article; now: () => string; pictures: (tell: Told) => Promise<void> } | { error: string } | { stopped: true }> => {
    let response: Response
    try {
      response = await fetchOutside(href, { headers: { 'user-agent': app.userAgentFallback }, signal: AbortSignal.any([AbortSignal.timeout(PAGE_WAIT * 1000), stop]) })
    } catch (error) {
      if (stop.aborted) return { stopped: true }
      if ((error as Error)?.name === 'TimeoutError') return { error: WHY.slow(URL.parse(href)?.hostname ?? 'The site') }
      return { error: net.isOnline() ? WHY.gone : WHY.offline }
    }
    if (response.status === 401 || response.status === 403) {
      const said = await response.text().catch(() => '')
      return { error: /challenge-platform|cf-chl|cf_chl|<title>Just a moment/i.test(said) ? WHY.check : WHY.signIn }
    }
    if (response.status === 402) return { error: WHY.paid }
    if (response.status === 404 || response.status === 410) return { error: WHY.missing }
    if (response.status >= 500) return { error: WHY.fault(response.status) }
    if (!response.ok) return { error: WHY.gone }
    if (!/text\/html|application\/xhtml/i.test(response.headers.get('content-type') ?? '')) return { error: WHY.notPage }
    let page: string
    try {
      page = await response.text()
    } catch (error) {
      if (stop.aborted) return { stopped: true }
      return { error: (error as Error)?.name === 'TimeoutError' ? WHY.slow(URL.parse(href)?.hostname ?? 'The site') : WHY.gone }
    }
    const base = new URL(response.url || href)
    const { document } = parseHTML(page)
    // A wiki's own marks out of the way first, so every section keeps its heading (free-sites.ts): any MediaWiki's,
    // Fandom's too, whose "[edit]" stood in every heading and its contents; pictures that load as they scroll given
    // their real addresses, and a Fandom infobox kept (article-clean.ts).
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
      if (paywalled) return { error: WHY.paid }
      if (/type=["']password["']|sign in to continue|log in to continue/i.test(page)) return { error: WHY.signIn }
      return { error: WHY.script }
    }

    // Wikipedia's and Wiktionary's pictures: Commons' alone, each credited (free-sites.ts), read from the page as it
    // came (each picture's own size marks), before the cleaning chooses and measures what is left.
    let content = found.content
    if (isWiki(base)) {
      const { document: wiki } = parseHTML(`<!doctype html><html><body>${content}</body></html>`)
      creditCommons(wiki, base)
      content = wiki.body.innerHTML
    }
    // Its title without the site's name it trails, the first of its names that is not only "Home", and the site's own name (article-names.ts).
    const names = articleNames({ titles: [meta('og:title'), found.title ?? '', heading], siteName: meta('og:site_name'), publisher: found.siteName ?? '', hostname: base.hostname })
    // The cleaned article (article-clean.ts): only what reads, every link whole, and no heading that only repeats its
    // title; its pictures stand-ins until each is kept here and measured.
    const site = meta('og:site_name') || base.hostname.replace(/^www\./, '').split('.')[0]
    const parts = cleanInParts(content, base, site, names.title)
    const known = (db.prepare('select id from web_articles where href = ?').get(href) as { id: string } | undefined)?.id
    const article: Article = {
      id: known ?? randomUUID(),
      href,
      title: names.title,
      byline: (found.byline ?? '').trim(),
      site: names.site,
      published: (found.publishedTime || meta('article:published_time') || '').trim(),
      html: parts.html,
      savedAt: new Date().toISOString()
    }
    // A first reading is kept at once, without the cleaning's mark: closed before its pictures come, it is read again.
    if (!known) save(article)
    return {
      article,
      now: () => parts.finish(),
      pictures: async (tell) => {
        const total = parts.pictures.length
        let asked = 0
        let settled = 0
        let slow = 0
        const one = async (at: number): Promise<Kept | Missed> => {
          if (stop.aborted) return { why: 'stopped' }
          if (slow >= SLOW_RUN) return { why: 'slow' }
          const kept = await keep(parts.pictures[at], stop)
          if (typeof kept !== 'string') return (slow = kept.why === 'slow' ? slow + 1 : 0), kept
          slow = 0
          const size = kept.startsWith('haligtree:') ? await imageSizeFromFile(join(assetsDir(), kept.replace(/^haligtree:\/\/assets\//, ''))).catch(() => null) : null
          return { kept, size }
        }
        // Asked in reading order, each settled the moment it arrives: one slow picture holds up none after it.
        const asker = async (): Promise<void> => {
          for (let at = asked++; at < total; at = asked++) {
            tell('article:picture', href, at, parts.judge(at, await one(at)))
            tell('article:pictures', href, ++settled, total)
          }
        }
        tell('article:pictures', href, 0, total)
        await Promise.all(Array.from({ length: Math.min(AT_ONCE, total) }, asker))
        save({ ...article, html: CLEANING + parts.finish() })
      }
    }
  }

  const kept = (href: string): Article | null => {
    const one = db.prepare('select id, href, title, byline, site, published, html, saved_at as savedAt from web_articles where href = ?').get(href) as Article | undefined
    return one ? { ...one, html: one.html.replace(TAGLINE, '') } : null
  }
  // A site's own icon, for an article's card in Home's "Continue reading": asked once a run per site, from here so a
  // site with none (most answer 404) is simply none, and the card keeps its grain cover.
  const icons = new Map<string, Promise<string | null>>()
  ipcMain.handle('haligtree:web:icon', (_event, href: unknown) => {
    const at = typeof href === 'string' ? URL.parse(href) : null
    if (!at || !/^https?:$/.test(at.protocol)) return null
    if (!icons.has(at.origin))
      icons.set(at.origin, fetchOutside(`${at.origin}/favicon.ico`, { signal: AbortSignal.timeout(8000) }).then(async (response) => {
        const type = response.headers.get('content-type') ?? ''
        if (!response.ok || !/^image\//.test(type)) return null
        const bytes = Buffer.from(await response.arrayBuffer())
        return bytes.length ? `data:${type.split(';')[0]};base64,${bytes.toString('base64')}` : null
      }).catch(() => null))
    return icons.get(at.origin)!
  })
  // A page read once is read from the book after that: offline, or after the site changes, it reads as it did.
  // `again` (the reader's "Read again", ⌘R) reads it from the site once more; failing, the copy kept shows, with why.
  ipcMain.handle('article-fetch', async (event, href: unknown, again: unknown) => {
    if (typeof href !== 'string' || !/^https?:\/\//i.test(href)) return { error: WHY.notPage }
    const known = kept(href)
    const name = `article:${href}`
    const now = coming.get(href)
    if (!again && now) return now.told.add(event.sender), { article: { ...now.article, html: now.now() }, reading: now.reading }
    if (!again && known?.html.startsWith(CLEANING)) return { article: known }
    // “Stop” beside “Reading the page…” and beside the pictures coming (main/jobs.ts): every fetch ends, nothing more is asked.
    // One kept by an earlier reader is read again, as this one keeps a page; offline, it reads as it was kept.
    const stop = begin(name)
    try {
      const done = await read(href, stop)
      if (!('article' in done)) {
        end(name, stop)
        return known ? { article: known, ...('error' in done && again ? { error: done.error } : {}) } : done
      }
      const told = new Set([event.sender])
      // Each reading told apart: a reader read again hears nothing of the reading it replaced.
      const reading = { article: done.article, now: done.now, told, reading: randomUUID() }
      const tell: Told = (what, ...args) => told.forEach((to) => !to.isDestroyed() && to.send(what, reading.reading, ...args))
      coming.set(href, reading)
      void done
        .pictures(tell)
        .catch(() => undefined)
        .finally(() => {
          if (coming.get(href) === reading) coming.delete(href)
          end(name, stop)
        })
      return { article: done.article, reading: reading.reading }
    } catch {
      end(name, stop)
      return known ? { article: known } : stop.aborted ? { stopped: true } : { error: WHY.script }
    }
  })
}
