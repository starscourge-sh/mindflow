// The welcome's intro on a first run, after Dia's: the window spread over the
// whole screen gathering in to a window of its own; the title card in the mist
// before the first words, and gone after; "Sound on" and "Skip intro" there
// from the first frame, Skip intro landing on the settled first screen; and
// "Open my book" turning the welcome over onto Home with no frame of neither,
// Home saying when the book was opened.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-a/main/index.js HALIGTREE_QA_AWAY=1 node qa/welcome-intro.mjs [shots folder] [light|dark]
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

delete process.env.QA_ARGS
// The window spread and gathered in for real (other probes keep the size they ask for).
process.env.HALIGTREE_QA_GATHER = '1'
const SHOTS = process.argv[2] ?? ''
const THEME = process.argv[3] ?? 'light'
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1440, height: 900, seeded: false })
const { h, errors, close, electron } = c
const shot = (name) => SHOTS && h.screenshot({ type: 'jpeg', quality: 82, scale: 'css', path: join(SHOTS, `intro-${THEME}-${name}.jpg`) })
const asked = () => electron.evaluate(({ BrowserWindow, screen }) => {
  const win = BrowserWindow.getAllWindows().find((w) => /view=home/.test(w.webContents.getURL()))
  return { bounds: win?.qaBounds ?? null, seen: win?.qaBoundsSeen ?? [], screen: screen.getPrimaryDisplay().bounds }
})
const seen = (selector) => h.evaluate((selector) => [...document.querySelectorAll(selector)].some((el) => Number(getComputedStyle(el).opacity) > 0.05), selector)
// The page notes when the mist first comes, so the times below are from the arrival itself.
await c.electron.context().addInitScript(() => {
  new MutationObserver((_, watch) => {
    if (document.querySelector('[data-welcome-mist]')) (window.qaMistAt = performance.now()), watch.disconnect()
  }).observe(document, { childList: true, subtree: true })
})
const sinceMist = () => h.evaluate(() => Math.round(performance.now() - window.qaMistAt))
try {
  await c.theme(THEME)
  await h.waitForSelector('[data-welcome-mist]', { timeout: 8000 })
  const first = await asked()
  check('a first run\'s window starts over the whole screen', first.seen.some((one) => one.width === first.screen.width && one.height === first.screen.height), JSON.stringify(first.seen.slice(0, 4)))
  check('the sound button is there from the first frame', await h.locator('[data-intro-sound]').isVisible())
  check('Skip intro, with its key, is there from the first frame', /Skip intro/.test(await h.locator('[data-skip-intro]').innerText()) && (await h.locator('[data-skip-intro] kbd').count()) === 1)
  // The title card, whole in the mist, before any of the first words.
  let card = 0
  let wordsWithCard = false
  let frame = 0
  let title = ''
  let looks = 0
  let mark = null
  for (let t = await sinceMist(); t < 6200; t = await sinceMist()) {
    looks++
    title ||= await h.evaluate(() => document.querySelector('[data-title-card]')?.innerText ?? '')
    if (await seen('[data-title-card]')) card++
    if ((await h.locator('[data-thesis="line"]').count()) && (await seen('[data-title-card]'))) wordsWithCard = true
    if (SHOTS && t > [2400, 4000, 5600][frame]) await shot(`0${frame++}-card-${(t / 1000).toFixed(1)}s`)
    // The mark whole (the logo's leaf fan in squares), read from its own canvas, and the wordmark's weight.
    if (t > 4200 && !mark) mark = await h.evaluate(() => {
      const canvas = document.querySelector('[data-title-card] canvas')
      if (!canvas) return null
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
      let inked = 0
      for (let i = 3; i < data.length; i += 4) if (data[i] > 20) inked++
      return { inked, png: canvas.toDataURL('image/png'), weight: Number(getComputedStyle(document.querySelector('[data-title-card] h1')).fontWeight) }
    })
    await h.waitForTimeout(200)
  }
  check('the title card shows in the mist, all the way to its lift', card === looks && looks > 5, `${card} of ${looks} looks`)
  check('it reads as a title page: A commonplace book, Haligtree', /A commonplace book/i.test(title) && /Haligtree/.test(title), title.replace(/\s+/g, ' '))
  check('the logo is drawn in squares over it', (mark?.inked ?? 0) > 2000, String(mark?.inked))
  check('the wordmark is bold', (mark?.weight ?? 0) >= 600, String(mark?.weight))
  if (SHOTS && mark?.png) writeFileSync(join(SHOTS, `title-mark-${THEME}.png`), Buffer.from(mark.png.split(',')[1], 'base64'))
  const middle = await asked()
  check('the window gathers in to a window of its own', !!middle.bounds && middle.bounds.width < middle.screen.width, JSON.stringify(middle.bounds))
  await h.waitForSelector('[data-thesis="line"]', { timeout: 6000 })
  const waited = Date.now()
  const wordsAt = (await sinceMist()) - (Date.now() - waited)
  check('the first words come at about eight to ten seconds', wordsAt > 6500 && wordsAt < 10500, `${wordsAt}ms after the mist`)
  await h.waitForTimeout(600)
  check('the title card is gone once the words come', (await h.locator('[data-title-card]').count()) === 0 && !wordsWithCard)
  await h.waitForTimeout(900)
  check('the intro\'s controls go as the footer comes', !(await seen('[data-intro]')) && (await seen('footer')))

  // Again, and Skip intro straight away: the settled first screen.
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:welcome')))
  await h.waitForSelector('[data-skip-intro]', { timeout: 4000 })
  await h.waitForTimeout(400)
  const footerAt = await h.evaluate(() => document.querySelector('footer')?.getBoundingClientRect().top)
  const introAt = await h.evaluate(() => document.querySelector('[data-intro]')?.getBoundingClientRect().top)
  check('the intro\'s controls stand where the footer will', Math.abs(footerAt - introAt) < 1, `${introAt} ${footerAt}`)
  await h.click('[data-skip-intro]')
  await h.waitForTimeout(900)
  check('Skip intro: the mist and the title card go', (await h.locator('[data-welcome-mist]').count()) === 0 && (await h.locator('[data-title-card]').count()) === 0)
  check('and the first screen is there', (await h.locator('[data-thesis="line"]').count()) === 1)
  await h.keyboard.press('Escape')
  await h.waitForTimeout(500)
  check('and settles whole', await h.evaluate(() => [...document.querySelectorAll('[data-thesis]')].length >= 6))
  const last = await asked()
  check('the window ends at its own size, not the screen\'s', !!last.bounds && last.bounds.width < last.screen.width && last.bounds.height < last.screen.height, JSON.stringify(last.bounds))

  // The sound button: the app's Sounds setting, off and on again.
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:welcome')))
  await h.waitForSelector('[data-intro-sound]', { timeout: 4000 })
  await h.waitForTimeout(300)
  await h.click('[data-intro-sound]')
  await h.waitForTimeout(300)
  const off = await h.evaluate(() => window.api.settings?.() ?? null).catch(() => null)
  check('the sound button turns sounds off', (await h.locator('[data-intro-sound]').getAttribute('aria-pressed')) === 'false', JSON.stringify(off?.sounds))
  await h.click('[data-intro-sound]')
  await h.waitForTimeout(200)
  check('and on again', (await h.locator('[data-intro-sound]').getAttribute('aria-pressed')) === 'true')
  await h.evaluate(() => document.activeElement?.blur())
  await h.keyboard.press('Enter')
  await h.waitForTimeout(800)
  check('↵ in the mist skips the intro', (await h.locator('[data-welcome-mist]').count()) === 0)

  // Open my book: the welcome turns over onto Home, never a frame of neither.
  await h.click('footer [data-skip]')
  await h.waitForTimeout(1600)
  // Every frame for 2.8s from the press, in the page: the welcome, Home, and the sidebar with its Inbox row.
  await h.evaluate(() => {
    window.qaFrames = []
    const start = performance.now()
    const look = () => {
      const welcome = document.querySelector('.mf-welcome')
      const home = document.querySelector('[data-home-plan]')
      const side = document.querySelector('aside[data-chrome]')
      const inbox = document.querySelector('[data-tour="inbox"]')?.getBoundingClientRect()
      window.qaFrames.push({
        t: Math.round(performance.now() - start),
        welcome: welcome ? Number(getComputedStyle(welcome).opacity) : 0,
        // Home drawn: there, and no longer held undrawn under the welcome (main.css, data-welcoming).
        home: !!home && home.getBoundingClientRect().height > 0 && !document.documentElement.hasAttribute('data-welcoming'),
        side: side ? Number(getComputedStyle(side).opacity) : 0,
        inbox: inbox ? Math.round(inbox.top * 10) / 10 : null
      })
      if (performance.now() - start < 2800) requestAnimationFrame(look)
    }
    requestAnimationFrame(look)
  })
  await h.click('footer button:has-text("Open my book")')
  for (let i = 0; i < 4; i++) (SHOTS && (await shot(`1${i}-book`)), await h.waitForTimeout(360))
  await h.waitForTimeout(3000 - 4 * 360)
  const frames = await h.evaluate(() => window.qaFrames)
  check('every frame shows the welcome or Home', frames.length > 60 && frames.every((one) => one.welcome > 0.5 || one.home), `${frames.length} frames; ${JSON.stringify(frames.filter((one) => !(one.welcome > 0.5 || one.home)).slice(0, 3))}`)
  // The sidebar comes in after the welcome goes: faint as Home first shows, risen whole by the end.
  const firstHome = frames.find((one) => one.home && one.welcome <= 0.5)
  const settled = frames[frames.length - 1]
  check('the sidebar is still coming in as the welcome goes', !!firstHome && (firstHome.side < 0.95 || firstHome.inbox - frames[frames.length - 1].inbox > 1), JSON.stringify(firstHome))
  check('and fades up to whole', settled.side > 0.99 && frames.some((one) => one.home && one.side > 0.05 && one.side < 0.95), `last ${settled.side}`)
  const tops = frames.filter((one) => one.home && one.inbox !== null).map((one) => one.inbox)
  check('its rows rise into place', tops.length > 10 && Math.max(...tops) - settled.inbox > 2 && tops.slice(-5).every((top) => Math.abs(top - settled.inbox) < 0.5), `inbox from ${Math.max(...tops)} to ${settled.inbox}`)
  // The tour's first stop, about four seconds after the press: beside Inbox, and not over "Your book, opened".
  await h.waitForSelector('[role="dialog"][aria-label="Where things are"]', { timeout: 6000 })
  await h.waitForTimeout(700)
  const stop = await h.evaluate(() => {
    const box = (el) => { const r = el?.getBoundingClientRect(); return r ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null }
    const dialog = document.querySelector('[role="dialog"][aria-label="Where things are"]')
    return { card: box([...dialog.children].find((el) => el.querySelector('.font-heading'))), line: box(document.querySelector('[data-book-opened]')), inbox: box(document.querySelector('[data-tour="inbox"]')), title: dialog.querySelector('.font-heading')?.textContent }
  })
  await shot('15-tour')
  const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
  check('the tour\'s first stop is Inbox', stop.title === 'Your Inbox', stop.title)
  check('its card is clear of "Your book, opened"', !!stop.card && !!stop.line && !overlaps(stop.card, stop.line), JSON.stringify(stop))
  check('and the Inbox row it points at has not moved', !!stop.inbox && Math.abs(stop.inbox.top - settled.inbox) < 0.5, `${settled.inbox} -> ${stop.inbox?.top}`)
  await h.keyboard.press('Escape')
  await h.waitForTimeout(400)
  check('then Home, with the welcome gone', (await h.locator('.mf-welcome').count()) === 0 && (await h.locator('[data-home-plan]').count()) > 0)
  const line = await h.evaluate(() => document.querySelector('[data-book-opened]')?.textContent ?? '')
  check('Home says when the book was opened', /Your book, opened/.test(line), line)
  // A new book's week has nothing in it: no card of four zeros, even on a Sunday.
  check('no empty week card on a new book', (await h.locator('[data-weekly-digest]').count()) === 0)
  await shot('20-home')
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()
