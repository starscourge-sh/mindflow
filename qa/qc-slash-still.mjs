// Typing "/" in quick capture under some writing or two voice notes: the card never moves on the screen (stillness),
// the window makes room for the menu once (it went back and forth every few frames, the menu flipping above and below
// the caret and its preview left over the notes), the menu is wholly inside the window every frame it shows, and its
// preview sits beside it.
// Sampled every frame for a second and a half, light and dark pictures into QA_SHOTS.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/qc-slash-still.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS = `${process.env.QA_ARGS ?? '--sandbox'} --use-fake-device-for-media-stream --use-fake-ui-for-media-stream`

const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760 })
const { page, v } = c
const wait = (ms) => page.waitForTimeout(ms)
const shots = process.env.QA_SHOTS ?? '/tmp'
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const bounds = () => c.electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('view=') && w.isVisible())?.getBounds())
try {
  await v('settings:set', { hintRate: 0, rotCount: 0, sounds: false })
  await page.evaluate(() => window.api.showPrompt())
  await wait(1500)
  if (await page.$('[aria-label="Hide the side panel"]')) { await page.keyboard.press('Meta+Backslash'); await wait(1000) }
  for (const [look, where, under] of [['light', 'middle', 'text'], ['dark', 'middle', 'voice'], ['light', 'low', 'voice'], ['dark', 'low', 'text']]) {
    const theme = `${look}-${where}-${under}`
    await page.evaluate((n) => { localStorage.setItem('theme', n === 'light' ? 'paper' : 'dark'); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }, look)
    await page.click(EDITOR)
    await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace')
    if (under === 'text') for (const line of ['Voice note one', 'Voice note two', 'A third line of writing']) { await page.keyboard.type(line); await page.keyboard.press('Enter') }
    // Two voice notes, as in the user's box, kept one after the other.
    else for (let n = 0; n < 2; n += 1) {
      await page.click('[data-record-button]'); await page.waitForTimeout(450); await page.click('[data-shot="record"]')
      await page.waitForSelector('[data-voice-recorder]', { timeout: 6000 })
      await wait(1200)
      await page.keyboard.press('Meta+Enter')
      await wait(1200)
    }
    await wait(1500)
    await page.click(EDITOR)
    await page.keyboard.press('Meta+ArrowDown')
    // Low on the screen: no room under the card for the menu, so the box has to make room some other way.
    if (where === 'low') {
      await c.electron.evaluate(({ BrowserWindow, screen }) => {
        const win = BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('view=') && w.isVisible())
        const { workArea } = screen.getDisplayMatching(win.getBounds())
        win.setPosition(win.getBounds().x, workArea.y + workArea.height - win.getBounds().height - 4)
      })
      await wait(800)
    }
    const before = await bounds()
    const cardBefore = await page.$eval('.app-container', (one) => one.getBoundingClientRect().top)
    await page.evaluate(() => {
      window.__frames = []
      const sample = () => {
        const card = document.querySelector('.app-container').getBoundingClientRect()
        const menu = document.querySelector('.tiptap-slash-menu')?.getBoundingClientRect()
        const peek = document.querySelector('[data-slash-peek]')?.getBoundingClientRect()
        const seen = (el) => el && getComputedStyle(el).visibility !== 'hidden' && Number(getComputedStyle(el).opacity) > 0.05 && !document.documentElement.hasAttribute('data-growing')
        const shownMenu = document.querySelector('.tiptap-slash-menu')
        window.__frames.push({ ch: document.querySelector('.app-container').offsetHeight, slot: !!document.querySelector('[data-recording], :has(> [data-recorder-slot]:not(:empty))'), g: 'growing' in document.documentElement.dataset, t: performance.now(), sx: window.screenY, card: card.top, menu: menu && seen(shownMenu) ? { top: menu.top, bottom: menu.bottom } : null, peek: peek ? { top: peek.top, bottom: peek.bottom, left: peek.left } : null, menuLeft: menu?.left, menuRight: menu?.right, h: innerHeight })
        if (window.__frames.length < 90) requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    })
    await page.keyboard.type('/')
    await wait(1600)
    await page.screenshot({ path: `${shots}/qc-slash-${theme}.png` })
    const frames = await page.evaluate(() => window.__frames)
    if (process.env.QA_DEBUG) console.log(theme, JSON.stringify(frames.filter((f, i) => i % 3 === 0).map((f) => [Math.round(f.t), f.sx, Math.round(f.card), f.h, f.menu && Math.round(f.menu.bottom), f.peek && Math.round(f.peek.top), f.ch, f.slot, f.g])))
    const after = await bounds()
    const screenTops = frames.map((f) => f.sx + f.card)
    const moved = Math.max(...screenTops) - Math.min(...screenTops)
    check(`${theme}: the card stays put on the screen as "/" opens the menu`, moved <= 1 && Math.abs((after.y - before.y)) <= 1 || moved <= 1, `card moved ${moved}px; window y ${before.y} -> ${after.y}; card top in page ${cardBefore}`)
    // The window makes room for the menu once and stays that size: no going back and forth.
    const changes = frames.filter((f, i) => i && f.h !== frames[i - 1].h).length
    check(`${theme}: the window changes size at most once as the menu opens`, changes <= 1, `${changes} changes: ${[...new Set(frames.map((f) => f.h))].join(', ')}`)
    const sides = new Set(frames.filter((f) => f.menu).map((f) => f.menu.top > f.card + 0 && f.menu.bottom > 300 ? 'below' : 'above'))
    check(`${theme}: the menu stays on one side of the caret`, sides.size <= 1, [...sides].join(', '))
    const cut = frames.filter((f) => f.menu && f.menu.bottom > f.h + 0.5)
    check(`${theme}: the slash menu is never cut off at the window's foot`, cut.length === 0, `${cut.length} of ${frames.filter((f) => f.menu).length} frames; e.g. ${JSON.stringify(cut[0] ?? {})}`)
    const apart = frames.filter((f) => f.menu && f.peek && (f.peek.bottom < f.menu.top || f.peek.top > f.menu.bottom))
    check(`${theme}: the preview stays beside the menu`, apart.length === 0, `${apart.length} frames apart`)
    await page.keyboard.press('Escape')
    await wait(400)
    const orphan = await page.$('[data-slash-peek]')
    check(`${theme}: the preview goes with the menu`, !orphan)
  }
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
