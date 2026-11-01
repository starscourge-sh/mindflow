// Quick capture's offer of a draft from earlier ("Unsaved from earlier: … · Bring it back"): on an empty box only,
// never while typing; gone for good once a new capture is saved, after it has been shown and passed by three times,
// or a day after it was set aside; a draft of under three letters is not offered; its × lets it go, with Undo.
// And the grabber that moves the box: shown with the pointer in, a grab hand; double-clicked, the box goes home.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/leftover-offer.mjs
import { mkdirSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
process.env.HALIGTREE_QA_VIRTUAL ??= '1'

const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760 })
const { page, v } = c
const wait = (ms) => page.waitForTimeout(ms)
const shots = process.env.QA_SHOTS ?? '/tmp/leftover'
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const reopen = async () => {
  await page.evaluate(() => window.api.hidePrompt()); await wait(500)
  await page.evaluate(() => window.api.showPrompt()); await wait(1200)
}
/** A draft left `hours` ago, set aside as a leftover on the next open. */
const leave = (text, hours = 3) => page.evaluate(([text, hours]) => {
  ;['capture-leftover', 'capture-leftover-at', 'capture-leftover-shown'].forEach((key) => localStorage.removeItem(key))
  localStorage.setItem('capture-draft', JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }))
  localStorage.setItem('capture-draft-at', String(Date.now() - hours * 3600_000))
}, [text, hours])
const offered = async () => !!(await page.$('[data-leftover]'))
try {
  await v('settings:set', { hintRate: 0, rotCount: 0, sounds: false, boxOneLine: false })
  await reopen()
  await leave('what is this?'); await reopen()
  check('a draft from three hours ago: offered on the empty box', await offered())
  await page.click(EDITOR); await page.keyboard.type('new words'); await wait(900)
  check('…never while typing', !(await offered()))
  await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace'); await wait(900)
  check('…and back on the empty box', await offered())

  // Shown and passed by three times: gone on the fourth open.
  await reopen(); await reopen()
  check('shown three times: still offered on the third', await offered())
  await reopen()
  check('…and gone on the fourth open', !(await offered()))

  // A day after it was set aside.
  await leave('what is this?'); await reopen()
  await page.evaluate(() => localStorage.setItem('capture-leftover-at', String(Date.now() - 25 * 3600_000)))
  await reopen()
  check('set aside over a day ago: not offered', !(await offered()))

  // Too small to offer.
  await leave('ok'); await reopen()
  check('a draft of under three letters: not offered', !(await offered()))

  // A new capture saved.
  await leave('what is this?'); await reopen()
  const before = await page.evaluate(async () => (await window.api.captures.list?.())?.length ?? null).catch(() => null)
  await page.click(EDITOR); await page.keyboard.type('a new note to keep'); await wait(600); await page.keyboard.press('Meta+Enter'); await wait(1500)
  const saved = await page.evaluate(() => ({ draft: localStorage.getItem('capture-draft'), left: localStorage.getItem('capture-leftover') }))
  if (process.env.QA_DEBUG) console.log('saved', JSON.stringify(saved), before)
  await reopen()
  check('a new capture saved: the offer is gone for good', !(await offered()))

  // Its ×, and Undo.
  await leave('what is this?'); await reopen()
  if (process.env.QA_SHOTS) for (const look of ['light', 'dark']) {
    await page.evaluate((n) => (localStorage.setItem('theme', n), window.dispatchEvent(new StorageEvent('storage', { key: 'theme' }))), look === 'light' ? 'paper' : 'dark'); await wait(400)
    mkdirSync(shots, { recursive: true }); await page.screenshot({ path: `${shots}/offer-${look}.png` })
  }
  await page.click('[data-leftover-drop]'); await wait(500)
  check('its × lets it go', !(await offered()))
  const undo = await page.$('[role=status] button:has-text("Undo"), [data-sonner-toast] button:has-text("Undo")')
  if (undo) await undo.click()
  else await page.keyboard.press('Meta+z')
  await wait(500)
  check('…and Undo brings the offer back', await offered())

  // The grabber: shown with the pointer in, a grab hand, never over the words; double-clicked, the box goes home.
  await page.mouse.move(600, 400); await page.evaluate(() => document.querySelector('.app-container').classList.add('pointer-in')); await wait(300)
  const grab = await page.evaluate(() => {
    const g = document.querySelector('[data-grabber]')
    const bar = g?.querySelector('span')?.getBoundingClientRect()
    const card = document.querySelector('.app-container').getBoundingClientRect()
    const words = document.querySelector('.tiptap.ProseMirror.haligtree-editor:not(.is-line)')?.getBoundingClientRect()
    return g && bar && { opacity: Number(getComputedStyle(g).opacity), cursor: getComputedStyle(g).cursor, bar: [Math.round(bar.width), Math.round(bar.height)], centred: Math.abs((bar.left + bar.right) / 2 - (card.left + card.right) / 2) <= 1, aboveCard: bar.bottom <= card.top, clearOfWords: !words || g.getBoundingClientRect().bottom <= words.top }
  })
  check('the grabber: a 32x4 bar, centred just above the card, shown with the pointer in, a grab hand, clear of the words', grab && grab.opacity === 1 && grab.cursor === 'grab' && grab.bar[0] === 32 && grab.bar[1] === 4 && grab.centred && grab.aboveCard && grab.clearOfWords, JSON.stringify(grab))
  await c.electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('/index.html')).setPosition(120, 420))
  await page.dblclick('[data-grabber]'); await wait(500)
  const home = await c.electron.evaluate(({ BrowserWindow, screen }) => {
    const b = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('/index.html')).getBounds()
    const area = screen.getDisplayMatching(b).workArea
    return { b, centred: Math.abs(b.x + b.width / 2 - (area.x + area.width / 2)) <= 1 }
  })
  check('double-clicked, the box goes back to the middle of its screen', home.centred, JSON.stringify(home))
  await reopen()
  const kept = await c.electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('/index.html')).getBounds())
  check('…and opens there next time', kept.x === home.b.x && kept.y === home.b.y, JSON.stringify({ kept, home: home.b }))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
