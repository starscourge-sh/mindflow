// Every way the side panel comes out in quick capture, driven: ⌘\, the panel button, the pinned chip, ⌃J, ⌃1 to ⌃5,
// ⇧⌘Y, and Settings' choice for the box (the main window's switch, heard by the box). Each from the one-line pill (the
// box alone for Settings): it lands as the box with its panel on the list it names, the window's frame never moving,
// and ⌘\ puts it back. With the panel out, the pinned chip only turns to the Inbox: no move runs (the frost off and on
// again under a shape that did not change, with a slide for nothing).
//   QA_DATA=<copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/box-ways-in.mjs
import { CALM_HOUR, sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
process.env.HALIGTREE_QA_VIRTUAL ??= '1'

const c = await sandbox({ width: 1100, height: 760, at: CALM_HOUR })
const { page, h, v, electron } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const wait = (ms) => page.waitForTimeout(ms)
const EDITOR = '.tiptap.ProseMirror.haligtree-editor'

try {
  await v('settings:set', { hintRate: 0, rotCount: 0, sounds: false, boxOneLine: true, boxGlance: false })
  for (const text of ['How I work', 'haligtree issue tracker']) {
    const id = await h.evaluate((t) => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] } }), text)
    await v('pin', 'captures', id, true).catch(() => {})
  }
  const frame = () => electron.evaluate(({ BrowserWindow }) => { const b = BrowserWindow.prototype.getBounds.call(BrowserWindow.getAllWindows().find((w) => !/view=/.test(w.webContents.getURL()))); return `${b.x},${b.y} ${b.width}x${b.height}` })
  const state = () => page.evaluate(() => ({
    pill: !!document.querySelector('.app-container[data-pill]'),
    panel: !!document.querySelector('.app-container [data-slot=resizable-panel] ~ [data-slot=resizable-panel]'),
    moving: document.documentElement.hasAttribute('data-morph'),
    tab: document.querySelector('[data-box-tab-id][aria-selected=true]')?.getAttribute('data-box-tab-id') ?? ''
  }))
  // Whether a move ran: data-morph set on the page at any moment while watched.
  const watchMoves = () => page.evaluate(() => { window.__moved = false; window.__moves?.disconnect(); window.__moves = new MutationObserver(() => document.documentElement.hasAttribute('data-morph') && (window.__moved = true)); window.__moves.observe(document.documentElement, { attributes: true, attributeFilter: ['data-morph'] }) })
  const moved = () => page.evaluate(() => window.__moved)
  await page.evaluate(() => window.api.showPrompt())
  await wait(1200)
  await page.click(EDITOR)
  const home = await frame()
  const ways = [
    ['⌘\\', () => page.keyboard.press('Meta+Backslash'), null],
    ['the panel button', () => page.locator('[aria-label="Show the side panel"]').first().click(), null],
    ['the pinned chip', () => page.locator('button[data-waiting]').first().click(), 'inbox'],
    ['⌃J', () => page.keyboard.press('Control+j'), null],
    ['⌃1', () => page.keyboard.press('Control+1'), 'inbox'],
    ['⌃2', () => page.keyboard.press('Control+2'), 'today'],
    ['⌃3', () => page.keyboard.press('Control+3'), 'review'],
    ['⌃4', () => page.keyboard.press('Control+4'), 'kept'],
    ['⌃5', () => page.keyboard.press('Control+5'), 'recent'],
    ['⇧⌘Y', () => page.keyboard.press('Meta+Shift+y'), 'recent']
  ]
  for (const [name, act, tab] of ways) {
    const before = await state()
    if (!before.pill) {
      check(`${name}: starts from the pill`, false, JSON.stringify(before))
      continue
    }
    await act()
    await wait(900)
    const after = await state()
    check(`${name}: the box with its panel, landed${tab ? `, on ${tab}` : ''}`, !after.pill && after.panel && !after.moving && (!tab || after.tab === tab), JSON.stringify(after))
    check(`${name}: the window's frame as it was`, (await frame()) === home, `${await frame()} against ${home}`)
    await page.keyboard.press('Escape')
    await page.click(EDITOR).catch(() => {})
    await page.keyboard.press('Meta+Backslash')
    await wait(900)
  }
  // The panel out, on another list: the pinned chip only turns to the Inbox.
  await page.keyboard.press('Control+2')
  await wait(900)
  await watchMoves()
  await page.locator('button[data-waiting]').first().click()
  await wait(600)
  const chip = await state()
  check('the panel out: the pinned chip turns to the Inbox, and no move runs', chip.panel && chip.tab === 'inbox' && !(await moved()), JSON.stringify({ ...chip, moved: await moved() }))
  await page.keyboard.press('Meta+Backslash')
  await wait(900)
  // Settings' choice for the box alone (the main window's switch), heard by the box.
  await v('settings:set', { boxOneLine: false })
  await page.evaluate(() => window.api.hidePrompt())
  await wait(500)
  await page.evaluate(() => window.api.showPrompt())
  await wait(1200)
  await h.evaluate(() => localStorage.setItem('boxPanel', 'open'))
  await wait(1200)
  const set = await state()
  check('Settings: the panel comes out beside the box, landed', set.panel && !set.moving, JSON.stringify(set))
  await h.evaluate(() => localStorage.setItem('boxPanel', 'closed'))
  await wait(1200)
  const unset = await state()
  check('Settings: and goes away again', !unset.panel && !unset.moving, JSON.stringify(unset))
  const errors = c.errors.filter((one) => !/Autofill|DevTools/.test(one))
  check('no page errors', !errors.length, errors.slice(0, 2).join(' / '))
} finally {
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
