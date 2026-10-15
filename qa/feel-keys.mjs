// What a key reaches is simply there, and what you are reading waits for you:
// a toast with Undo stays while the pointer rests on it or the window is away;
// ⌘K and “I have 15 minutes” are at rest the frame after their key and gone
// the frame after Esc; a Matrix task sent to another box with 1-4 does not
// tilt; a menu item chosen with Enter does not blink first; a sidebar row for
// a note opened by key does not grow in; a celebration put away by hand
// leaves in well under half a second.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/feel-keys.mjs
import { sandbox } from './sandbox-lib.mjs'

const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1300, height: 860 })
const { h, go, v } = c
const frame = (fn) => h.evaluate(`new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done((${fn})()))))`)
const toastUp = () => h.locator('[role="status"]', { hasText: 'Probe toast' }).count()
const fire = (text) => h.evaluate((t) => window.dispatchEvent(new CustomEvent('vigil:toast', { detail: { text: t, undo: () => {} } })), text)

try {
  await v('settings:set', { sounds: false, hintRate: 0, motion: true })
  await v('onboarding:set', { pageHints: false })
  await go('home')
  await h.mouse.click(600, 400)
  await h.waitForTimeout(300)

  // The toast: under the pointer it waits; once the pointer leaves it goes in its own time.
  await fire('Probe toast, hovered')
  await h.waitForTimeout(400)
  const box = await h.locator('[role="status"]', { hasText: 'Probe toast' }).boundingBox()
  if (box) await h.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await h.waitForTimeout(6600)
  check('A toast with Undo stays while the pointer rests on it', (await toastUp()) === 1)
  // It picks up with the time it had left (about 5.6s), not a fresh 6.
  await h.mouse.move(5, 5)
  await h.waitForTimeout(6200)
  check('It goes once the pointer leaves, in the time it had left', (await toastUp()) === 0)

  // The window away (another app in front): the clock stops, and starts again on return.
  await fire('Probe toast, away')
  await h.evaluate(() => window.dispatchEvent(new Event('blur')))
  await h.waitForTimeout(6600)
  check('A toast waits while the window is in the background', (await toastUp()) === 1)
  await h.evaluate(() => window.dispatchEvent(new Event('focus')))
  await h.waitForTimeout(6400)
  check('It goes after the window comes back', (await toastUp()) === 0)
  await fire('Probe toast, plain')
  await h.waitForTimeout(6600)
  check('An untouched toast still goes on time', (await toastUp()) === 0)

  // ⌘K by key: at rest the next frame, gone the frame after Esc.
  await h.mouse.click(600, 400)
  await h.keyboard.press('Meta+k')
  const open = await frame(() => {
    const scrim = document.querySelector('[role="dialog"][aria-label="Search"]')
    const panel = scrim?.firstElementChild
    return { scrim: scrim && Number(getComputedStyle(scrim).opacity), panel: panel && Number(getComputedStyle(panel).opacity), transform: panel && getComputedStyle(panel).transform }
  })
  check('⌘K is at rest the frame after its key', open.scrim === 1 && open.panel === 1 && (open.transform === 'none' || open.transform === 'matrix(1, 0, 0, 1, 0, 0)'), JSON.stringify(open))
  await h.waitForTimeout(300)
  await h.keyboard.press('Escape')
  // Its old way out took 90ms: gone by 40ms means no fade.
  const shut = await h.evaluate(() => new Promise((done) => setTimeout(() => done(!!document.querySelector('div.fixed[aria-label="Search"]')), 40)))
  check('⌘K is gone at once after Esc', !shut)
  await h.waitForTimeout(300)

  // “I have 15 minutes” reached from ⌘K and Enter.
  await h.keyboard.press('Meta+k')
  await h.waitForTimeout(300)
  await h.keyboard.type('15 minutes')
  await h.waitForTimeout(500)
  await h.keyboard.press('Enter')
  const fits = await frame(() => { const one = document.querySelector('[data-fits]'); return one && { scrim: Number(getComputedStyle(one).opacity), panel: Number(getComputedStyle(one.firstElementChild).opacity) } })
  check('“I have 15 minutes” is at rest the frame after Enter', fits && fits.scrim === 1 && fits.panel === 1, JSON.stringify(fits))
  await h.waitForTimeout(300)
  await h.keyboard.press('Escape')
  check('…and gone the frame after Esc', !(await frame(() => !!document.querySelector('[data-fits]'))))

  // A note opened by key: its sidebar row is simply there.
  // Opened from ⌘K and Enter, the way a note is opened all day.
  const before = await h.evaluate(() => document.querySelectorAll('[data-open-row]').length)
  await h.keyboard.press('Meta+k')
  await h.waitForTimeout(300)
  const note = (await h.evaluate(() => window.api.captures.list())).find((one) => one.kind === 'note' && !one.pinnedAt && !one.archivedAt && one.label.length > 12)
  await h.keyboard.type(note.label.slice(0, 24))
  await h.waitForTimeout(700)
  await h.keyboard.press('Enter')
  const grow = await h.evaluate(() => new Promise((done) => { const seen = []; const t0 = performance.now(); const tick = () => { seen.push(...[...document.querySelectorAll('[data-open-row]')].map((one) => one.style.height).filter((s) => s && s !== 'auto')); if (performance.now() - t0 < 300) requestAnimationFrame(tick); else done({ seen: seen.length, rows: document.querySelectorAll('[data-open-row]').length }) }; tick() }))
  check('A note opened by key adds its sidebar row without growing it', grow.rows > before && grow.seen === 0, `rows ${before} → ${grow.rows}; frames mid-grow ${grow.seen}`)
  await h.waitForTimeout(500)

  // The Matrix: 1 to 4 sends the chosen task without a tilt.
  await go('matrix')
  await h.mouse.click(5, 300)
  await h.keyboard.press('j')
  await h.waitForTimeout(200)
  let tilted = []
  for (const key of ['2', '1', '3', '4']) {
    await h.keyboard.press(key)
    const moving = await frame(() => [...document.querySelectorAll('[data-matrix-list] > div')].map((one) => one.style.transform).filter((s) => s && s !== 'none' && !/^scale\(1\) rotate\(0deg\)$|^none$/.test(s)))
    tilted = tilted.concat(moving)
    await h.waitForTimeout(400)
  }
  check('A Matrix task sent by key does not tilt or settle', tilted.length === 0, tilted.slice(0, 2).join(' | '))

  // A menu item chosen with Enter is not held for the blink.
  await go('all')
  await h.evaluate(() => {
    window.__blinks = 0
    new MutationObserver((list) => list.forEach((m) => m.target.hasAttribute?.('data-blink') && window.__blinks++)).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['data-blink'] })
  })
  const row = h.locator('[data-row]').first()
  await row.click({ button: 'right' })
  await h.waitForTimeout(300)
  const items = await h.evaluate(() => [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].map((one) => one.textContent.trim()))
  const copyAt = items.findIndex((one) => /^Copy/.test(one))
  for (let i = 0; i <= Math.max(copyAt, 0); i++) await h.keyboard.press('ArrowDown')
  await h.keyboard.press('Enter')
  const gone = await h.evaluate(() => new Promise((done) => setTimeout(() => done(!document.querySelector('[role="menu"]')), 150)))
  check('A menu choice made with Enter lands at once, no blink', gone && (await h.evaluate(() => window.__blinks)) === 0, `menu gone at 150ms: ${gone}`)
} finally {
  if (c.errors.length) console.log('errors', c.errors.slice(0, 5))
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
