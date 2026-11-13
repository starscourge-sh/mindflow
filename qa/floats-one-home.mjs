// The floating surfaces, 10 Nov: a practice's offer is asked in one place (no
// band at the top middle, no card in quick capture), with Start, Not tonight
// and In 30 min and no keycaps it cannot honour. Since 13 Nov that place is
// inside the window for the sandbox, whose offers never go over the desktop:
// Home's “Now” card (qa/practice-offer-inside.mjs; the corner's card, for a book
// of your own, is qa/practice-offer-corner.mjs). In 30 min and a task's Done each say so with Undo; the
// practice pill is whole in its window, with one bar; a timer that starts and
// ends in the same minute shows no "21:04 → 21:04".
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/floats-one-home.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const results = []
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const wait = (ms) => new Promise((done) => setTimeout(done, ms))
const c = await sandbox({ width: 1200, height: 800, at: '21:02' })
const { electron, h, v, page } = c
const win = async (part) => { for (let i = 0; i < 50; i++) { const f = electron.windows().find((w) => !w.isClosed() && w.url().includes(part)); if (f) return f; await wait(200) } return null }
const shown = () => electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((w) => w.isVisible()).map((w) => w.webContents.getURL().split('?')[1] ?? ''))
const whole = (f) => f.evaluate(() => {
  const panel = document.querySelector('[data-island-panel]')
  const bottom = panel && getComputedStyle(panel).opacity !== '0' ? panel.getBoundingClientRect().bottom : 0
  return { bottom: Math.ceil(bottom), inner: innerHeight, bars: document.querySelectorAll('[data-practice-bar]').length }
})

try {
  await v('settings:set', { sounds: false, countIn: false, focusShows: 'bubble', notify: 'alerts', quietStart: '00:00', quietEnd: '00:00' })
  // On Home, where the “Now” card is (from any other page the window's own notice asks instead).
  await c.go('home')
  await v('practices:check'); await wait(2500)
  const offered = await h.waitForSelector('[data-practice-now]', { timeout: 6000 }).then(() => true, () => false)
  const words = offered ? await h.evaluate(() => document.querySelector('[data-practice-now]').innerText) : ''
  check('the offer comes up on Home’s “Now” card', offered && /Their practice at 21:00/.test(words) && /Read twenty pages before bed/.test(words) && /5 min/.test(words) && !/minutes\?/.test(words), JSON.stringify(words))
  check('with Start, Not tonight and In 30 min', ['Start', 'Not tonight', 'In 30 min'].every((one) => words.includes(one)))
  check('and no keycaps it cannot honour', offered && await h.evaluate(() => !document.querySelector('[data-practice-now] kbd, [data-practice-now] [data-kbd]')))
  const up = await shown()
  check('the sandbox raises no card over the desktop for it', !up.some((u) => u.includes('view=nudge')), JSON.stringify(up))
  check('no band at the top middle: the focus window is not up for it', !up.some((u) => u.includes('view=focus')), JSON.stringify(up))
  await page.evaluate(() => window.api.showPrompt()); await wait(1500)
  check('quick capture has no offer card in it', await page.evaluate(() => !document.querySelector('[data-box-practice], [data-practice-offer]')))
  await page.evaluate(() => window.api.hidePrompt()); await wait(500)

  await h.click('[data-practice-now] [data-practice-later]'); await wait(700)
  const said = await h.evaluate(() => [...document.querySelectorAll('[role="status"]')].map((one) => one.innerText).join(' | '))
  check('“In 30 min” says so, with Undo', /again in 30 minutes/.test(said) && /Undo/.test(said), JSON.stringify(said))
  await h.keyboard.press('Meta+z'); await wait(1500)
  check('Undo puts the offer back', !!(await v('practices:offer')))

  const list = await v('practices:list'); const p = list.find((x) => /read twenty/i.test(x.name)) ?? list[0]
  await v('practices:start', p.id); await page.evaluate(() => window.api.showFocus(true)); await wait(3000)
  const f = await win('view=focus')
  let cut = 0
  for (let i = 0; i < 20; i++) { const one = await whole(f); if (one.bottom > one.inner) cut++; await wait(100) }
  check('the practice pill is never cut off as it opens', cut === 0, `${cut} of 20 frames cut`)
  await f.mouse.move(170, 30); await wait(1200)
  const open = await whole(f)
  check('open, it is whole in its window', open.bottom > 0 && open.bottom <= open.inner, JSON.stringify(open))
  check('with one practice bar, not two', open.bars === 1, JSON.stringify(open))
  const run = await v('focus:now'); if (run?.id) await v('session:cancel', run.id); await wait(2500)

  await v('timer:start', 'Tea', 9000); await page.evaluate(() => window.api.showFocus(true)); await wait(2500)
  const t = await win('view=focus'); await t.mouse.move(170, 30); await wait(1000)
  check('a timer that starts and ends in the same minute shows no span', await t.evaluate(() => !document.querySelector('[data-span-pill]')))
  const tr = await v('focus:now'); if (tr?.id) await v('session:cancel', tr.id); await wait(1500)

  const made = await v('task:add', 'Call the dentist back'); const id = made?.id ?? made
  await h.evaluate(([one]) => window.api.nudge({ kind: 'task', id: one, title: 'Call the dentist back', again: false }), [id])
  const n = await win('view=nudge')
  await n.waitForSelector('[data-nudge-done]', { timeout: 6000 })
  await n.click('[data-nudge-done]'); await wait(700)
  const done = await n.evaluate(() => document.querySelector('[data-nudge-said]')?.innerText ?? '')
  check('“Done” finishes the task and says so, with Undo', (await v('task', id))?.status === 'done' && /Done: Call the dentist back/.test(done) && /Undo/.test(done), JSON.stringify(done))
  await n.click('[data-nudge-undo]'); await wait(700)
  check('Undo opens the task again', (await v('task', id))?.status !== 'done', (await v('task', id))?.status)
  check('no errors', c.errors.length === 0, JSON.stringify(c.errors.slice(0, 3)))
} catch (error) {
  check('the run stopped', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
console.log(`${results.filter(Boolean).length}/${results.length} passed`)
process.exit(results.every(Boolean) ? 0 : 1)
