// Every new control driven as a person would, with frames about every 50ms through each change:
// pointing at a sourceless quote (its three ways fade in), "Add who" (asked, answered), "Unknown",
// "Not a quote" and ⌘Z, the row's right-click menu (counting floating surfaces), the Questions row
// clicked, G H, and ⌘K "Go to Questions".
//
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_SHOTS=<dir> node qa/journey-b.mjs
import { mkdirSync } from 'node:fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, go, errors } = c
const shots = process.env.QA_SHOTS
const wait = (ms) => h.waitForTimeout(ms)
const doc = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const make = (patch) => h.evaluate((p) => window.api.captures.create(p), patch)
const get = (id) => h.evaluate((one) => window.api.captures.get(one), id)
/** Frames while `act` runs: a picture about every 50ms for `ms`, of `clip` (a box) or the window. */
const frames = async (name, act, ms = 500, clip) => {
  if (!shots) return void (await act(), await wait(ms))
  const dir = `${shots}/frames-${name}`
  mkdirSync(dir, { recursive: true })
  const started = Date.now()
  const going = act()
  let k = 0
  while (Date.now() - started < ms) {
    const at = Date.now()
    await h.screenshot({ path: `${dir}/${String(k++).padStart(2, '0')}.png`, clip }).catch(() => {})
    const left = 50 - (Date.now() - at)
    if (left > 0) await wait(left)
  }
  await going
}
/** Every animation frame for `ms` while `act` runs, read in the page (screenshots manage one in about 200ms): what `pick` returns each frame. */
const sample = async (pick, act, ms = 400) => {
  await h.evaluate(([src, ms]) => { const pick = new Function('return ' + src)(); window.__frames = []; const end = performance.now() + ms; const tick = () => { window.__frames.push(pick()); if (performance.now() < end) requestAnimationFrame(tick) }; requestAnimationFrame(tick) }, [pick.toString(), ms])
  await act()
  await wait(ms + 100)
  return h.evaluate(() => window.__frames)
}
const floating = () => h.evaluate(() => document.querySelectorAll('[role="menu"], [role="tooltip"], [data-radix-popper-content-wrapper], [data-note-preview]').length)

try {
  const asked = await make({ kind: 'quote', body: doc('Well done is better than well said') })
  const unknown = await make({ kind: 'quote', body: doc('Fortune favours the bold') })
  const mine = await make({ kind: 'quote', body: doc('Raycast notes: clipboard history and snippets') })
  await go('sources')
  await wait(1200)
  const island = await h.locator('[data-missing-source]').boundingBox()
  const clip = island ? { x: island.x, y: island.y, width: island.width, height: island.height } : undefined
  const row = (id) => h.locator(`[data-missing-row="${id}"]`)

  // Pointing: the ways fade in, nothing moves. Read every frame: their opacity, and the row's words' box.
  await h.mouse.move(700, 20)
  const reveal = await sample(() => { const r = document.querySelector('[data-missing-row]'); const b = r.querySelector('button').getBoundingClientRect(); return [Number(getComputedStyle(r.querySelector('[data-missing-ways]')).opacity).toFixed(2), Math.round(b.x), Math.round(b.y), Math.round(b.width)].join(' ') }, () => row(mine).hover(), 350)
  console.log('hover frames:', reveal.join(' | '))
  const ops = reveal.map((one) => Number(one.split(' ')[0]))
  check('1a. frame by frame the ways only grow in (0 to 1, never back), and the words do not move by 1px', ops.every((one, k) => k === 0 || one >= ops[k - 1]) && ops.at(-1) === 1 && new Set(reveal.map((one) => one.split(' ').slice(1).join(' '))).size === 1, reveal.slice(0, 3).join(' | '))
  await frames('hover', () => row(asked).hover(), 300, clip)
  check('1. pointed at, the row shows its three ways', (await row(asked).locator('[data-missing-ways]').evaluate((one) => getComputedStyle(one).opacity)) === '1')
  check('2. pointing makes no floating surface (no tip, no card)', (await floating()) === 0, await floating())

  // Add who: asked, typed, kept; the row leaves.
  await row(asked).locator('[data-give-source]').click()
  await h.locator('[data-ask]').waitFor({ timeout: 3000 })
  check('3. "Add who" asks who said it, offering Unattributed and Not a quote', (await h.locator('[data-ask-skip]').textContent()) === 'Unattributed' && (await h.locator('[data-ask-instead]').textContent()) === 'Not a quote')
  await h.keyboard.type('Benjamin Franklin')
  await frames('add-who', () => h.keyboard.press('Enter'), 600, clip)
  check('4. answered, it is kept with them and leaves the list', (await get(asked)).attribution === 'Benjamin Franklin' && (await row(asked).count()) === 0, (await get(asked)).attribution)

  // Unknown.
  await row(unknown).hover()
  await frames('unknown', () => row(unknown).locator('[data-source-unknown]').click(), 600, clip)
  check('5. "Unknown" keeps it a quote, Unattributed', (await get(unknown)).attribution === 'Unattributed')

  // The right-click menu: one surface, its lines doing the work.
  await row(mine).click({ button: 'right' })
  await wait(400)
  const lines = await h.locator('[role="menu"] [role="menuitem"]').allInnerTexts()
  if (shots) await h.screenshot({ path: `${shots}/missing-menu.png` })
  check('6. right-click: Open, Add who…, Source unknown, Not a quote', JSON.stringify(lines.map((one) => one.trim())) === JSON.stringify(['Open', 'Add who…', 'Source unknown', 'Not a quote']), lines.join(' | '))
  const leaving = await sample(() => [...document.querySelectorAll('[data-missing-row]')].map((one) => Math.round(one.getBoundingClientRect().y)).join(',') + ' h' + Math.round(document.querySelector('[data-missing-source]')?.getBoundingClientRect().height ?? 0), () => h.locator('[role="menu"] [role="menuitem"]', { hasText: 'Not a quote' }).click(), 500)
  console.log('not-a-quote frames:', [...new Set(leaving)].join(' | '))
  check('7. from the menu, "Not a quote" makes it a note', (await get(mine)).kind === 'note')
  await h.locator('body').click({ position: { x: 700, y: 30 } }).catch(() => {})
  await h.keyboard.press('Meta+z')
  await wait(900)
  check('8. ⌘Z puts it back as a quote, in the list', (await get(mine)).kind === 'quote' && (await row(mine).count()) === 1, (await get(mine)).kind)

  // Questions: its row, G H, and ⌘K.
  await go('day')
  await frames('questions-row', () => h.locator('aside [data-side-row][aria-label="Questions"]').click(), 500)
  const lit = () => h.evaluate(() => document.querySelector('aside [data-side-row][aria-label="Questions"]')?.getAttribute('aria-current'))
  check('9. the Questions row opens Questions, lit', (await lit()) === 'page')
  await go('day')
  await h.locator('body').click({ position: { x: 1200, y: 30 } }).catch(() => {})
  await h.keyboard.press('Escape')
  await h.keyboard.press('g')
  await h.keyboard.press('h')
  await wait(900)
  check('10. G H opens Questions', (await lit()) === 'page')
  await go('day')
  await h.keyboard.press('Meta+k')
  await wait(500)
  await h.keyboard.type('Go to Questions', { delay: 30 })
  await wait(500)
  const offered = await h.evaluate(() => [...(document.querySelector('[role="dialog"][aria-label="Search"]')?.querySelectorAll('[role="option"], [data-search-at], button, li') ?? [])].map((one) => one.textContent.trim()).filter((t) => /^Go to Questions/.test(t)).slice(0, 2))
  if (shots) await h.screenshot({ path: `${shots}/cmdk-questions.png` })
  await h.keyboard.press('Enter')
  await wait(900)
  check('11. ⌘K "Go to Questions" is offered and opens it', offered.length > 0 && (await lit()) === 'page', offered.join(' | '))
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
