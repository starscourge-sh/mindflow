import { ipcMain, app, net, type WebContents } from 'electron'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { Worker } from 'node:worker_threads'
import { imageSizeFromFile } from 'image-size/fromFile'
import { database } from './captures'
import { fetchOutside } from './outside'
import { begin, end } from './jobs'
import { WEB_ARTICLES as TABLE } from './find-files'
import type { Kept, Missed } from './article-clean'
import type { NoArticle, Read } from './article-read'
import threadFile from './article-worker?modulePath'
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

/** A wait that ends when `stop` does, whatever it waits on (a name looked up, a page's last bytes): none waits forever. */
const until = <T,>(wait: Promise<T>, stop: AbortSignal): Promise<T> =>
  stop.aborted
    ? Promise.reject(stop.reason)
    : new Promise<T>((done, fail) => {
        const quit = (): void => fail(stop.reason)
        stop.addEventListener('abort', quit, { once: true })
        wait.then(done, fail).finally(() => stop.removeEventListener('abort', quit))
      })

/**
 * The page read into an article on a thread of its own (article-worker.ts): a page of hours to read held main for
 * seconds, and every window with it. The thread keeps the article's parts until its pictures are settled: `ask`
 * judges a picture's place or finishes the whole, each answered in the order asked.
 */
function readInThread(page: string, href: string, url: string, stop: AbortSignal): Promise<{ error: NoArticle } | { read: Read; ask: (one: { at: number; got: Kept | Missed } | { finish: true }) => Promise<string>; end: () => void }> {
  const thread = new Worker(threadFile, { workerData: { page, href, url }, name: 'haligtree-article' })
  const waiting: { done: (html: string) => void; fail: (why: Error) => void }[] = []
  let first: ((said: { error: NoArticle } | { read: Read }) => void) | null = null
  let lost: (why: Error) => void = () => undefined
  // Ended or lost, it is asked nothing more: an ask then would wait for an answer that never comes.
  let dead: Error | null = null
  const end = (): void => void ((dead ??= new Error('The reading thread was ended')), thread.terminate())
  const gone = (why: Error): void => ((dead ??= why), lost(why), waiting.splice(0).forEach((one) => one.fail(why)))
  thread.on('message', (said: { error: NoArticle } | { read: Read } | { html: string }) => {
    if ('html' in said) return waiting.shift()?.done(said.html)
    first?.(said)
  })
  thread.on('error', gone)
  thread.on('exit', () => gone(new Error('The reading thread ended')))
  const ask = (one: { at: number; got: Kept | Missed } | { finish: true }): Promise<string> =>
    dead ? Promise.reject(dead) : new Promise((done, fail) => (waiting.push({ done, fail }), thread.postMessage(one)))
  // Stop while the page is parsed ends the thread there; once read, Stop is the pictures' to answer (each said not brought).
  return until(
    new Promise<{ error: NoArticle } | { read: Read }>((done, fail) => ((first = done), (lost = fail))),
    stop
  ).then(
    (said) => ('error' in said ? (end(), said) : { read: said.read, ask, end }),
    (why) => (end(), Promise.reject(why))
  )
}

export function registerWebArticles(keep: (src: string, stop: AbortSignal) => Promise<string | Missed>): void {
  const db = database()
  db.exec(TABLE)
  const save = (one: Article): void =>
    void db.prepare('insert or replace into web_articles (id, href, title, byline, site, published, html, saved_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run(one.id, one.href, one.title, one.byline, one.site, one.published, one.html, one.savedAt)

  /** Pages whose pictures are coming: what they read as now, so a reader opened on one meanwhile shows it and hears the rest. */
  const coming = new Map<string, { article: Article; now: () => Promise<string>; told: Set<WebContents>; reading: string }>()

  const read = async (href: string, stop: AbortSignal): Promise<{ article: Article; now: () => Promise<string>; pictures: (tell: Told) => Promise<void> } | { error: string } | { stopped: true }> => {
    // One wait for the whole page, its name looked up and its last bytes too: the site's 15 seconds, or Stop.
    const wait = AbortSignal.any([AbortSignal.timeout(PAGE_WAIT * 1000), stop])
    const slow = (error: unknown): { error: string } | { stopped: true } | null =>
      stop.aborted ? { stopped: true } : (error as Error)?.name === 'TimeoutError' ? { error: WHY.slow(URL.parse(href)?.hostname ?? 'The site') } : null
    let response: Response
    try {
      response = await until(fetchOutside(href, { headers: { 'user-agent': app.userAgentFallback }, signal: wait }), wait)
    } catch (error) {
      return slow(error) ?? { error: net.isOnline() ? WHY.gone : WHY.offline }
    }
    if (response.status === 401 || response.status === 403) {
      const said = await until(response.text(), wait).catch(() => '')
      return { error: /challenge-platform|cf-chl|cf_chl|<title>Just a moment/i.test(said) ? WHY.check : WHY.signIn }
    }
    if (response.status === 402) return { error: WHY.paid }
    if (response.status === 404 || response.status === 410) return { error: WHY.missing }
    if (response.status >= 500) return { error: WHY.fault(response.status) }
    if (!response.ok) return { error: WHY.gone }
    if (!/text\/html|application\/xhtml/i.test(response.headers.get('content-type') ?? '')) return { error: WHY.notPage }
    let page: string
    try {
      page = await until(response.text(), wait)
    } catch (error) {
      return slow(error) ?? { error: WHY.gone }
    }
    let thread: Awaited<ReturnType<typeof readInThread>>
    try {
      thread = await readInThread(page, href, response.url || href, stop)
    } catch {
      return stop.aborted ? { stopped: true } : { error: WHY.script }
    }
    if ('error' in thread) return { error: WHY[thread.error] }
    const { read: found, ask, end } = thread
    const known = (db.prepare('select id from web_articles where href = ?').get(href) as { id: string } | undefined)?.id
    const article: Article = { id: known ?? randomUUID(), href, title: found.title, byline: found.byline, site: found.site, published: found.published, html: found.html, savedAt: new Date().toISOString() }
    // A first reading is kept at once, without the cleaning's mark: closed before its pictures come, it is read again.
    if (!known) save(article)
    return {
      article,
      now: () => ask({ finish: true }),
      pictures: async (tell) => {
        const total = found.pictures.length
        let asked = 0
        let settled = 0
        let slow = 0
        const one = async (at: number): Promise<Kept | Missed> => {
          if (stop.aborted) return { why: 'stopped' }
          if (slow >= SLOW_RUN) return { why: 'slow' }
          const kept = await keep(found.pictures[at], stop)
          if (typeof kept !== 'string') return (slow = kept.why === 'slow' ? slow + 1 : 0), kept
          slow = 0
          const size = kept.startsWith('haligtree:') ? await imageSizeFromFile(join(assetsDir(), kept.replace(/^haligtree:\/\/assets\//, ''))).catch(() => null) : null
          return { kept, size }
        }
        // Asked in reading order, each settled the moment it arrives: one slow picture holds up none after it.
        const asker = async (): Promise<void> => {
          for (let at = asked++; at < total; at = asked++) {
            tell('article:picture', href, at, await ask({ at, got: await one(at) }))
            tell('article:pictures', href, ++settled, total)
          }
        }
        try {
          tell('article:pictures', href, 0, total)
          await Promise.all(Array.from({ length: Math.min(AT_ONCE, total) }, asker))
          save({ ...article, html: CLEANING + (await ask({ finish: true })) })
        } finally {
          // Its thread lost midway, the reader's "Bringing the pictures…" line is still taken away: no wait is left turning.
          if (settled < total) tell('article:pictures', href, total, total)
          end()
        }
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
    if (!again && now) return now.told.add(event.sender), { article: { ...now.article, html: await now.now().catch(() => now.article.html) }, reading: now.reading }
    // A copy kept shows at once, whatever cleaning kept it: one kept by an earlier reader is said `stale`, and the
    // reader asks for it again behind its words (web-reader.tsx), keeping these if the site will not give it.
    if (!again && known) return { article: known, ...(known.html.startsWith(CLEANING) ? {} : { stale: true }) }
    // “Stop” beside “Reading the page…” and beside the pictures coming (main/jobs.ts): every fetch ends, nothing more is asked.
    // Asked `again` (Read again, or the reader renewing a stale copy): failing, the copy kept stays, with why.
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
