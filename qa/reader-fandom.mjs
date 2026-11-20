// The web reader on a Fandom page (asks 56 and 61, 18 Nov 2026: "is this stuck? and what happens if i want to maybe
// reload?", "threw away the harry potter image?"). A saved Fandom page (qa/fandom-page.mjs: its infobox, sixty lazy
// pictures) is served from the main process's fetch at addresses on the internet, never the live site, so the guard
// in fetchOutside still runs. It checks: the words show while the pictures still come, each picture fills its place
// (the infobox's and the lazy ones), one the site refuses or is too slow for is said so plainly, "Stop" stops both
// waits, a page that never answers says so in words, and the page is read again by the bar's button, ⌘R and the menu.
//   QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/reader-fandom.mjs
import { mkdirSync } from 'fs'
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
const errors = []
h.on('pageerror', (e) => errors.push(String(e)))
const net = (patch) => electron.evaluate((_, p) => Object.assign(globalThis.__fandom, p), patch)
const open = (href) => h.evaluate((href) => window.dispatchEvent(new CustomEvent('haligtree:web', { detail: { href } })), href)
/** The reader in front, as a person sees it. */
const look = () => h.evaluate(() => {
  const body = document.querySelector('.web-reader-body')
  return {
    words: body?.textContent?.length ?? 0,
    waiting: body?.querySelectorAll('img[data-wait]').length ?? -1,
    // A picture still coming takes no room: never a broken picture or an empty box.
    boxes: [...(body?.querySelectorAll('img[data-wait]') ?? [])].filter((one) => one.getBoundingClientRect().height > 0).length,
    shown: [...(body?.querySelectorAll('img:not([data-wait])') ?? [])].filter((one) => one.complete && one.naturalWidth > 0 && /^haligtree:/.test(one.getAttribute('src') ?? '')).length,
    coming: document.querySelector('[data-web-coming]')?.textContent ?? '',
    reading: document.querySelector('.web-reader-reading')?.textContent ?? '',
    failed: document.querySelector('.web-reader-failed-lead')?.textContent ?? '',
    // A picture not brought is a quiet line of the app's own where it stood (article-clean.ts MISSED), its caption kept under it.
    lines: [...(body?.querySelectorAll('[data-missed]') ?? [])].map((one) => `${one.textContent}${one.closest('figure')?.querySelector('figcaption') ? ` / ${one.closest('figure').querySelector('figcaption').textContent}` : ''}`)
  }
})
/** Looked at every 50ms until `test` holds; with `film`, each look's frame kept too, to read by eye. */
let frame = 0
const until = async (test, ms, film = '') => {
  const end = Date.now() + ms
  for (;;) {
    const now = await look()
    if (film) await h.screenshot({ path: `${shots}/frames/${film}-${String(frame++).padStart(3, '0')}.png` })
    if (test(now) || Date.now() > end) return now
    await wait(50)
  }
}
/** The theme, as Settings sets it (qa/reader-theme.mjs). */
const theme = (name) => h.evaluate((name) => { localStorage.setItem('theme', name); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }, name)
mkdirSync(`${shots}/frames`, { recursive: true })
try {
  await electron.evaluate((_, [site, cdn, pages, pic, face]) => {
    globalThis.__realFetch ??= globalThis.fetch
    globalThis.__fandom = { pages, pictures: 0, delay: 250, hang: false, version: 1 }
    const held = (signal) => new Promise((_, reject) => signal?.addEventListener('abort', () => reject(signal.reason)))
    globalThis.fetch = async (input, init) => {
      const url = String(input instanceof URL ? input.href : (input?.url ?? input))
      const net = globalThis.__fandom
      if (url.startsWith(site + '/')) {
        const path = new URL(url).pathname
        // A page that never answers, as a site under load.
        if (path === '/wiki/Never') return held(init?.signal)
        const page = net.pages[path]
        if (!page) return new Response('', { status: 404 })
        return new Response(net.version > 1 ? page.replace('</main>', `<p>A new paragraph in version ${net.version} of the wiki, added after the first reading, long enough to be part of the article and read as one.</p></main>`) : page, { headers: { 'content-type': 'text/html; charset=utf-8' } })
      }
      if (!url.startsWith(cdn + '/')) return globalThis.__realFetch(input, init)
      net.pictures += 1
      // One the site refuses, one it never sends, and, with `hang`, every one held until stopped.
      if (/Picture_5\.jpg/.test(url)) return new Response('Forbidden', { status: 403, headers: { 'content-type': 'text/html' } })
      if (/Picture_8\.jpg/.test(url) || net.hang) return held(init?.signal)
      await new Promise((go) => setTimeout(go, net.delay))
      // Each picture its own file (its address after the PNG's end, which a decoder passes over), so none is the same picture again.
      return new Response(Buffer.concat([Buffer.from(/Harry_Potter\.jpg/.test(url) ? face : pic, 'base64'), Buffer.from(url)]), { headers: { 'content-type': 'image/png' } })
    }
  }, [SITE, CDN, { '/wiki/Harry_Potter': fandomPage({ site: SITE, cdn: CDN }), '/wiki/Hermione_Granger': fandomPage({ site: SITE, cdn: CDN, sections: 20 }).replaceAll('Harry Potter', 'Hermione Granger') }, png(70, 110, 150, 500, 360), png(190, 150, 110, 268, 361)])
  await c.v('settings:set', { sounds: false, hintRate: 0, motion: false })

  // 1. The page read: its words first, the pictures still coming under a line that says so, with Stop.
  const asked = Date.now()
  await open(`${SITE}/wiki/Harry_Potter`)
  const first = await until((now) => now.words > 0, 15000, "open")
  const wordsIn = Date.now() - asked
  check('the words show while the pictures are still coming, under a line that counts them, with Stop', first.words > 20000 && first.waiting > 0 && first.boxes === 0 && /Bringing the pictures, \d+ of 61…\s*Stop/.test(first.coming), JSON.stringify({ ...first, lines: first.lines.length, wordsIn }))
  await h.screenshot({ path: `${shots}/fandom-coming.png` })
  const filling = await until((now) => now.shown >= 10, 10000, "fill")
  check('each picture fills its place as it comes, the rest still coming', filling.shown >= 10 && filling.waiting > 0, JSON.stringify({ shown: filling.shown, waiting: filling.waiting }))
  const settled = await until((now) => now.waiting === 0 && !now.coming, 30000)
  const read = await h.evaluate(() => {
    const body = document.querySelector('.web-reader-body')
    const imgs = [...body.querySelectorAll('img')]
    const infant = [...body.querySelectorAll('figure')].find((one) => /infant/.test(one.textContent))
    const box = imgs[0]?.closest('figure')
    return {
      imgs: imgs.length,
      firstCaption: box?.querySelector('figcaption')?.textContent ?? '',
      firstWide: imgs[0]?.naturalWidth ?? 0,
      facts: [...body.querySelectorAll('th')].map((one) => one.textContent),
      infant: infant?.querySelector('img')?.getAttribute('src') ?? infant?.innerHTML.slice(0, 120) ?? 'none',
      broken: imgs.filter((one) => !one.complete || !one.naturalWidth).length
    }
  })
  check('the reading ends: every picture settled and the line gone', settled.waiting === 0 && !settled.coming, JSON.stringify({ waiting: settled.waiting, coming: settled.coming }))
  check("the infobox's picture opens the article, captioned with its name", read.firstWide === 268 && read.firstCaption === 'Harry James Potter', JSON.stringify(read))
  check("the infobox's facts are kept as a table", ['Born', 'Blood status', 'Marital status', 'Nationality'].every((one) => read.facts.includes(one)), JSON.stringify(read.facts))
  check('the lazy pictures are kept with the notes: "Harry as an infant" is a picture, not a link', /^haligtree:\/\/assets\//.test(read.infant) && read.imgs === 59 && read.broken === 0, JSON.stringify(read))
  check('the picture the site refused, and the one it never sent, each say so plainly, and nothing else is a line', settled.lines.length === 2 && settled.lines.includes('Picture the site would not send / A scene from part 2, picture 5') && settled.lines.includes('Picture the site was too slow to send / A scene from part 3, picture 8'), JSON.stringify(settled.lines))
  for (const one of ['light', 'dark']) {
    await theme(one); await wait(500)
    await h.screenshot({ path: `${shots}/fandom-read-${one}.png` })
  }

  // 2. Read again: the bar's button, ⌘R in the reader, and the View menu's item, each with the loader, each from the site.
  const pageHits = () => electron.evaluate(() => globalThis.__fandom.pictures)
  const tools = await h.evaluate(() => [...document.querySelectorAll('.web-reader .pdf-reader-tools button')].map((one) => one.getAttribute('aria-label')))
  check('the bar has "Read the page again", in its place among the tools', tools.includes('Read the page again'), JSON.stringify(tools))
  for (const [way, go] of [
    ['the bar\'s button', () => h.click('.web-reader button[aria-label="Read the page again"]')],
    ['⌘R in the reader', async () => (await h.click('.web-reader-body p'), await h.keyboard.press('Meta+r'))],
    ['the View menu', () => electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((one) => one.webContents.send('menu:read-again')))]
  ]) {
    const before = await pageHits()
    const version = (await electron.evaluate(() => globalThis.__fandom.version)) + 1
    await net({ version })
    // The loader seen however briefly it shows (the saved page answers at once).
    await h.evaluate(() => {
      window.__sawLoader = false
      window.__loaderWatch ??= new MutationObserver(() => document.querySelector('.web-reader-reading') && (window.__sawLoader = true))
      window.__loaderWatch.observe(document.body, { subtree: true, childList: true })
    })
    await go()
    const again = await until((now) => now.shown >= 55 && now.waiting === 0 && !now.coming, 30000)
    const added = await h.evaluate((version) => document.querySelector('.web-reader-body')?.textContent?.includes(`version ${version} of the wiki`), version)
    const loader = await h.evaluate(() => window.__sawLoader)
    check(`${way} reads the page again from the site, with its loader`, loader && added && again.shown >= 55 && (await pageHits()) > before, JSON.stringify({ loader, added, shown: again.shown }))
  }

  // 3. Stop while the pictures come: the asking ends at once, each picture not brought said so.
  await net({ hang: true })
  await open(`${SITE}/wiki/Hermione_Granger`)
  const held = await until((now) => now.words > 0 && /Bringing/.test(now.coming), 15000)
  check("pictures held by a slow site take no room: no broken picture, no empty box", held.waiting > 0 && held.boxes === 0, JSON.stringify({ waiting: held.waiting, boxes: held.boxes }))
  for (const one of ['dark', 'light']) {
    await theme(one); await wait(500)
    await h.screenshot({ path: `${shots}/fandom-held-${one}.png` })
  }
  const stopAt = Date.now()
  await h.click('[data-web-coming] [data-job-stop]')
  const stopped = await until((now) => now.waiting === 0 && !now.coming, 5000)
  const stopTook = Date.now() - stopAt
  const asks = await pageHits()
  await wait(1500)
  check('Stop ends the pictures at once: each one not brought says so, and nothing more is asked', stopped.waiting === 0 && !stopped.coming && stopTook < 1500 && stopped.lines.length > 0 && stopped.lines.every((one) => /^Picture not brought, as the reading was stopped\b/.test(one) || /would not send|too slow/.test(one)) && (await pageHits()) === asks, JSON.stringify({ stopTook, lines: stopped.lines.slice(0, 2), n: stopped.lines.length }))
  await net({ hang: false })

  // 4. A page that never answers: Stop stops it, and left alone it says so in words after 15 seconds.
  await open(`${SITE}/wiki/Never`)
  await until((now) => /Reading the page/.test(now.reading), 5000)
  await h.click('.web-reader-reading [data-job-stop]')
  const halted = await until((now) => !!now.failed, 3000)
  check('Stop while the page is read stops it at once, and says so', /^Stopped/.test(halted.failed), halted.failed)
  await h.click('.web-reader [data-read-again]')
  const slowAt = Date.now()
  const slow = await until((now) => !!now.failed, 20000)
  check('a page that never answers says so in words, within its 15 seconds', /93\.184\.216\.34 did not send the page within 15 seconds/.test(slow.failed) && Date.now() - slowAt < 17000, `${slow.failed} after ${Date.now() - slowAt} ms`)
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error))
} finally {
  await c.close?.()
  done()
}
