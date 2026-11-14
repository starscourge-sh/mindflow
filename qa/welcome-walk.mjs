// Walks the welcome's pages in its window, each settled, and writes a picture of each to <folder>: for reading by eye
// that every page fits the welcome's own window. Plain arrival (a test run). Sizes: one (W x H), or several with commas,
// each page then shot and measured at every one of them in turn (the walk moves on at the first). The story: one of the
// five by its id (welcome-stories.ts), else the one the app picks. The look: dark, light, or both (each page shot in
// each, put on in place). For each page, size and look it prints the room left between the page's lowest words or card
// and the footer (under 0: that much is under it) and how far the page scrolls, and checks that every page fits from
// the welcome's smallest window up (1100 by 688, main's welcomePlace): nothing under the footer, nothing that scrolls.
// QA_USE=<the You page's answer to what Haligtree is for, as its chip says> picks it on the way, so the line said for
// you shows under a later page's words (Writing and reading: on Write; Study: on Remember; Work, Everyday life: on Catch).
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/welcome-walk.mjs <folder> <W>x<H>[,<W>x<H>…] [dark|light|both] [story]
import { mkdirSync } from 'fs'
import { join } from 'path'
import { checks, open } from './harness.mjs'

delete process.env.QA_ARGS
const OUT = process.argv[2]
const SIZES = (process.argv[3] ?? '1190x744').split(',').map((one) => one.split('x').map(Number))
const THEME = process.argv[4] ?? 'dark'
const LOOKS = THEME === 'both' ? ['light', 'dark'] : [THEME]
const STORY = process.argv[5] ?? ''
if (STORY) process.env.HALIGTREE_QA_STORY = STORY
mkdirSync(OUT, { recursive: true })
const qa = await open()
const { electron } = qa
const { check, done } = checks()

/** The page's room over the footer: from the lowest thing drawn on it (words, a card's edge, a picture, a line) to the footer's top; and how far it scrolls. */
const measure = (h) => h.evaluate(() => {
  const sections = [...document.querySelectorAll('.mf-welcome main > section')]
  const section = sections[sections.length - 1]
  const foot = document.querySelector('.mf-welcome footer')?.getBoundingClientRect().top ?? innerHeight
  if (!section) return null
  let low = -Infinity
  let what = ''
  for (const el of section.querySelectorAll('*')) {
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.opacity === '0') continue
    // Drawn: words or a picture with nothing inside, or a box with a fill, an edge or a shadow of its own. Plain layout boxes stretch to the stage's foot and say nothing.
    const leaf = el.children.length === 0 || /^(svg|img|canvas)$/i.test(el.tagName)
    const box = !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor) || (parseFloat(cs.borderBottomWidth) > 0 && !/rgba\(0, 0, 0, 0\)/.test(cs.borderBottomColor)) || cs.boxShadow !== 'none'
    if (!leaf && !box) continue
    if (r.bottom > low) (low = r.bottom, (what = (el.textContent ?? '').trim().slice(0, 40) || el.tagName.toLowerCase()))
  }
  // The page, or a part of it with a scroll of its own (the questions on You): how far the most runs past its box.
  const scrollers = [section, ...section.querySelectorAll('*')].filter((el) => el === section || /(auto|scroll)/.test(getComputedStyle(el).overflowY))
  return { room: Math.round(foot - low), scrolls: Math.max(0, ...scrollers.map((el) => el.scrollHeight - el.clientHeight)), what, size: `${innerWidth}x${innerHeight}` }
})

const resize = (w, hh) => electron.evaluate(({ BrowserWindow }, [w, hh]) => BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home'))?.setBounds({ width: w, height: hh }), [w, hh])

try {
  let h = null
  for (let i = 0; i < 100 && !h; i++) (h = electron.windows().find((w) => w.url().includes('view=home')) ?? null) || (await qa.page.waitForTimeout(150))
  await h.evaluate((n) => localStorage.setItem('theme', n === 'light' ? 'paper' : n), LOOKS[0])
  await h.reload()
  await h.waitForSelector('.mf-welcome', { timeout: 15000 })
  const [W, H] = SIZES[0]
  await resize(W, H)
  await h.waitForTimeout(800)
  const story = await h.evaluate(() => document.querySelector('.mf-welcome')?.dataset.story ?? '')
  // A page that plays then asks (Catch's Your turn, the Remember page's two steps) takes two steps: walked to the last chapter.
  for (let page = 1; page <= 14; page++) {
    // Settled: its picture played to its end (a key settles a chapter that plays).
    for (let i = 0; i < 6; i++) {
      const done = await h.evaluate(() => { const next = [...document.querySelectorAll('.mf-welcome footer button')].at(-1); return !!next && !next.closest('[inert]') && !next.hasAttribute('disabled') })
      await h.keyboard.press('Escape')
      await h.waitForTimeout(700)
      if (done) break
    }
    const label = await h.evaluate(() => document.querySelector('.mf-welcome footer .sr-only')?.textContent ?? '')
    for (const look of LOOKS) {
      // Put on in place (main.tsx repaints on the storage event), so the page stays where the walk has it.
      if (LOOKS.length > 1) (await h.evaluate((n) => (localStorage.setItem('theme', n === 'light' ? 'paper' : n), window.dispatchEvent(new StorageEvent('storage', { key: 'theme' }))), look), await h.waitForTimeout(500))
      for (const [w, hh] of SIZES) {
        if (SIZES.length > 1) (await resize(w, hh), await h.waitForTimeout(600))
        const m = await measure(h)
        await h.screenshot({ path: join(OUT, `${String(page).padStart(2, '0')}${SIZES.length > 1 ? `-${w}x${hh}` : ''}${LOOKS.length > 1 ? `-${look}` : ''}.png`) })
        console.log(`page ${page} ${story} ${look} ${m?.size}: room ${m?.room}px, scrolls ${m?.scrolls}px  (${label}; lowest: ${m?.what})`)
        if (w >= 1100 && hh >= 688) check(`${story} ${look} ${w}x${hh} ${label}: fits, nothing under the footer and nothing scrolls`, m && m.room >= 0 && m.scrolls <= 1, `room ${m?.room}px, scrolls ${m?.scrolls}px, lowest: ${m?.what}`)
      }
      if (SIZES.length > 1) (await resize(W, H), await h.waitForTimeout(600))
    }
    if (LOOKS.length > 1) (await h.evaluate((n) => (localStorage.setItem('theme', n === 'light' ? 'paper' : n), window.dispatchEvent(new StorageEvent('storage', { key: 'theme' }))), LOOKS[0]), await h.waitForTimeout(500))
    if (/ 8 of 8/.test(label)) break
    // The answer asked for, picked on You (then Next shows what was done with it, a step of its own).
    if (process.env.QA_USE && /: You$/.test(label) && !(await h.$('[data-payoff]'))) {
      const pick = h.locator('.mf-welcome button[aria-pressed]', { hasText: process.env.QA_USE }).first()
      if ((await pick.getAttribute('aria-pressed')) !== 'true') (await pick.click(), await h.waitForTimeout(400))
    }
    // On: "Skip trying it" on Your turn, else the way on.
    const skipTry = await h.$('button[data-skip]:has-text("Skip trying it")')
    if (skipTry) await skipTry.click()
    else await h.keyboard.press('ArrowRight')
    await h.waitForTimeout(1500)
  }
} finally {
  await qa.close()
}
done()
