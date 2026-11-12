import { ipcMain, app } from 'electron'
import { randomUUID } from 'crypto'
import { Readability } from '@mozilla/readability'
import { parseHTML } from 'linkedom'
import { database } from './captures'
import { fetchOutside } from './outside'
import { begin, end } from './jobs'
import { WEB_ARTICLES as TABLE } from './find-files'

/** An article kept from the web: its words and pictures, read offline in the reader. */
export type Article = { id: string; href: string; title: string; byline: string; site: string; published: string; html: string; savedAt: string }

/** What may stay in a kept article: words, lists, tables, quotes, code, pictures and links. Anything else goes, with what it held. */
const DROP = 'script, style, iframe, object, embed, form, input, button, select, textarea, noscript, svg, canvas, video, audio, link, meta'

/**
 * Why a page gave no article, in plain words: the reader says this in its
 * pane, and the link card stays as it was.
 */
const WHY = {
  signIn: 'This page asks you to sign in before it shows its words, so the reader cannot keep it.',
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
    if (response.status === 401 || response.status === 403) return { error: WHY.signIn }
    if (response.status === 402) return { error: WHY.paid }
    if (!response.ok) return { error: WHY.gone }
    if (!/text\/html|application\/xhtml/i.test(response.headers.get('content-type') ?? '')) return { error: WHY.notPage }
    const page = await response.text().catch(() => '')
    if (stop.aborted) return { stopped: true }
    const base = new URL(response.url || href)
    const { document } = parseHTML(page)
    const meta = (name: string): string => document.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.getAttribute('content')?.trim() ?? ''
    const site = meta('og:site_name') || base.hostname.replace(/^www\./, '')
    const paywalled = /"isAccessibleForFree"\s*:\s*(false|"False")/i.test(page)
    const found = new Readability(document as unknown as Document, { charThreshold: 300 }).parse()
    const words = found?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    if (!found?.content || words.length < 300) {
      if (paywalled) return { error: WHY.paid }
      if (/type=["']password["']|sign in to continue|log in to continue/i.test(page)) return { error: WHY.signIn }
      return { error: WHY.script }
    }

    // The cleaned article, with only what reads, every link whole, every picture kept here.
    const { document: clean } = parseHTML(`<!doctype html><html><body>${found.content}</body></html>`)
    for (const one of clean.querySelectorAll(DROP)) one.remove()
    for (const one of clean.querySelectorAll('*')) {
      for (const { name } of [...one.attributes]) {
        if (/^on|^style$|^class$|^id$|^srcset$|^sizes$|^data-|^loading$/i.test(name)) one.removeAttribute(name)
      }
    }
    for (const one of clean.querySelectorAll('a[href]')) {
      const to = URL.parse(one.getAttribute('href') ?? '', base)
      if (to && /^https?:$/.test(to.protocol)) one.setAttribute('href', to.href)
      else one.removeAttribute('href')
    }
    await Promise.all(
      [...clean.querySelectorAll('img')].map(async (one) => {
        const to = URL.parse(one.getAttribute('src') ?? '', base)
        const kept = to && /^https?:$/.test(to.protocol) ? await keep(to.href) : ''
        if (kept.startsWith('haligtree:')) return void one.setAttribute('src', kept)
        // A picture that could not be kept stays a link to it on the site; one on this machine's network goes.
        if (!kept) return void one.remove()
        const link = clean.createElement('a')
        link.setAttribute('href', kept)
        link.textContent = `Picture: ${one.getAttribute('alt')?.trim() || 'on the site'}`
        // On a line of its own where the picture stood, unless it stood inside a line of words already.
        if (one.closest('p, li, figcaption, td, th, h1, h2, h3, h4, h5, h6')) return void one.replaceWith(link)
        const line = clean.createElement('p')
        line.append(link)
        one.replaceWith(line)
      })
    )
    // Readability's own wrappers (a page div, the site's article) unwrapped, so the words sit straight in the reader's column.
    let inner = clean.body as unknown as Element
    while (inner.children.length === 1 && /^(div|article|section|main)$/i.test(inner.children[0].tagName) && [...inner.childNodes].every((node) => node.nodeType === 1 || !(node.textContent ?? '').trim())) inner = inner.children[0]
    const html = inner.innerHTML
    // Stopped while its pictures came: nothing of the article is kept.
    if (stop.aborted) return { stopped: true }
    const id = (db.prepare('select id from web_articles where href = ?').get(href) as { id: string } | undefined)?.id ?? randomUUID()
    db.prepare('insert or replace into web_articles (id, href, title, byline, site, published, html, saved_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run(
      id,
      href,
      // The page's title without the site's name it often trails ("The Essay | Probe Times").
      (meta('og:title') || found.title || base.hostname).replace(new RegExp(`\\s*[|\\-–—:·]\\s*${(found.siteName || site).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i'), '').trim(),
      (found.byline ?? '').trim(),
      (found.siteName || site).trim(),
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
    if (known) return { article: known }
    // “Stop” beside “Reading the page…” (main/jobs.ts): the fetch ends and nothing is kept.
    const name = `article:${href}`
    const stop = begin(name)
    try {
      const done = await read(href, stop)
      return 'id' in done ? { article: kept(href) } : done
    } catch {
      return stop.aborted ? { stopped: true } : { error: WHY.script }
    } finally {
      end(name, stop)
    }
  })
}
