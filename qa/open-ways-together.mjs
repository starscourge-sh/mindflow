// A row's right-click menu keeps every way to open it together (11 Nov: "Open", "Open in…", "Read" and "Open in a
// new tab" stood in four places): "Open" first, "Open in…" right under it, holding "Open in a new tab", "Open to the
// side", "Open in a new window" and "Read", in that order; none of them anywhere else in the menu. Each has a drawing
// of its own (and "Hide until…" is not private's closed eye), every hint keeps to one line, and pointing at a line
// shows no tip over the menu. Then every line is driven to its result with the pointer, and so is every click the
// menu names beside a line (⌥-click, ⌥⌘-click).
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/open-ways-together.mjs
//   SHOTS=dir keeps a picture of the open menu, light and dark.
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 1000 })
const { h, v, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
const MENU = '[data-slot="context-menu-content"]'
const SUB = '[data-slot="context-menu-sub-content"]'
/** The lines of a menu: their first words, their drawing, their hint and how tall it stands, the keys named at their end. */
const read = (box) => h.evaluate((box) => [...(document.querySelector(box)?.querySelectorAll(':scope [role^="menuitem"]') ?? [])].filter((one) => one.closest('[data-slot^="context-menu"][data-slot$="content"]') === document.querySelector(box)).map((one) => {
  const r = one.getBoundingClientRect()
  const hint = one.querySelector('[data-menu-hint]')
  const name = one.querySelector('.truncate, span')
  return {
    words: (name?.textContent ?? one.textContent ?? '').trim().split('\n')[0], all: (one.textContent ?? '').trim(),
    icon: (one.querySelector('svg')?.getAttribute('class') ?? '').split(' ').find((part) => part.startsWith('lucide-')) ?? '',
    hand: getComputedStyle(one).cursor, cut: one.scrollWidth > one.clientWidth + 1, h: Math.round(r.height),
    hint: hint ? { words: hint.textContent, lines: Math.round(hint.getBoundingClientRect().height / parseFloat(getComputedStyle(hint).lineHeight)), cut: hint.scrollWidth > hint.clientWidth + 1 } : null,
    x: Math.round(r.left + Math.min(60, r.width / 2)), y: Math.round(r.top + r.height / 2),
  }
}), box)
const tips = () => h.evaluate(() => document.querySelectorAll('[data-slot="tooltip-content"], [role="tooltip"]').length)
/** The pointer taken to a point as a hand takes it, in steps, so each line on the way hears it move. */
const point = async (x, y) => { await h.mouse.move(x, y, { steps: 6 }); await wait(120) }
const menuOpen = async (box, open = true) => { for (let n = 0; n < 40; n++) { if (!!(await h.evaluate((box) => document.querySelector(box), box)) === open) return true; await wait(60) } return false }
/** Right-click the row, then point at "Open in…" until its lines are out. */
const openIn = async (row) => {
  const at = await row.boundingBox()
  const x = at.x + Math.min(200, at.width / 2)
  await h.mouse.move(x, at.y + at.height / 2, { steps: 4 })
  await h.mouse.click(x, at.y + at.height / 2, { button: 'right' })
  if (!(await menuOpen(MENU))) throw new Error('the row\'s menu did not open')
  await wait(250)
  const lines = await read(MENU)
  const line = lines.find((one) => one.words.startsWith('Open in…'))
  if (!line) return { lines, ways: [] }
  await point(line.x, line.y)
  await menuOpen(SUB)
  await wait(200)
  return { lines, ways: await read(SUB) }
}
/** One of the lines inside "Open in…", pressed with the pointer. */
const pick = async (row, words) => {
  const { ways } = await openIn(row)
  const line = ways.find((one) => one.words.startsWith(words))
  if (!line) throw new Error(`no "${words}" in "Open in…": ${ways.map((one) => one.words).join(' | ')}`)
  await point(line.x, line.y)
  await h.mouse.down(); await h.mouse.up()
  await menuOpen(MENU, false); await wait(700)
}
const shut = async () => { for (let n = 0; n < 3 && (await h.evaluate((box) => !!document.querySelector(box), MENU)); n++) { await h.keyboard.press('Escape'); await wait(200) } }
const panes = () => h.evaluate(() => document.querySelectorAll('[data-pane]').length)
const tabs = () => h.evaluate(() => document.querySelectorAll('[data-tab]').length)
const everyWindow = () => electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((one) => !one.isDestroyed()).map((one) => one.webContents.getURL().replace(/^.*\//, '').slice(0, 80)))
const closeOthers = () => electron.evaluate(({ BrowserWindow }, keep) => { for (const one of BrowserWindow.getAllWindows()) if (!one.isDestroyed() && !keep.includes(one.webContents.getURL().replace(/^.*\//, '').slice(0, 80))) one.destroy() }, startWindows)
/** Where the note with these words is open: the panes that hold it. */
const shows = (words) => h.evaluate((words) => [...document.querySelectorAll('[data-pane]')].filter((pane) => [...pane.querySelectorAll('.tiptap')].some((one) => (one.textContent ?? '').includes(words))).length, words)
let startWindows = []
try {
  await v('settings:set', { sounds: false, hintRate: 0, safeMode: false })
  const note = (words) => h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: words }] }, { type: 'paragraph', content: [{ type: 'text', text: 'Some words to read.' }] }] })
  const id = await note('Ways to open this one')
  const second = await note('A second note for the side')
  await c.go('inbox'); await wait(1200)
  const row = h.locator(`[data-row][data-id="${id}"]`).first()
  const row2 = h.locator(`[data-row][data-id="${second}"]`).first()
  startWindows = await everyWindow()

  // --- The menu itself, dark and light.
  for (const theme of ['dark', 'light']) {
    await c.look(theme)
    const { lines, ways } = await openIn(row)
    const names = lines.map((one) => one.words)
    check(`${theme}: "Open" is the first line and "Open in…" the one right under it`, !!names[0]?.startsWith('Open') && !names[0].startsWith('Open in') && !!names[1]?.startsWith('Open in…'), names.slice(0, 4).join(' | '))
    check(`${theme}: no other way to open stands anywhere else in the menu`, !names.slice(2).some((one) => /^(Open in a new tab|Open to the side|Open in a new window|Read)$/.test(one)), names.join(' | '))
    check(`${theme}: "Open in…" holds the four ways, most used first`, ways.length === 4 && /^Open in a new tab/.test(ways[0].words) && /^Open to the side/.test(ways[1].words) && /^Open in a new window/.test(ways[2].words) && /^Read/.test(ways[3].words), ways.map((one) => one.words).join(' | '))
    check(`${theme}: each of them shows the hand and none is cut short`, ways.length > 0 && ways.every((one) => one.hand === 'pointer' && !one.cut), JSON.stringify(ways.map(({ words, hand, cut }) => ({ words, hand, cut }))))
    // One drawing, one meaning: the ways to open each have their own, and hiding until a day is not private's closed eye.
    const drawn = [lines[0], lines[1], ...ways].map((one) => one?.icon)
    check(`${theme}: "Open", "Open in…" and the four ways each have a drawing of their own`, drawn.every(Boolean) && new Set(drawn).size === drawn.length, drawn.join(' | '))
    const hide = lines.find((one) => /^Hid(e|den) until/.test(one.words)), secret = lines.find((one) => /^Make it (not )?private/.test(one.words))
    check(`${theme}: "Hide until…" and "Make it private" do not share a drawing`, !!hide?.icon && !!secret?.icon && hide.icon !== secret.icon, `${hide?.icon} | ${secret?.icon}`)
    // A hint keeps to one line under its name, in the menu and in every list that opens from it.
    const hinted = [...lines, ...ways].filter((one) => one.hint)
    check(`${theme}: every hint keeps to one line, none cut (${hinted.length} hints)`, hinted.length > 0 && hinted.every((one) => one.hint.lines === 1 && !one.hint.cut), hinted.filter((one) => one.hint.lines !== 1 || one.hint.cut).map((one) => `${one.words}: ${one.hint.words} (${one.hint.lines} lines)`).join(' | '))
    if (process.env.SHOTS) await h.screenshot({ path: `${process.env.SHOTS}/open-ways-${theme}.png` })
    // Pointing at each line in turn, a real hand's path: the list stays out, each line lights alone, no tip shows.
    const seen = []
    for (const one of ways) {
      await point(one.x, one.y); await wait(500)
      seen.push({ words: one.words, out: (await read(SUB)).length, lit: await h.evaluate((box) => [...document.querySelectorAll(`${box} [role^="menuitem"][data-highlighted]`)].length, SUB), tips: await tips() })
    }
    check(`${theme}: pointing at each line keeps the list out, lights that line alone and shows no tip`, seen.length === 4 && seen.every((one) => one.out === 4 && one.lit === 1 && one.tips === 0), JSON.stringify(seen))
    // The other lists of the menu with hints in them: "Turn it into" and "Export".
    for (const name of ['Turn it into', 'Export']) {
      const opener = lines.find((one) => one.words.startsWith(name))
      if (!opener) continue
      await point(opener.x, opener.y); await wait(500)
      const inside = (await read(SUB)).filter((one) => one.hint)
      check(`${theme}: the hints inside "${name}" keep to one line too (${inside.length})`, inside.every((one) => one.hint.lines === 1 && !one.hint.cut), inside.filter((one) => one.hint.lines !== 1 || one.hint.cut).map((one) => `${one.words}: ${one.hint.words}`).join(' | '))
    }
    await shut()
  }

  // --- Every line driven to its result.
  await pick(row, 'Read')
  check('"Read", pressed in "Open in…", opens the note to read', (await h.locator('.mf-read').count()) === 1)
  await h.keyboard.press('Escape'); await wait(700)
  check('Esc leaves reading, back on the list', (await h.locator('.mf-read').count()) === 0 && (await row.count()) === 1)

  const tabsWas = await tabs()
  await pick(row, 'Open in a new tab')
  check('"Open in a new tab" adds one tab, holding the note', (await tabs()) === tabsWas + 1 && (await h.evaluate(() => [...document.querySelectorAll('[data-tab-name]')].some((one) => /Ways to open this one/.test(one.textContent ?? '')))), `${tabsWas} tabs, then ${await tabs()}`)
  // Back to the list's own tab for the next line.
  await h.locator('[data-tab] [role="tab"]').first().click(); await wait(700)

  const windowsWas = (await everyWindow()).length
  await pick(row, 'Open in a new window')
  await wait(900)
  check('"Open in a new window" opens one window more', (await everyWindow()).length === windowsWas + 1, (await everyWindow()).join(' | '))
  await closeOthers(); await wait(400)

  // The clicks the menu names beside its lines: ⌥⌘-click a window of its own, ⌥-click to the side.
  // A row pressed where it is now: the list narrows once a pane opens beside it.
  const press = async (which, keys) => {
    const at = await which.boundingBox()
    for (const key of keys) await h.keyboard.down(key)
    await h.mouse.click(at.x + Math.min(200, at.width / 2), at.y + at.height / 2)
    for (const key of [...keys].reverse()) await h.keyboard.up(key)
    await wait(1200)
  }
  await press(row2, ['Alt', 'Meta'])
  check('⌥⌘-click on a row opens a window of its own, as the menu says beside "Open in a new window"', (await everyWindow()).length === windowsWas + 1, (await everyWindow()).join(' | '))
  await closeOthers(); await wait(400)

  const panesWas = await panes()
  await pick(row, 'Open to the side')
  check('"Open to the side" opens the note in a pane beside the list', (await panes()) === panesWas + 1 && (await shows('Ways to open this one')) >= 1, `${panesWas} panes, then ${await panes()}`)
  await press(row2, ['Alt'])
  check('⌥-click on a row opens it to the side, as the menu says beside "Open to the side"', (await shows('A second note for the side')) >= 1 && (await panes()) >= panesWas + 1, `${await panes()} panes`)

  // Plain "Open", the first line: the note in the list's own pane.
  const at = await row.boundingBox()
  await h.mouse.click(at.x + Math.min(200, at.width / 2), at.y + at.height / 2, { button: 'right' }); await menuOpen(MENU); await wait(250)
  const first = (await read(MENU))[0]
  await point(first.x, first.y); await h.mouse.down(); await h.mouse.up(); await menuOpen(MENU, false); await wait(900)
  // The pane beside the list holds the second note by now, so the first note's words on show again mean "Open" opened it.
  check('"Open", the first line, opens the note', (await shows('Ways to open this one')) >= 1, `shown in ${await shows('Ways to open this one')} panes of ${await panes()}`)
  check('no page errors', !c.errors.some((one) => /PAGEERROR/.test(one)), c.errors.join(' / ').slice(0, 300))
} catch (error) {
  // The whole of what the driver said, not its first line: a timeout names what it was waiting for further down.
  check('the run finished', false, error.message.split('\n').slice(0, 10).join(' ⏎ '))
} finally { await c.close() }
done()
