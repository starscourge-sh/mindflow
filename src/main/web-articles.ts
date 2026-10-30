import { ipcMain, app } from 'electron'
import { randomUUID } from 'crypto'
import type { DatabaseSync } from 'node:sqlite'
import { Readability } from '@mozilla/readability'
import { parseHTML } from 'linkedom'
import { database } from './captures'
import { fetchOutside } from './outside'

/** An article kept from the web: its words and pictures, read offline in the reader. */
export type Article = { id: string; href: string; title: string; byline: string; site: string; published: string; html: string; savedAt: string }

const TABLE = 'create table if not exists web_articles (id text primary key, href text unique not null, title text not null, byline text not null, site text not null, published text not null, html text not null, saved_at text not null)'

/** What may stay in a kept article: words, lists, tables, quotes, code, pictures and links. Anything else goes, with what it held. */
const DROP = 'script, style, iframe, object, embed, form, input, button, select, textarea, noscript, svg, canvas, video, audio, link, meta'

type FoundArticle = { type: 'web'; id: string; number: null; kind: string; status: string; source: string; attribution: string | null; label: string; capturedAt: string; text: string }

/** Every kept article, as ⌘K lists it: found by its title, site and byline. */
export function articlesToFind(db: DatabaseSync): FoundArticle[] {
  db.exec(TABLE)
  const rows = db.prepare('select href, title, byline, site, saved_at as at from web_articles').all() as { href: string; title: string; byline: string; site: string; at: string }[]
  // Its id is the reader's own address for it: the page's link.
  return rows.map((one) => ({ type: 'web', id: one.href, number: null, kind: 'web', status: 'open', source: one.site, attribution: one.site, label: one.title, capturedAt: one.at, text: `${one.title} ${one.site} ${one.byline}`.toLowerCase() }))
}

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

  const read = async (href: string): Promise<{ id: string } | { error: string }> => {
    let response: Response
    try {
      response = await fetchOutside(href, { headers: { 'user-agent': app.userAgentFallback }, signal: AbortSignal.timeout(15000) })
    } catch {
      return { error: WHY.gone }
    }
    if (response.status === 401 || response.status === 403) return { error: WHY.signIn }
    if (response.status === 402) return { error: WHY.paid }
    if (!response.ok) return { error: WHY.gone }
    if (!/text\/html|application\/xhtml/i.test(response.headers.get('content-type') ?? '')) return { error: WHY.notPage }
    const page = await response.text()
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
        if (kept) one.setAttribute('src', kept)
        else one.remove()
      })
    )
    const id = (db.prepare('select id from web_articles where href = ?').get(href) as { id: string } | undefined)?.id ?? randomUUID()
    db.prepare('insert or replace into web_articles (id, href, title, byline, site, published, html, saved_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run(
      id,
      href,
      (found.title || meta('og:title') || base.hostname).trim(),
      (found.byline ?? '').trim(),
      (found.siteName || site).trim(),
      (found.publishedTime || meta('article:published_time') || '').trim(),
      clean.body.innerHTML,
      new Date().toISOString()
    )
    return { id }
  }

  const kept = (href: string): Article | null =>
    (db.prepare('select id, href, title, byline, site, published, html, saved_at as savedAt from web_articles where href = ?').get(href) as Article | undefined) ?? null
  // A page read once is read from the book after that: offline, or after the site changes, it reads as it did.
  ipcMain.handle('article-fetch', async (_event, href: unknown) => {
    if (typeof href !== 'string' || !/^https?:\/\//i.test(href)) return { error: WHY.notPage }
    const known = kept(href)
    if (known) return { article: known }
    try {
      const done = await read(href)
      return 'error' in done ? done : { article: kept(href) }
    } catch {
      return { error: WHY.script }
    }
  })
}
