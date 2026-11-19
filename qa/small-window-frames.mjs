// Frames of a small window (main/small-window.ts), light and dark, for reading by eye: arriving (its place and
// opacity every 50 ms, and its page), at rest and pointed at, growing a line at a time, resized by hand with
// "Auto-size", its menu, and quick capture beside it. Pictures go to FRAMES (a folder), numbers to the log.
//   FRAMES=<folder> QA_DATA=<copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/small-window-frames.mjs
import { mkdirSync } from 'node:fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
process.env.HALIGTREE_QA_VIRTUAL ??= '1'

const { check, done } = checks()
const out = process.env.FRAMES ?? '/tmp/small-frames'
mkdirSync(out, { recursive: true })
const c = await sandbox({ width: 1100, height: 760 })
const { page: boxPage, electron } = c
const wait = (ms) => boxPage.waitForTimeout(ms)
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line):not(.is-plain)'
const smalls = () => electron.windows().filter((w) => /[?&]small=/.test(w.url()))
const until = async (fn, ms = 8000) => { for (let t = 0; t < ms; t += 50) { const got = await fn(); if (got) return got; await wait(50) } return null }
const numbers = (url) => electron.evaluate(({ BrowserWindow }, tail) => {
  const w = BrowserWindow.getAllWindows().find((one) => !one.isDestroyed() && one.webContents.getURL().endsWith(tail))
  return w ? { ...w.getBounds(), opacity: w.qaOpacity ?? 1 } : null
}, url.slice(url.indexOf('?')))
const shot = (page, name) => page.screenshot({ path: `${out}/${name}.png` }).catch((error) => console.log(`no picture ${name}: ${error.message.split('\n')[0]}`))

try {
  await c.v('settings:set', { hintRate: 0, rotCount: 0, sounds: false, motion: true })
  for (const theme of ['light', 'dark']) {
    await c.look(theme)
    // Arriving from the key: its place and opacity every 50 ms, and its page as it fills.
    const before = smalls().length
    await electron.evaluate(() => globalThis.haligtreeChords.get('⌥⌘.')())
    const win = await until(() => smalls().length > before && smalls().at(-1))
    if (!win) throw new Error('no small window')
    const arrive = []
    for (let i = 0; i < 12; i++) {
      arrive.push(await numbers(win.url()))
      if (i % 3 === 0) await shot(win, `${theme}-arrive-${String(i * 50).padStart(3, '0')}ms`)
      await wait(50)
    }
    console.log(`${theme} arriving, every 50 ms: ${arrive.map((one) => one && `${one.x},${one.y} ${one.width}x${one.height} o${Number(one.opacity).toFixed(2)}`).join(' | ')}`)
    await win.waitForSelector(EDITOR, { timeout: 15000 })
    await wait(600)
    await shot(win, `${theme}-rest-empty`)
    // Pointed at: the window's controls show.
    await win.mouse.move(200, 60); await wait(400)
    await shot(win, `${theme}-pointed-empty`)
    await win.mouse.move(-50, -50); await wait(400)
    // Growing, a line at a time.
    await win.click(EDITOR)
    await win.keyboard.type('Distilling the report', { delay: 15 })
    const card = () => win.evaluate(() => document.querySelector('.app-container')?.offsetHeight ?? 0)
    const heights = [`${await card()}/${(await numbers(win.url())).height}`]
    for (let i = 1; i <= 6; i++) {
      await win.keyboard.type(`The ${i === 1 ? 'first' : i === 2 ? 'second' : `${i}th`} point worth keeping`, { delay: 8 })
      // The new row, filmed from the key that makes it: the card and its window read at each picture, so a card drawn
      // past its window (the edge a frame late) shows in the numbers as well as the pictures.
      await win.keyboard.press('Enter')
      for (let k = 0; k < 4; k++) {
        heights.push(`${await card()}/${(await numbers(win.url())).height}`)
        await shot(win, `${theme}-grow-${i}-${k}`)
      }
    }
    console.log(`${theme} card/window heights, filmed from each new row's key: ${heights.join(' → ')}`)
    await win.mouse.move(-50, -50); await wait(400)
    await shot(win, `${theme}-rest-written`)
    // Resized by hand: "Auto-size".
    await electron.evaluate(({ BrowserWindow }, tail) => {
      const w = BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().endsWith(tail))
      w.setBounds({ ...w.getBounds(), height: 260 }); w.emit('will-resize')
    }, win.url().slice(win.url().indexOf('?')))
    await wait(500)
    await shot(win, `${theme}-resized-autosize`)
    await win.mouse.move(260, 120); await wait(400)
    await shot(win, `${theme}-resized-autosize-pointed`)
    await win.locator('button[data-small-auto]').click().catch(() => {})
    await wait(600)
    await shot(win, `${theme}-autosize-back`)
    // Its menu, the box's own gear menu.
    await win.mouse.move(200, 40); await wait(300)
    await win.getByRole('button', { name: 'Options' }).first().click({ force: true }); await wait(500)
    await shot(win, `${theme}-menu`)
    await win.keyboard.press('Escape'); await wait(300)
    // Quick capture beside it, in the same theme.
    await boxPage.evaluate(() => window.api.showPrompt()); await wait(900)
    await shot(boxPage, `${theme}-box-beside`)
    await boxPage.evaluate(() => window.api.hideWindow()); await wait(300)
    check(`${theme}: frames taken`, true)
  }
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
