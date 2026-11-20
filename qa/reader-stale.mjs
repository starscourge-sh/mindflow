// A kept article read by an earlier reader (its cleaning mark older than web-articles.ts CLEANING) opens with its words
// at once, and is read again from the site behind them (the user, 20 Nov 2026: a kept Fandom article sat on "Reading the
// page… Stop" with an empty page after the cleaning changed). On a saved Fandom page served from the main process's
// fetch, never the live site, each kept copy is opened while the site (i) answers slowly, (ii) answers Cloudflare's
// check, (iii) never answers, (iv) answers at once (the new cleaning swaps in, and the main process is never held long
// by the reading of a 386-minute page); and a window reloaded mid-reading opens the copy at once again.
//   QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/reader-stale.mjs
import { mkdirSync } from 'fs'
import { join } from 'path'
import { DatabaseSync } from 'node:sqlite'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
import { fandomPage, png } from './fandom-page.mjs'
process.env.QA_ARGS ??= '--sandbox'

const SITE = 'https://93.184.216.34'
const CDN = 'https://93.184.216.35'
const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.QA_SHOTS ?? '/tmp'
mkdirSync(shots, { recursive: true })
const errors = []
h.on('pageerror', (e) => errors.push(String(e)))
const open = (href) => h.evaluate((href) => window.dispatchEvent(new CustomEvent('haligtree:web', { detail: { href } })), href)
const look = () => h.evaluate(() => {
  const body = document.querySelector('[data-pane-front] .web-reader-body') ?? document.querySelector('.web-reader-body')
  return {
    text: body?.textContent ?? '',
    title: document.querySelector('.web-reader-heading')?.textContent ?? '',
    reading: !!document.querySelector('.web-reader-reading'),
    failed: document.querySelector('.web-reader-failed-lead')?.textContent ?? '',
    toast: (window.__said ?? []).join(' | ')
  }
})
const until = async (test, ms) => {
  const end = Date.now() + ms
  for (;;) {
    const now = await look()
    if (test(now) || Date.now() > end) return now
    await wait(50)
  }
}
const PAGES = { Harry_Potter: 120, Slow: 20, Check: 20, Hang: 20, Reload: 20 }
try {
  // The site's stand-in: each page answers as its mode says; pictures at once.
  await electron.evaluate((_, [site, cdn, pages, pic]) => {
    globalThis.__realFetch ??= globalThis.fetch
    globalThis.__stale = { pages, mode: {}, asked: {} }
    const held = (signal) => new Promise((_, reject) => signal?.addEventListener('abort', () => reject(signal.reason)))
    globalThis.fetch = async (input, init) => {
      const url = String(input instanceof URL ? input.href : (input?.url ?? input))
      const net = globalThis.__stale
      if (url.startsWith(site + '/')) {
        const name = new URL(url).pathname.replace('/wiki/', '')
        net.asked[name] = (net.asked[name] ?? 0) + 1
        const mode = net.mode[name] ?? 'fine'
        if (mode === 'hang') return held(init?.signal)
        if (mode === 'check') return new Response('<!doctype html><html><head><title>Just a moment...</title></head><body><script src="/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1"></script></body></html>', { status: 403, headers: { 'content-type': 'text/html' } })
        if (mode === 'slow') await new Promise((go) => setTimeout(go, 5000))
        return new Response(net.pages[name].replace('</main>', `<p>A new paragraph the site added after the copy was kept, long enough to be part of the article and read as one, in ${name}.</p></main>`), { headers: { 'content-type': 'text/html; charset=utf-8' } })
      }
      if (!url.startsWith(cdn + '/')) return globalThis.__realFetch(input, init)
      return new Response(Buffer.concat([Buffer.from(pic, 'base64'), Buffer.from(url)]), { headers: { 'content-type': 'image/png' } })
    }
    // How long the main process's thread is held at a time: a 10ms tick that comes late was held that long.
    globalThis.__held = { worst: 0, last: performance.now() }
    setInterval(() => {
      const now = performance.now()
      globalThis.__held.worst = Math.max(globalThis.__held.worst, now - globalThis.__held.last - 10)
      globalThis.__held.last = now
    }, 10)
  }, [SITE, CDN, Object.fromEntries(Object.entries(PAGES).map(([name, sections]) => [name, fandomPage({ site: SITE, cdn: CDN, sections }).replaceAll('Harry Potter', name.replace('_', ' '))])), png(70, 110, 150, 500, 360)])
  await c.v('settings:set', { sounds: false, hintRate: 0, motion: false })

  // Each page kept by the earlier reader: its old cleaning's mark, and words the site no longer has.
  await open(`${SITE}/wiki/Reload`) // the table is made as the reader first asks
  await until((now) => now.text.length > 0, 15000)
  const db = new DatabaseSync(join(process.env.QA_DATA, 'sandbox', 'haligtree.db'))
  db.exec('pragma busy_timeout = 5000')
  const stale = () => {
    for (const name of Object.keys(PAGES)) {
      const href = `${SITE}/wiki/${name}`
      db.prepare('delete from web_articles where href = ?').run(href)
      db.prepare('insert into web_articles (id, href, title, byline, site, published, html, saved_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run(`stale-${name}`, href, name.replace('_', ' '), '', 'Harry Potter Wiki', '', `<!-- reader 4 --><p>The kept copy of ${name}, as the earlier reader kept it. ${'Its words read offline, every one of them still here. '.repeat(20)}</p>`, '2026-11-01T10:00:00.000Z')
    }
  }
  stale()
  await electron.evaluate(() => (globalThis.__held.worst = 0))

  const opened = async (name, mode) => {
    await electron.evaluate((_, [name, mode]) => (globalThis.__stale.mode[name] = mode), [name, mode])
    await h.evaluate(() => {
      window.__said = []
      window.__heard ??= addEventListener('haligtree:said', (event) => window.__said.push(event.detail.text)) ?? true
      window.__sawLoader = false
      window.__loaderWatch ??= new MutationObserver(() => document.querySelector('.web-reader-reading') && (window.__sawLoader = true))
      window.__loaderWatch.observe(document.body, { subtree: true, childList: true })
    })
    const at = Date.now()
    await open(`${SITE}/wiki/${name}`)
    const first = await until((now) => now.text.includes(`kept copy of ${name}`) || now.text.includes(`added after the copy was kept`) || !!now.failed, 20000)
    // From the words on, the loader never comes back (before them, the reader's first frame is its loader, for a few ms).
    await h.evaluate(() => (window.__sawLoader = false))
    return { first, took: Date.now() - at }
  }
  const fresh = (name) => (now) => now.text.includes(`added after the copy was kept, long enough to be part of the article and read as one, in ${name}`)

  // (iv) The site answers: the kept words at once, then the new cleaning in their place, the thread never held long.
  {
    const { first, took } = await opened('Harry_Potter', 'fine')
    check('a kept copy opens with its words in the first second (site answers)', first.text.includes('kept copy of Harry_Potter') && took < 1000, JSON.stringify({ took, start: first.text.slice(0, 60), failed: first.failed }))
    const swapped = await until(fresh('Harry_Potter'), 20000)
    check('the new reading swaps in when it is read, with no loader on the way', fresh('Harry_Potter')(swapped) && !(await h.evaluate(() => window.__sawLoader)), JSON.stringify({ words: swapped.text.length, loader: await h.evaluate(() => window.__sawLoader) }))
    const held = await electron.evaluate(() => Math.round(globalThis.__held.worst))
    console.log(`  main thread held at most ${held} ms while the 386-minute page was read`)
    check('reading a 386-minute page never holds the main process 200 ms or more', held < 200, `${held} ms`)
    await h.screenshot({ path: `${shots}/stale-fine.png` })
  }
  // (i) The site answers slowly: the kept words at once, the new ones when they come.
  {
    const { first, took } = await opened('Slow', 'slow')
    check('a kept copy opens with its words in the first second (site slow)', first.text.includes('kept copy of Slow') && took < 1000, JSON.stringify({ took, failed: first.failed }))
    const swapped = await until(fresh('Slow'), 15000)
    check('the slow site\'s new reading swaps in once it comes', fresh('Slow')(swapped), swapped.text.slice(0, 80))
  }
  // (ii) Cloudflare's check: the kept copy stays, with a quiet notice saying why.
  {
    const { first, took } = await opened('Check', 'check')
    check('a kept copy opens with its words in the first second (Cloudflare check)', first.text.includes('kept copy of Check') && took < 1000, JSON.stringify({ took, failed: first.failed }))
    const said = await until((now) => /checks that a person is visiting/.test(now.toast), 5000)
    check('the check keeps the kept copy, said quietly', said.text.includes('kept copy of Check') && /checks that a person is visiting/.test(said.toast) && !said.failed, JSON.stringify({ toast: said.toast, failed: said.failed }))
    await h.screenshot({ path: `${shots}/stale-check.png` })
  }
  // (iii) A site that never answers: the kept copy at once, and after its 15 seconds it stays, said quietly.
  {
    const { first, took } = await opened('Hang', 'hang')
    check('a kept copy opens with its words in the first second (site hangs)', first.text.includes('kept copy of Hang') && took < 1000, JSON.stringify({ took, failed: first.failed }))
    const said = await until((now) => /did not send the page within 15 seconds/.test(now.toast), 19000)
    check('a site that never answers leaves the kept copy, said after 15 seconds', said.text.includes('kept copy of Hang') && /did not send the page within 15 seconds/.test(said.toast) && !said.reading, JSON.stringify({ toast: said.toast, reading: said.reading }))
  }
  // A window reloaded mid-reading (as a restart does): the kept copy at once again, then the new reading.
  {
    await electron.evaluate(() => (globalThis.__stale.mode.Reload = 'slow'))
    await open(`${SITE}/wiki/Reload`)
    await until((now) => now.text.includes('kept copy of Reload'), 3000)
    await h.reload()
    await h.waitForLoadState('domcontentloaded')
    await wait(1500)
    const { first, took } = await opened('Reload', 'fine')
    check('reloaded mid-reading, the kept copy opens at once again', (first.text.includes('kept copy of Reload') || fresh('Reload')(first)) && took < 1000 && !first.reading, JSON.stringify({ took, reading: first.reading, failed: first.failed }))
    const swapped = await until(fresh('Reload'), 15000)
    check('and the new reading still comes after the reload', fresh('Reload')(swapped), swapped.text.slice(0, 80))
  }
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error))
} finally {
  await c.close?.()
  done()
}
