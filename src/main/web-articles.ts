import { ipcMain, app } from 'electron'
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
import { cleanArticle } from './article-clean'
import { assetsDir } from './pictures'

/** An article kept from the web: its words and pictures, read offline in the reader. */
export type Article = { id: string; href: string; title: string; byline: string; site: string; published: string; html: string; savedAt: string }

/** The cleaning an article was kept by, first in its HTML: one kept by an earlier reader is read again when next opened. */
const CLEANING = '<!-- reader 2 -->'

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
  gone: 'This page could not be reached. Check the link, or try again once you are online.',
  notPage: 'This link is not a web page the reader can open.'
}

/**
 * Reading a page into an article: fetched through the same guard as a card's
 * picture (never this machine or its network), cleaned by Mozilla's
 * Readability, its pictures kept with your notes as a card's are.
 */
export function registerWebArticles(keep: (src: string) => Promise<string>): void {
  const db = database()
  db.exec(TABLE)

  const read = async (href: string, stop: AbortSignal): Promise<{ id: string } | { error: string } | { stopped: true }> => {
    let response: Response
    try {
      response = await fetchOutside(href, { headers: { 'user-agent': app.userAgentFallback }, signal: AbortSignal.any([AbortSignal.timeout(15000), stop]) })
    } catch {
      return stop.aborted ? { stopped: true } : { error: WHY.gone }
    }
    if (response.status === 401 || response.status === 403) {
      const said = await response.text().catch(() => '')
      return { error: /challenge-platform|cf-chl|cf_chl|<title>Just a moment/i.test(said) ? WHY.check : WHY.signIn }
    }
    if (response.status === 402) return { error: WHY.paid }
    if (!response.ok) return { error: WHY.gone }
    if (!/text\/html|application\/xhtml/i.test(response.headers.get('content-type') ?? '')) return { error: WHY.notPage }
    const page = await response.text().catch(() => '')
    if (stop.aborted) return { stopped: true }
    const base = new URL(response.url || href)
    const { document } = parseHTML(page)
    // A wiki's own marks out of the way first, so every section keeps its heading (free-sites.ts).
    if (isWiki(base)) wikiChrome(document)
    const meta = (name: string): string => document.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.getAttribute('content')?.trim() ?? ''
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
    // The cleaned article (article-clean.ts): only what reads, every link whole, every picture kept here and measured.
    const site = meta('og:site_name') || base.hostname.replace(/^www\./, '').split('.')[0]
    const html = CLEANING + (await cleanArticle(content, base, site, async (src) => {
      const kept = await keep(src)
      const size = kept.startsWith('haligtree:') ? await imageSizeFromFile(join(assetsDir(), kept.replace(/^haligtree:\/\/assets\//, ''))).catch(() => null) : null
      return { kept, size }
    }))
    // Stopped while its pictures came: nothing of the article is kept.
    if (stop.aborted) return { stopped: true }
    // Its title without the site's name it trails, and the site's own name (article-names.ts).
    const names = articleNames({ title: meta('og:title') || found.title || base.hostname, siteName: meta('og:site_name'), publisher: found.siteName ?? '', hostname: base.hostname })
    const id = (db.prepare('select id from web_articles where href = ?').get(href) as { id: string } | undefined)?.id ?? randomUUID()
    db.prepare('insert or replace into web_articles (id, href, title, byline, site, published, html, saved_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run(
      id,
      href,
      names.title,
      (found.byline ?? '').trim(),
      names.site,
      (found.publishedTime || meta('article:published_time') || '').trim(),
      html,
      new Date().toISOString()
    )
    return { id }
  }

  const kept = (href: string): Article | null =>
    (db.prepare('select id, href, title, byline, site, published, html, saved_at as savedAt from web_articles where href = ?').get(href) as Article | undefined) ?? null
  // A site's own icon, for an article's card in Home's "Continue reading": asked once a run per site, from here so a
  // site with none (most answer 404) is simply none, and the card keeps its grain cover.
  const icons = new Map<string, Promise<string | null>>()
  ipcMain.handle('haligtree:web:icon', (_event, href: unknown) => {
    const at = typeof href === 'string' ? URL.parse(href) : null
    if (!at || !/^https?:$/.test(at.protocol)) return null
    if (!icons.has(at.origin))
      icons.set(at.origin, fetchOutside(`${at.origin}/favicon.ico`).then(async (response) => {
        const type = response.headers.get('content-type') ?? ''
        if (!response.ok || !/^image\//.test(type)) return null
        const bytes = Buffer.from(await response.arrayBuffer())
        return bytes.length ? `data:${type.split(';')[0]};base64,${bytes.toString('base64')}` : null
      }).catch(() => null))
    return icons.get(at.origin)!
  })
  // A page read once is read from the book after that: offline, or after the site changes, it reads as it did.
  ipcMain.handle('article-fetch', async (_event, href: unknown) => {
    if (typeof href !== 'string' || !/^https?:\/\//i.test(href)) return { error: WHY.notPage }
    const known = kept(href)
    if (known?.html.startsWith(CLEANING)) return { article: known }
    // “Stop” beside “Reading the page…” (main/jobs.ts): the fetch ends and nothing is kept.
    // One kept by an earlier reader is read again, as this one keeps a page; offline, it reads as it was kept.
    const name = `article:${href}`
    const stop = begin(name)
    try {
      const done = await read(href, stop)
      return 'id' in done ? { article: kept(href) } : known ? { article: known } : done
    } catch {
      return known ? { article: known } : stop.aborted ? { stopped: true } : { error: WHY.script }
    } finally {
      end(name, stop)
    }
  })
}
