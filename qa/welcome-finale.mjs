// The first welcome's ending, filmed every frame (about 16ms) from the press of "Open my book":
//  - the book's name comes up in the middle and is carried down into the sidebar's foot, landing over the sidebar's own
//    book name (left edge within 14px, middles within 10px), which takes the light (mf-name-landed)
//  - it lasts 1 to 1.6 seconds, then it and the welcome are gone; the music resolves on it (cue:bed-home)
//  - never in the way: the carried name takes no clicks, and a click at the sidebar's name reaches the sidebar
//  - played again from the menu, the ending never plays (the old page turn only)
//  - Reduce Motion: no carried name, the welcome cross-fades (seen part-way on some frame, never cut)
//  Light and dark. Screenshots through the ending.
//
// Not with --sandbox (the sandbox's welcome ends into the sandbox, without it):
//   npx electron-vite build --outDir out-x && QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/welcome-finale.mjs [shots-dir]
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
// Each run a first run: its own empty data folder.
const made = []
const fresh = () => { const dir = mkdtempSync(join(tmpdir(), 'haligtree-finale-')); made.push(dir); process.env.QA_DATA = dir }
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.argv[2] ?? ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
let failed = 0
const check = (name, ok, more = '') => {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${more ? `  (${more})` : ''}`)
}
const OWN = 'The Chapel of Anticipation'
const toLast = async (h) => {
  await h.waitForSelector('.mf-welcome', { timeout: 10000 })
  // Past the arrival, then the skip to the last page.
  await h.keyboard.press('Enter')
  await h.waitForTimeout(800)
  await h.click('footer button[data-skip]')
  await h.waitForTimeout(1200)
  await h.waitForSelector('footer button:has-text("Open my book")', { timeout: 5000 })
}
// Each frame for 2s from the press: the carried name's box and opacity, the welcome's opacity.
const film = (h) => h.evaluate(() => new Promise((done) => {
  const frames = []
  const t0 = performance.now()
  ;[...document.querySelectorAll('.mf-welcome footer button')].find((b) => /Open my book/.test(b.textContent)).click()
  const tick = () => {
    const name = document.querySelector('[data-finale-name]')
    const box = name?.getBoundingClientRect()
    const dialog = document.querySelector('.mf-welcome')
    frames.push({
      t: Math.round(performance.now() - t0),
      name: name ? { o: Math.round(Number(getComputedStyle(name).opacity) * 100) / 100, l: Math.round(box.left), cy: Math.round(box.top + box.height / 2), w: Math.round(box.width) } : null,
      dialog: dialog ? Math.round(Number(getComputedStyle(dialog).opacity) * 100) / 100 : null,
      lit: !!document.querySelector('[data-sidebar-book-name].mf-name-landed')
    })
    if (performance.now() - t0 < 2000) requestAnimationFrame(tick)
    else done(frames)
  }
  requestAnimationFrame(tick)
}))
const target = (h) => h.evaluate(() => {
  const b = document.querySelector('[data-sidebar-book-name]')?.getBoundingClientRect()
  return b ? { l: Math.round(b.left), cy: Math.round(b.top + b.height / 2), text: document.querySelector('[data-sidebar-book-name]').textContent } : null
})

for (const theme of ['light', 'dark']) {
  fresh()
  const c = await sandbox({ width: 1280, height: 800, seeded: false })
  const { h } = c
  try {
    await c.v('books:rename', 'default', OWN)
    await c.look(theme)
    await toLast(h)
    // Screenshots through the ending, beside the frame data.
    const started = Date.now()
    // Frames caught by the main process (the page is busy being filmed), every 50ms or as fast as it can capture.
    const shots = SHOTS ? c.electron.evaluate(async ({ BrowserWindow }, [dir, theme]) => {
      const { writeFileSync } = process.mainModule.require('fs')
      const win = BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home'))
      const t0 = Date.now()
      while (Date.now() - t0 < 1800) {
        const at = Date.now() - t0
        const image = await win.webContents.capturePage()
        writeFileSync(`${dir}/${theme}-${String(at).padStart(4, '0')}.png`, image.resize({ width: 1000 }).toPNG())
        await new Promise((r) => setTimeout(r, 50))
      }
    }, [SHOTS, theme]) : null
    const frames = await film(h)
    await shots
    const seen = frames.filter((f) => f.name && f.name.o > 0.05)
    const spot = await target(h)
    check(`${theme}: the book's name is carried out of the page`, seen.length > 20, `${seen.length} frames`)
    const last = seen[seen.length - 1]
    check(`${theme}: it lands over the sidebar's own book name`, spot && last && Math.abs(last.name.l - spot.l) <= 14 && Math.abs(last.name.cy - spot.cy) <= 10, `${JSON.stringify(last?.name)} vs ${JSON.stringify(spot)}`)
    check(`${theme}: the sidebar's name says it and takes the light as it lands`, spot?.text === OWN && frames.some((f) => f.lit), spot?.text)
    const end = frames.find((f) => f.t > 200 && !f.name && f.dialog === null)
    check(`${theme}: the ending lasts 1 to 1.6 seconds, then it and the welcome are gone`, end && end.t >= 1000 && end.t <= 1700, String(end?.t))
    console.log(`  ${theme} frames: ${frames.length}, every 4th: ${JSON.stringify(frames.filter((_, i) => i % 4 === 0).map((f) => [f.t, f.name?.o, f.name?.l, f.name?.cy, f.dialog]))}`)
    check(`${theme}: the music resolves on it`, (await h.evaluate(() => window.haligtreeHeard ?? [])).includes('cue:bed-home'))
    const free = await h.evaluate(() => {
      const b = document.querySelector('[data-sidebar-book-name]')?.getBoundingClientRect()
      return !!b && !!document.elementFromPoint(b.left + 5, b.top + b.height / 2)?.closest('button')
    })
    check(`${theme}: once Home shows, a click at the sidebar's name reaches the sidebar`, free)
    // Played again: never the ending.
    await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:welcome')))
    await toLast(h)
    const again = await film(h)
    check(`${theme}: played again from the menu, the ending never plays`, !again.some((f) => f.name), `${again.filter((f) => f.name).length} frames`)
  } finally {
    if (c.errors.length) console.log(c.errors.join('\n'))
    await c.close()
  }
}
{
  fresh()
  const c = await sandbox({ width: 1280, height: 800, seeded: false })
  const { h } = c
  try {
    await h.emulateMedia({ reducedMotion: 'reduce' })
    await toLast(h)
    const frames = await film(h)
    check('Reduce Motion: no carried name', !frames.some((f) => f.name))
    check('Reduce Motion: the welcome cross-fades, seen part-way, never cut', frames.some((f) => f.dialog !== null && f.dialog > 0.1 && f.dialog < 0.9) && frames.find((f) => f.dialog === null)?.t <= 700, JSON.stringify(frames.filter((_, i) => i % 4 === 0).map((f) => [f.t, f.dialog])))
  } finally {
    if (c.errors.length) console.log(c.errors.join('\n'))
    await c.close()
  }
}
for (const dir of made) rmSync(dir, { recursive: true, force: true })
console.log(failed ? `${failed} FAILED` : 'ALL PASS')
process.exit(failed ? 1 : 0)
