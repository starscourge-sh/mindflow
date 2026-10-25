// The welcome's intro on a first run, after Dia's: the window spread over the
// whole screen gathering in to a window of its own; the title card in the mist
// before the first words, and gone after; "Sound on" and "Skip intro" there
// from the first frame, Skip intro landing on the settled first screen; and
// "Open my book" turning the welcome over onto Home with no frame of neither,
// Home saying when the book was opened.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-a/main/index.js HALIGTREE_QA_AWAY=1 node qa/welcome-intro.mjs [shots folder] [light|dark]
import { mkdirSync } from 'fs'
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
  for (let t = await sinceMist(); t < 6200; t = await sinceMist()) {
    looks++
    title ||= await h.evaluate(() => document.querySelector('[data-title-card]')?.innerText ?? '')
    if (await seen('[data-title-card]')) card++
    if ((await h.locator('[data-thesis="line"]').count()) && (await seen('[data-title-card]'))) wordsWithCard = true
    if (SHOTS && t > [2400, 4000, 5600][frame]) await shot(`0${frame++}-card-${(t / 1000).toFixed(1)}s`)
    await h.waitForTimeout(200)
  }
  check('the title card shows in the mist, all the way to its lift', card === looks && looks > 5, `${card} of ${looks} looks`)
  check('it reads as a title page: A commonplace book, Haligtree', /A commonplace book/i.test(title) && /Haligtree/.test(title), title.replace(/\s+/g, ' '))
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
  check('and settles whole', await h.evaluate(() => [...document.querySelectorAll('[data-thesis]')].length >= 7))
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
  await h.click('footer button:has-text("Open my book")')
  const frames = []
  for (let i = 0; i < 16; i++) {
    frames.push(await h.evaluate(() => {
      const welcome = document.querySelector('.mf-welcome')
      const shown = welcome ? Number(getComputedStyle(welcome).opacity) : 0
      const home = document.querySelector('[data-home-plan]')
      // Home drawn: there, and no longer held undrawn under the welcome (main.css, data-welcoming).
      return { welcome: shown, home: !!home && home.getBoundingClientRect().height > 0 && !document.documentElement.hasAttribute('data-welcoming') }
    }))
    if (SHOTS && i % 4 === 1) await shot(`1${i}-book`)
    await h.waitForTimeout(90)
  }
  check('every frame shows the welcome or Home', frames.every((one) => one.welcome > 0.5 || one.home), JSON.stringify(frames))
  await h.waitForTimeout(1200)
  check('then Home, with the welcome gone', (await h.locator('.mf-welcome').count()) === 0 && (await h.locator('[data-home-plan]').count()) > 0)
  const line = await h.evaluate(() => document.querySelector('[data-book-opened]')?.textContent ?? '')
  check('Home says when the book was opened', /Your book, opened/.test(line), line)
  await shot('20-home')
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()
