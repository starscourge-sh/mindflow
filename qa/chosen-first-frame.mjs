// The mark on a list's chosen row is in the page the first frame its list is on show. Run on a copy of the seeded
// sandbox or of a book, with a plain build (a dev-mode build reads a new list's place a frame late, as React's
// development checks run every effect twice; there it only reports):
//
//   QA_ARGS=--sandbox QA_DATA=<copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/chosen-first-frame.mjs
//
// Settings is opened from the Inbox four times (the first builds it, the rest come back to it, on show at once).
// Every frame says whether its sections' chosen row is on show and whether the mark behind it is in the page.
// Bars: no frame shows the chosen row without its mark; choosing another section with the pointer moves the mark
// to it; and none of this draws Settings' sections again only to move the mark (its place is the mark's own,
// glide.tsx useChosen: held by the list's owner, the owner was drawn a second time for every choice).
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const RECORD = `(() => {
  const rec = (window.__cf = { frames: [], on: true })
  // Read in the task after each frame, so what is read is what that frame painted: a list's first place is read
  // after the frame's own layout (a size observer), later in the frame than any frame callback runs.
  const after = new MessageChannel()
  after.port1.onmessage = () => {
    if (!rec.on) return
    const row = document.querySelector('nav[data-sections] [data-section][aria-current="page"]')
    const shown = !!row && row.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
    const mark = row ? row.closest('nav[data-sections]').querySelector(':scope > [data-glide]:not(.opacity-0)') : null
    rec.frames.push({ shown, mark: !!mark, at: mark ? mark.style.transform : null })
    requestAnimationFrame(tick)
  }
  const tick = () => after.port2.postMessage(0)
  requestAnimationFrame(tick)
})()`

const c = await sandbox({ width: 1200, height: 800 })
const { h } = c
try {
  await h.waitForSelector('aside[data-chrome] [data-side-row]', { timeout: 60000 })
  await h.waitForTimeout(1500)
  const dev = await h.evaluate(() => !!document.querySelector('#root') && typeof window.__REACT_DEVTOOLS_GLOBAL_HOOK__ === 'object' && [...(window.__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers?.values?.() ?? [])].some((r) => r.bundleType === 1))
  for (const visit of [1, 2, 3, 4]) {
    await c.go('inbox')
    await h.waitForTimeout(600)
    await h.evaluate(RECORD)
    await c.go('settings')
    await h.waitForSelector('nav[data-sections] [data-section][aria-current="page"]', { timeout: 15000 })
    await h.waitForTimeout(500)
    const frames = await h.evaluate(() => ((window.__cf.on = false), window.__cf.frames))
    const first = frames.findIndex((one) => one.shown)
    const bare = frames.filter((one) => one.shown && !one.mark).length
    const said = `visit ${visit}: ${frames.length} frames, the row first on show in frame ${first}, ${bare} frames of it without its mark`
    if (dev) console.log(`(dev-mode build, not held to it) ${said}`)
    else check(`Settings, visit ${visit}: the chosen section has its mark from its first frame`, first >= 0 && bare === 0, said)
  }
  // Another section chosen with the pointer: the mark goes to it.
  const before = await h.evaluate(() => document.querySelector('nav[data-sections] > [data-glide]:not(.opacity-0)')?.style.transform ?? null)
  const other = h.locator('nav[data-sections] [data-section]:not([aria-current="page"])').first()
  const name = await other.getAttribute('data-section')
  await other.click()
  await h.waitForTimeout(700)
  const after = await h.evaluate(() => ({ at: document.querySelector('nav[data-sections] > [data-glide]:not(.opacity-0)')?.style.transform ?? null, chosen: document.querySelector('nav[data-sections] [data-section][aria-current="page"]')?.getAttribute('data-section') ?? null }))
  check(`choosing “${name}” makes it the chosen section`, after.chosen === name, `chosen: ${after.chosen}`)
  check('the mark moved to it', !!after.at && after.at !== before, `${before} -> ${after.at}`)
  // And back by the keys: the mark follows.
  await h.keyboard.press('ArrowUp')
  await h.waitForTimeout(600)
  const back = await h.evaluate(() => document.querySelector('nav[data-sections] > [data-glide]:not(.opacity-0)')?.style.transform ?? null)
  check('↑ takes the choice, and the mark, back up', !!back && back !== after.at, `${after.at} -> ${back}`)
  check('nothing went wrong in the page', c.errors.length === 0, c.errors.slice(0, 2).join(' | '))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
