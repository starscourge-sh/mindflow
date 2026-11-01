// "One line to start", Spotlight's way: the pill's round controls stay beside it, shown and still (the user: "the
// options pop in and out ungracefully"); Tab chooses among them (the chosen one filled, its name in the bar), ⇧Tab
// moves back, Esc lets go without putting the box away, and a word typed lets go too. The pointer moves nothing. Frames every 50ms of open, Tab out, Tab between, Esc back, type past a line, / and #, light and dark, into
// QA_SHOTS/spot-<look>/.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/pill-controls.mjs
import { mkdirSync } from 'fs'
import { checks } from './harness.mjs'
import { CALM_HOUR, sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
process.env.HALIGTREE_QA_VIRTUAL ??= '1'

const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760, at: CALM_HOUR })
const { page, v } = c
const wait = (ms) => page.waitForTimeout(ms)
const shots = process.env.QA_SHOTS ?? '/tmp/spot'
const film = process.env.QA_FILM !== '0'
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const reopen = async () => {
  await page.evaluate(() => window.api.hidePrompt()); await wait(700)
  await page.evaluate(() => window.api.showPrompt()); await wait(1300)
}
const state = () => page.evaluate(() => {
  const all = [...document.querySelectorAll('.mf-top [data-aside] > *, .mf-top .mf-pill button')].filter((one) => one.offsetWidth)
  return {
    out: document.documentElement.hasAttribute('data-controls-out'),
    shown: all.filter((one) => Number(getComputedStyle(one).opacity) > 0.9).length,
    count: all.length,
    picked: all.findIndex((one) => one.hasAttribute('data-picked')),
    name: document.querySelector('[data-control-name][data-shown]')?.textContent ?? null,
    pill: !!document.querySelector('.app-container[data-pill]')
  }
})
const boxUp = () => c.electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('/index.html')).isVisible())
async function roll(dir, name, ms, act) {
  if (!film) return void (await act(), await wait(ms))
  let n = 0
  let going = true
  const rolling = (async () => {
    while (going) {
      const at = Date.now()
      await page.screenshot({ path: `${dir}/${name}-${String(n++).padStart(2, '0')}.png` }).catch(() => {})
      await new Promise((r) => setTimeout(r, Math.max(0, 50 - (Date.now() - at))))
    }
  })()
  await act()
  await wait(ms)
  going = false
  await rolling
}
try {
  await v('settings:set', { hintRate: 0, rotCount: 0, sounds: false, boxOneLine: true })
  await reopen()
  for (const look of ['light', 'dark']) {
    const dir = `${shots}/spot-${look}`
    if (film) mkdirSync(dir, { recursive: true })
    await page.evaluate((n) => (localStorage.setItem('theme', n), window.dispatchEvent(new StorageEvent('storage', { key: 'theme' }))), look === 'light' ? 'paper' : 'dark')
    await page.evaluate(() => window.api.hidePrompt()); await wait(800)
    await roll(dir, '1-open', 700, () => page.evaluate(() => window.api.showPrompt()))
    await page.mouse.move(2, 2); await wait(300)
    const rest = await state()
    check(`${look}: at rest, the pill with its controls shown beside it, none chosen`, rest.pill && !rest.out && rest.shown === rest.count && rest.count >= 3, JSON.stringify(rest))
    await roll(dir, '2-tab-out', 600, () => page.keyboard.press('Tab'))
    const out = await state()
    check(`${look}: Tab chooses the first control, named in the bar`, out.out && out.shown === out.count && out.picked === 0 && !!out.name, JSON.stringify(out))
    await roll(dir, '3-tab-between', 500, () => page.keyboard.press('Tab'))
    const next = await state()
    check(`${look}: Tab moves to the next, its name in the bar`, next.picked === 1 && next.name && next.name !== out.name, JSON.stringify(next))
    await page.keyboard.press('Shift+Tab'); await wait(200)
    check(`${look}: ⇧Tab moves back`, (await state()).picked === 0)
    await roll(dir, '4-esc-back', 500, () => page.keyboard.press('Escape'))
    const back = await state()
    check(`${look}: Esc lets go, the controls still shown, and the box stays up`, !back.out && back.picked === -1 && back.shown === back.count && (await boxUp()), JSON.stringify(back))
    await page.keyboard.press('Tab'); await wait(300)
    await page.click(EDITOR).catch(() => {}); await page.keyboard.type('a'); await wait(400)
    check(`${look}: a word typed lets go`, !(await state()).out)
    await page.keyboard.press('Backspace')
    // The pointer near them chooses nothing and moves nothing.
    const bar = await page.evaluate(() => { const r = document.querySelector('.app-container').getBoundingClientRect(); return { x: r.right + 30, y: r.top + r.height / 2 } })
    await page.mouse.move(bar.x, bar.y); await wait(500)
    const near = await state()
    check(`${look}: the pointer near them chooses nothing, all still shown`, !near.out && near.shown === near.count, JSON.stringify(near))
    await page.mouse.move(2, 2); await wait(300)
    await roll(dir, '5-slash', 700, async () => { await page.click(EDITOR).catch(() => {}); await page.keyboard.type('/') })
    await roll(dir, '6-slash-close', 700, async () => { await page.keyboard.press('Escape'); await page.keyboard.press('Backspace') })
    await roll(dir, '7-tag', 700, () => page.keyboard.type('#ro'))
    await roll(dir, '8-tag-close', 700, async () => { await page.keyboard.press('Escape'); for (let i = 0; i < 3; i++) await page.keyboard.press('Backspace') })
    await roll(dir, '9-past-a-line', 900, () => page.keyboard.type('A line long enough to run past the end of the pill and wrap onto a second line of its own.', { delay: 4 }))
    await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace'); await wait(500)
  }
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
