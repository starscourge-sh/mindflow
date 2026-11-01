// Quick capture's hint sits out of the card, in the room above its top left edge, beside the round controls and
// never over them. The card, its footer and the round controls do not move when it comes or goes; it fades at the
// first word, waits while ⌘K is open, and waits unseen with the box near the top of the screen. Frames every 50ms
// through open, type, ⌘K and close, light and dark, into QA_SHOTS/hint-frames-<look>/.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/hint-room.mjs
import { mkdirSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760 })
const { page, v } = c
const wait = (ms) => page.waitForTimeout(ms)
const shots = process.env.QA_SHOTS ?? '/tmp'
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'

/** Where the card sits on the screen (main's own record), and where its footer and round controls sit in it. */
const where = () => page.evaluate(() => {
  const card = document.querySelector('.app-container').getBoundingClientRect()
  const rel = (el) => { const r = el.getBoundingClientRect(); return [Math.round(r.left - card.left), Math.round(r.top - card.top), Math.round(r.width), Math.round(r.height)] }
  return {
    footer: rel(document.querySelector('main[data-zen-row]') ?? document.querySelector('.app-container')),
    controls: [...document.querySelectorAll('.mf-top [data-aside] > *, .mf-top .mf-pill button')].filter((one) => one.getBoundingClientRect().width).map(rel),
    size: [Math.round(card.width), Math.round(card.height)]
  }
})
const screenCard = () => c.electron.evaluate(({ BrowserWindow }) => {
  const box = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.webContents.getURL().includes('/index.html'))
  return box ? box.getBounds() : null
})
const hint = () => page.evaluate(() => {
  const room = document.querySelector('[data-hint-room]')
  const one = document.querySelector('[data-hint-card], [data-hint-room] [data-hint-surface]')
  if (!one) return null
  const r = one.getBoundingClientRect()
  const card = document.querySelector('.app-container').getBoundingClientRect()
  const controls = [...document.querySelectorAll('.mf-top [data-aside] > *, .mf-top .mf-pill button')].filter((el) => el.getBoundingClientRect().width).map((el) => el.getBoundingClientRect())
  return {
    top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right),
    cardTop: Math.round(card.top), cardLeft: Math.round(card.left),
    firstControl: Math.round(Math.min(...controls.map((x) => x.left))),
    overControl: controls.some((x) => !(x.right <= r.left || x.left >= r.right || x.bottom <= r.top || x.top >= r.bottom)),
    opacity: room ? Number(getComputedStyle(room).opacity) : 1
  }
})
const reopen = async () => {
  await page.evaluate(() => window.api.hidePrompt()); await wait(500)
  await page.evaluate(() => window.api.showPrompt()); await wait(1400)
}
/** A frame every 50ms for `ms`, while `act` runs. */
async function film(dir, name, ms, act) {
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
  await v('settings:set', { hintRate: 0, rotCount: 0, sounds: false })
  await reopen()
  if (await page.$('[aria-label="Hide the side panel"]')) { await page.keyboard.press('Meta+Backslash'); await wait(1000) }
  // Low enough on the screen for a hint's room above it.
  await c.electron.evaluate(({ BrowserWindow, screen }) => {
    const box = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.webContents.getURL().includes('/index.html'))
    if (box) box.setPosition(box.getBounds().x, screen.getPrimaryDisplay().workArea.y + 240)
  })
  await reopen()
  await reopen()
  const bare = { card: await screenCard(), in: await where() }

  await v('settings:set', { hintRate: 1 })
  await page.evaluate(() => { Math.random = () => 0.99 })
  await reopen()
  await page.waitForSelector('[data-hint-card]', { timeout: 5000 }).catch(() => {})
  await page.mouse.move(2, 2); await wait(500)
  const shown = await hint()
  check('a hint came', !!shown, JSON.stringify(shown))
  check('the hint is out of the card, above its top edge', shown && shown.bottom <= shown.cardTop - 4 && shown.top >= 0, JSON.stringify(shown))
  check('…its left edge on the card\'s left edge', shown && Math.abs(shown.left - shown.cardLeft) <= 1, JSON.stringify(shown))
  check('…and it never covers a round control', shown && !shown.overControl && shown.right <= shown.firstControl - 8, JSON.stringify(shown))
  const withHint = { card: await screenCard(), in: await where() }
  check('the card stays exactly where it opens without a hint (on the screen)', JSON.stringify(withHint.card) === JSON.stringify(bare.card), `${JSON.stringify(bare.card)} vs ${JSON.stringify(withHint.card)}`)
  check('the footer and round controls sit where they do without a hint', JSON.stringify(withHint.in) === JSON.stringify(bare.in), `${JSON.stringify(bare.in)} vs ${JSON.stringify(withHint.in)}`)

  await page.click(EDITOR); await page.keyboard.type('a'); await wait(400)
  const typed = await hint()
  check('the first keystroke sends the hint off (faded, clicks pass)', !typed || typed.opacity === 0, JSON.stringify(typed))
  check('…and nothing in the card moved', JSON.stringify(await where()) === JSON.stringify(withHint.in))
  await page.keyboard.press('Backspace'); await wait(300)

  await reopen()
  await page.waitForSelector('[data-hint-card]', { timeout: 5000 }).catch(() => {})
  await page.keyboard.press('Meta+k'); await wait(600)
  const searching = await hint()
  check('⌘K open: the hint waits unseen', !searching || searching.opacity === 0, JSON.stringify(searching))
  await page.keyboard.press('Escape'); await wait(400)

  // Near the top of the screen: no room above for it, so it waits.
  await c.electron.evaluate(({ BrowserWindow, screen }) => {
    const box = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.webContents.getURL().includes('/index.html'))
    if (box) box.setPosition(box.getBounds().x, screen.getPrimaryDisplay().workArea.y + 20)
  })
  await reopen()
  const high = await hint()
  check('the box near the top of the screen: the hint waits unseen, never cut off', !high || high.opacity === 0 || high.top >= 0, JSON.stringify(high))

  for (const look of ['light', 'dark']) {
    const dir = `${shots}/hint-frames-${look}`
    mkdirSync(dir, { recursive: true })
    await page.evaluate((n) => (localStorage.setItem('theme', n), window.dispatchEvent(new StorageEvent('storage', { key: 'theme' }))), look === 'light' ? 'paper' : 'dark')
    await c.electron.evaluate(({ BrowserWindow, screen }) => {
      const box = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.webContents.getURL().includes('/index.html'))
      if (box) box.setPosition(box.getBounds().x, screen.getPrimaryDisplay().workArea.y + 240)
    })
    await page.evaluate(() => window.api.hidePrompt()); await wait(500)
    await film(dir, '1-open', 1200, () => page.evaluate(() => window.api.showPrompt()))
    await page.mouse.move(2, 2)
    await film(dir, '2-type', 500, async () => { await page.click(EDITOR); await page.keyboard.type('a') })
    await page.keyboard.press('Backspace'); await reopen()
    await film(dir, '3-cmdk', 700, () => page.keyboard.press('Meta+k'))
    await page.keyboard.press('Escape'); await wait(300)
    await film(dir, '4-close', 500, () => page.evaluate(() => window.api.hidePrompt()))
  }
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
