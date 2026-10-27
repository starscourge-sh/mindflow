// The welcome's goal, as its real card on the desktop, on a fresh install:
//  - a goal entered: the page that says what was done opens the goal's real sticky (a window of its own, draggable,
//    its days left and its road), and the drawn card is gone from the page, a line pointing at the real one instead
//  - Undo takes the sticky away with the goal; Redo brings it back
//  - the next page tucks it into the screen's right edge, as a tab; back on that page it is out again
//  - no goal entered: no goal sticky, and no drawn one
//
//   npx electron-vite build --outDir out-p && QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-p/main/index.js HALIGTREE_QA_AWAY=1 node qa/welcome-goal-sticky.mjs [shots-dir] [light|dark]
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'
// A fresh install, never the sandbox.
process.env.QA_ARGS = (process.env.QA_ARGS ?? '').replace('--sandbox', '').trim()
// Each window keeps the place it was given while really parked off screen, so the sticky's and its tab's places can be read.
process.env.HALIGTREE_QA_VIRTUAL = '1'

const SHOTS = process.argv[2] ?? ''
const THEME = process.argv[3] ?? 'light'
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
let failed = 0
const check = (name, ok, more = '') => {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${more ? `  (${more})` : ''}`)
}
const NEXT = 'footer button:has-text("Next"), footer button:has-text("Show me")'
const chapter = (h) => h.evaluate(() => document.querySelector('.mf-welcome footer .sr-only')?.textContent ?? '')
const toYou = async (h) => {
  const own = await h.waitForSelector('.mf-welcome', { timeout: 8000 }).then(() => true, () => false)
  if (!own) await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:welcome')))
  await h.waitForSelector('.mf-welcome', { timeout: 8000 })
  for (let i = 0; i < 20 && !(await chapter(h)).includes('You'); i++) (await h.click(NEXT), await h.waitForTimeout(700))
  await h.waitForTimeout(900)
}
/** Every goal sticky's window as main has it: shown or not, and where. (A test run keeps every window see-through, so opacity says nothing.) */
const goalWindows = (electron) => electron.evaluate(({ BrowserWindow, screen }) => BrowserWindow.getAllWindows()
  .filter((w) => !w.isDestroyed() && /view=sticky/.test(w.webContents.getURL()) && /type=goal&/.test(w.webContents.getURL()))
  .map((w) => { const b = w.getBounds(); const area = screen.getDisplayMatching(b).workArea; return { url: w.webContents.getURL(), shown: w.isVisible(), ...b, right: area.x + area.width } }))
/** Waits up to `ms` for the goal windows to be as `want` says. */
const waitFor = async (electron, h, want, ms = 4000) => {
  let now = []
  for (const end = Date.now() + ms; Date.now() < end; await h.waitForTimeout(150)) if (want((now = await goalWindows(electron)))) return now
  return now
}
const out = (list) => list.filter((one) => one.shown && one.width > 150)
const tab = (list) => list.filter((one) => one.shown && one.width <= 40 && one.x + one.width === one.right)

const c = await sandbox({ width: 1280, height: 800, seeded: false })
const { h, electron } = c
try {
  await c.theme(THEME)
  await toYou(h)
  await h.fill('input[aria-label="A goal"]', 'Walk the coast path')
  await h.click('.mf-welcome h1')
  await h.waitForTimeout(300)
  check('no goal sticky before the summary', out(await goalWindows(electron)).length === 0)
  await h.click(NEXT)
  await h.waitForSelector('[data-payoff]', { timeout: 6000 })
  const [goal] = (await c.v('items', 'goal')).filter((one) => one.title === 'Walk the coast path')
  let wins = await waitFor(electron, h, (list) => out(list).length === 1)
  check('the summary opens the goal\'s real sticky, a window of its own', out(wins).length === 1 && !!goal && out(wins)[0].url.includes(`id=${goal.id}`), JSON.stringify(wins.map(({ url, ...rest }) => rest)))
  const sticky = electron.windows().find((one) => goal && one.url().includes(`type=goal&id=${goal.id}`))
  await sticky?.waitForSelector('[data-goal-card]', { timeout: 6000 }).catch(() => undefined)
  const card = await sticky?.evaluate(() => {
    const el = document.querySelector('[data-goal-card]')
    return el ? { text: el.innerText.replace(/\s+/g, ' '), drag: getComputedStyle(el).getPropertyValue('-webkit-app-region') || el.style.webkitAppRegion || el.getAttribute('style') } : null
  }).catch(() => null)
  check('it shows the goal and its days left', /Walk the coast path/.test(card?.text ?? '') && /days left/.test(card?.text ?? ''), card?.text?.slice(0, 100))
  check('it is dragged by its card', /drag/.test(card?.drag ?? ''), card?.drag?.slice(0, 80))
  const page = await h.evaluate(() => ({ drawn: !!document.querySelector('[data-goal-desk]'), line: document.querySelector('[data-goal-sticky]')?.textContent ?? '' }))
  check('the drawn card is gone from the page', !page.drawn)
  check('a line points at the real one', /top right/.test(page.line) && /desktop/.test(page.line), page.line)
  if (SHOTS) {
    await h.waitForTimeout(800)
    await h.screenshot({ path: `${SHOTS}/${THEME}-goal-step.png` })
    await sticky?.screenshot({ path: `${SHOTS}/${THEME}-goal-sticky.png` })
  }

  // Undo takes it away with the goal; Redo brings both back.
  await h.click('[data-payoff] [data-made="goal"] button:has-text("Undo")')
  wins = await waitFor(electron, h, (list) => out(list).length === 0)
  check('Undo takes the sticky away', out(wins).length === 0, JSON.stringify(wins.map(({ url, ...rest }) => rest)))
  await h.click('[data-payoff] [data-made="goal"] button:has-text("Redo")')
  wins = await waitFor(electron, h, (list) => out(list).length === 1)
  check('Redo brings it back', out(wins).length === 1)

  // On the next page it tucks into the right edge.
  await h.click(NEXT)
  wins = await waitFor(electron, h, (list) => tab(list).length === 1 && out(list).length === 0)
  check('the next page tucks it into the right edge, as a tab', tab(wins).length === 1 && out(wins).length === 0, JSON.stringify(wins.map(({ url, ...rest }) => rest)))
  if (SHOTS) {
    await h.waitForTimeout(600)
    const tabbed = electron.windows().find((one) => one.url().includes('type=goal&id='))
    await tabbed?.screenshot({ path: `${SHOTS}/${THEME}-goal-tucked.png` })
  }
  // Back on the summary it comes out again, then tucks as it is left.
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:welcome-step', { detail: -1 })))
  await h.waitForSelector('[data-payoff]', { timeout: 4000 }).catch(() => undefined)
  wins = await waitFor(electron, h, (list) => out(list).length === 1)
  check('back on the summary, it is out again', out(wins).length === 1, JSON.stringify(wins.map(({ url, ...rest }) => rest)))
  await h.waitForTimeout(500)
  await h.click(NEXT)
  wins = await waitFor(electron, h, (list) => tab(list).length === 1)
  check('and tucks again as the summary is left', tab(wins).length === 1)
} catch (error) {
  check('ran', false, error.stack)
} finally {
  await c.close()
}

// --- no goal: nothing opens ---
{
  const fresh = mkdtempSync(join(tmpdir(), 'haligtree-qa-'))
  process.env.QA_DATA = fresh
  const d = await sandbox({ width: 1280, height: 800, seeded: false })
  try {
    await toYou(d.h)
    await d.h.click('button[aria-pressed]:has-text("Study")')
    await d.h.click(NEXT)
    await d.h.waitForSelector('[data-payoff]', { timeout: 6000 })
    await d.h.waitForTimeout(2500)
    const wins = await goalWindows(d.electron)
    check('no goal: no goal sticky opens', wins.length === 0, JSON.stringify(wins))
    const page = await d.h.evaluate(() => ({ drawn: !!document.querySelector('[data-goal-desk]'), line: !!document.querySelector('[data-goal-sticky]') }))
    check('no goal: no drawn card and no line about one', !page.drawn && !page.line)
  } catch (error) {
    check('ran without a goal', false, error.stack)
  } finally {
    await d.close()
    rmSync(fresh, { recursive: true, force: true })
  }
}
console.log(failed ? `\n${failed} failed` : '\nall passed')
process.exit(failed ? 1 : 0)
