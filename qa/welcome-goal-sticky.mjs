// The welcome's goal, as its real card on the desktop, on a fresh install:
//  - a goal entered: the page that says what was done opens the goal's real sticky (a window of its own, draggable,
//    its days left and its road), and the drawn card is gone from the page, a line pointing at the real one instead
//  - Undo takes the sticky away with the goal; Redo brings it back
//  - the next page folds it into its pill at the screen's right edge; back on that page it is out again
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
// Out: the whole card. A pill: one line in the desk's stack (its window 36 tall), its right side at the screen's edge.
const out = (list) => list.filter((one) => one.shown && one.height > 100)
const tab = (list) => list.filter((one) => one.shown && one.height < 40 && one.x + one.width >= one.right - 20)

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
  // Its page as Playwright has it: main can show the window a moment before the test is handed its page, so wait for
  // that page rather than read the list once (it was missing under load, and every line after it read nothing).
  const mine = (one) => !!goal && one.url().includes(`type=goal&id=${goal.id}`)
  let sticky = electron.windows().find(mine)
  for (const end = Date.now() + 6000; !sticky && Date.now() < end; await h.waitForTimeout(150)) sticky = electron.windows().find(mine)
  await sticky?.waitForSelector('[data-goal-card]', { timeout: 6000 }).catch(() => undefined)
  const card = await sticky?.evaluate(() => {
    const el = document.querySelector('[data-goal-card]')
    return el ? { text: el.innerText.replace(/\s+/g, ' ') } : null
  }).catch(() => null)
  check('it shows the goal and its days left', /Walk the coast path/.test(card?.text ?? '') && /days left/.test(card?.text ?? ''), card?.text?.slice(0, 100))
  // Haligtree carries a sticky, not the Mac, since 8e91c8317 (lib/carry.ts: a press where the page says `--mf-drag: 1`,
  // as the card does; no system drag region). Held by a real pointer on the card's own words, not its grabber or a
  // button, and moved away from the screen's edge, the window follows as far as the pointer went, as qa/grabber-cards.mjs
  // carries every card: to the point, or drawn onto a guide within SNAP of it (main/snap-lines.ts), as a sticky is.
  const grip = await sticky?.evaluate(() => {
    const box = document.querySelector('[data-goal-card]')?.getBoundingClientRect()
    if (!box) return null
    for (let y = box.top + 14; y < box.bottom - 8; y += 6) {
      for (let x = box.left + 14; x < box.right - 14; x += 10) {
        const at = document.elementFromPoint(x, y)
        if (at && box && !at.closest('button, a, input, textarea, select, [contenteditable="true"], [role="menuitem"], [data-grabber]') && getComputedStyle(at).getPropertyValue('--mf-drag').trim() === '1') return { x, y }
      }
    }
    return null
  }).catch(() => null)
  const wid = sticky ? await electron.evaluate(({ BrowserWindow }, url) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL() === url)?.id, sticky.url()) : null
  let moved = null
  if (grip && wid) {
    await sticky.mouse.move(grip.x, grip.y)
    const before = await electron.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id).getBounds(), wid)
    await sticky.mouse.down()
    await sticky.waitForTimeout(80)
    await sticky.mouse.move(grip.x - 40, grip.y + 30)
    await sticky.waitForTimeout(200)
    const after = await electron.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id).getBounds(), wid)
    await sticky.mouse.up()
    await sticky.waitForTimeout(150)
    moved = { dx: after.x - before.x, dy: after.y - before.y }
  }
  const SNAP = 8
  check('it is dragged by its card', !!moved && Math.abs(moved.dx + 40) <= SNAP && Math.abs(moved.dy - 30) <= SNAP, JSON.stringify({ grip, moved }))
  const page = await h.evaluate(() => ({ drawn: !!document.querySelector('[data-goal-desk]'), line: document.querySelector('[data-goal-sticky]')?.textContent ?? '' }))
  check('the drawn card is gone from the page', !page.drawn)
  check('a line points at the real one', /right of your screen/.test(page.line) && /desktop/.test(page.line), page.line)
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

  // On the next page it folds into its pill at the right edge.
  await h.click(NEXT)
  wins = await waitFor(electron, h, (list) => tab(list).length === 1 && out(list).length === 0)
  check('the next page folds it into its pill at the right edge', tab(wins).length === 1 && out(wins).length === 0, JSON.stringify(wins.map(({ url, ...rest }) => rest)))
  if (SHOTS) {
    await h.waitForTimeout(600)
    const tabbed = electron.windows().find((one) => one.url().includes('type=goal&id='))
    await tabbed?.screenshot({ path: `${SHOTS}/${THEME}-goal-tucked.png` })
  }
  // Back on the summary it comes out again, then folds as it is left.
  // The welcome takes one press in 400ms (a double press never skips a page): back comes at a person's pace.
  await h.waitForTimeout(500)
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:welcome-step', { detail: -1 })))
  await h.waitForSelector('[data-payoff]', { timeout: 4000 }).catch(() => undefined)
  wins = await waitFor(electron, h, (list) => out(list).length === 1)
  check('back on the summary, it is out again', out(wins).length === 1, JSON.stringify(wins.map(({ url, ...rest }) => rest)))
  await h.waitForTimeout(500)
  await h.click(NEXT)
  wins = await waitFor(electron, h, (list) => tab(list).length === 1)
  check('and folds again as the summary is left', tab(wins).length === 1)
  // The welcome closed: its goal card stays its pill in the stack, as every goal's card starts.
  for (let i = 0; i < 6 && (await h.$('.mf-welcome')); i++) {
    if (await h.$('.mf-welcome [data-choice]')) await h.keyboard.press('1')
    else await h.click('.mf-welcome footer [data-skip]', { timeout: 3000 }).catch(() => undefined)
    await h.waitForTimeout(1500)
  }
  await h.waitForSelector('.mf-welcome', { state: 'detached', timeout: 15000 }).catch(() => undefined)
  check('the welcome closes', !(await h.$('.mf-welcome')))
  wins = await waitFor(electron, h, (list) => tab(list).length === 1, 6000)
  check('...and its goal card stays its pill in the stack, never left open over the desk', tab(wins).length === 1 && out(wins).length === 0, JSON.stringify(wins.map(({ url, ...rest }) => rest)))
  // Settings' "Tucked at the edge" was retired with the tabs (K2a).
  await c.go('settings')
  await h.waitForSelector('[data-section="What comes back to you"]', { state: 'attached', timeout: 8000 }).catch(() => undefined)
  await h.evaluate(() => document.querySelector('[data-section="What comes back to you"]')?.click())
  await h.waitForTimeout(900)
  check('Settings no longer offers "Tucked at the edge"', (await h.locator('text=Tucked at the edge').count()) === 0)
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
