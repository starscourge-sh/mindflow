// Quick capture, the Inbox and pins, driven in the real app on sandbox data:
// every pin in the sidebar (quiet hours too) and the top three in the box (50,
// 32); a kind picked by hand beats a task tag (35); the kind picker opens over
// the box at its size, a line a kind (62); Tidy's bar keeps Tag, Come back,
// Next and Done, J and K only with vim keys on (27); the shred is slower (23);
// the Inbox grouped by kind as islands in the box, on Everything and on a tag
// page (30); the Graph beside the kinds (24); captures as marks on the
// Calendar's Day (45b); ⇧⌘.'s area pick lands in the box under a picture (18);
// the box thrown to an edge by ⌃⌥ and an arrow, and back there next time (40).
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 MINDFLOW_QA_FAKE_SCREEN=1 MINDFLOW_QA_VIRTUAL=1 [SHOT=<dir>] [THEME=dark] [WIDTH=900 HEIGHT=700] node qa/inbox-wave.mjs
import { mkdirSync, writeFileSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const SHOT = process.env.SHOT ?? ''
if (SHOT) mkdirSync(SHOT, { recursive: true })
const { check, done } = checks()
// 23:30, in quiet hours (22:00 to 07:00 by default): an unsorted pin must still show.
// THEME=dark and WIDTH/HEIGHT for the shots in another look and size.
const c = await sandbox({ width: Number(process.env.WIDTH ?? 1300), height: Number(process.env.HEIGHT ?? 900), at: '23:30' })
const { page, electron, h, v } = c
const wait = (ms) => page.waitForTimeout(ms)
const boxWin = (code, arg) => electron.evaluate(({ BrowserWindow }, [code, a]) => new Function('win', 'a', code)(BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('view=')), a), [code, arg])
const shot = async (name, which = 'box') => {
  if (!SHOT) return
  if (which === 'home') return void (await h.screenshot({ path: `${SHOT}/${name}.png` }))
  const png = await electron.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('view=')).webContents.capturePage()).toPNG().toString('base64'))
  writeFileSync(`${SHOT}/${name}.png`, Buffer.from(png, 'base64'))
}
const step = async (name, run) => {
  try {
    await run()
  } catch (error) {
    check(`${name}: ran without error`, false, String(error).slice(0, 300))
  }
}
const doc = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const make = (text, kind = 'note') => page.evaluate(([b, k]) => window.api.captures.create({ kind: k, body: b }), [doc(text), kind])
const showBox = async () => {
  await page.evaluate(() => window.api.showPrompt())
  await wait(900)
}

try {
  await v('settings:set', { hintRate: 0, motion: true, safeMode: false, pinnedQuestions: false, celebrate: false, boxDim: false })
  if (process.env.THEME) (await c.theme(process.env.THEME), await page.reload(), await wait(1500))
  await h.waitForTimeout(1500)

  // --- 50 and 32: every pin in the sidebar, at night too; the box keeps three.
  await step('pins', async () => {
    for (const one of await v('pins')) await v('pin', one.type === 'capture' ? 'captures' : 'nuggets', one.id, false)
    const ids = []
    for (let n = 1; n <= 5; n++) ids.push(await make(`Pinned in quiet hours ${n} #wave`))
    let refused = 0
    for (const id of ids) if (!(await v('pin', 'captures', id, true))) refused++
    check('a fourth and fifth pin are taken, not refused', refused === 0, `${refused} refused`)
    const pins = await v('pins')
    check('all five pins are listed, unsorted and at 23:30', ids.every((id) => pins.some((one) => one.id === id)), `${pins.length} pins`)
    await h.waitForTimeout(1200)
    const side = await h.evaluate(() => [...document.querySelectorAll('aside nav [data-side-drop="pinned"] [data-drag-open^="capture:"]')].map((one) => one.textContent.trim()))
    check('the sidebar shows Pinned with every pin', side.length === 5 && side.every((one) => /Pinned in quiet hours/.test(one)), side.join(' | '))
    await shot('pins-sidebar', 'home')
    await showBox()
    await page.keyboard.press('Control+1')
    await wait(800)
    const boxPins = await page.evaluate(() => document.querySelectorAll('[data-pin]').length)
    const chip = await page.evaluate(() => document.querySelector('[data-waiting]')?.textContent ?? '')
    check('quick capture shows the top three', boxPins === 3, `${boxPins} in the box`)
    check('the box\'s chip does not count more than it shows', !/[4-9] pinned/.test(chip), chip)
    for (const id of ids) await v('pin', 'captures', id, false)
  })

  // --- 35: Note picked by hand, with a task tag.
  await step('kind wins', async () => {
    const tag = 'wavetask'
    await v('tag:set', tag, { action: true })
    await page.reload()
    await wait(1500)
    await showBox()
    await page.locator('.ProseMirror').first().click()
    await page.keyboard.press('Meta+1')
    await wait(200)
    await page.keyboard.type(`#${tag} pre-made decks to look at `, { delay: 10 })
    await wait(600)
    const said = await page.evaluate(() => document.querySelector('[data-will-do]')?.textContent ?? '')
    check('a Note picked by hand says the tag keeps it a note', /kept as a note, as you chose/.test(said) && !/Add to your tasks/.test(said), said)
    await shot('kind-wins')
    await page.keyboard.press('Meta+2')
    await wait(500)
    const asTask = await page.evaluate(() => document.querySelector('[data-will-do]')?.textContent ?? '')
    check('picking Task by hand still makes it a task', !/as you chose/.test(asTask), asTask)
    await page.keyboard.press('Meta+1')
    await wait(300)
    await page.keyboard.press('Meta+Enter')
    await wait(1200)
    const made = (await page.evaluate(() => window.api.captures.list())).find((one) => one.label.includes('pre-made decks to look at'))
    const tasks = await v('tasks')
    check('sent, it is a note and no task was made', made && made.kind === 'note' && !tasks.some((one) => (one.title ?? '').includes('pre-made decks')), made ? `${made.kind}, ${made.status}` : 'not found')
  })

  // --- 62: the kind picker never grows the box.
  await step('kind picker', async () => {
    await showBox()
    await page.keyboard.press('Meta+n')
    await wait(800)
    const before = await boxWin('return win.getBounds().height')
    await page.keyboard.press('Control+l')
    await wait(900)
    const rows = await page.evaluate(() => [...document.querySelectorAll('[data-keeps-size] [cmdk-item]')].map((one) => Math.round(one.getBoundingClientRect().height)))
    const during = await boxWin('return win.getBounds().height')
    await shot('kind-picker')
    check('the picker opens without the box growing', during === before, `${before} → ${during}`)
    check('every kind is one line', rows.length >= 8 && rows.every((one) => one <= 36), rows.join(','))
    await page.keyboard.press('Escape')
    await wait(900)
    const after = await boxWin('return win.getBounds().height')
    check('closed, the box is the size it was', after === before, `${before} → ${after}`)
  })

  // --- 27: Tidy's keys.
  await step('tidy keys', async () => {
    await make('A capture to tidy, with a line to bold')
    await page.evaluate(() => localStorage.setItem('vim', 'off'))
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:pass', { detail: { mode: 'tidy' } })))
    await wait(1500)
    // Read without spaces: the labels roll letter by letter.
    const bar = () => page.evaluate(() => document.querySelector('[data-pass] footer, footer')?.innerText.replace(/\s+/g, '') ?? '')
    const plain = await bar()
    check('Tidy shows Tag, Come back, Next and Done', /Tag/.test(plain) && /Comeback/.test(plain) && /Next/.test(plain) && /Done/.test(plain), plain)
    check('…and not Bold, Fold, Cross off, J or K', !/Boldtheline|Fold|Crossoff|J|K/.test(plain), plain)
    await shot('tidy-bar')
    await page.keyboard.press('Shift+/')
    await wait(400)
    const all = await bar()
    check('"?" shows the rest', /Boldtheline/.test(all) && /Crossoff/.test(all) && /⇧↵/.test(all), all)
    await page.keyboard.press('Shift+/')
    await page.evaluate(() => { localStorage.setItem('vim', 'on'); window.dispatchEvent(new StorageEvent('storage', { key: 'vim', newValue: 'on' })) })
    await wait(400)
    const vim = await bar()
    check('with vim keys on, Next says J', /NextJ/.test(vim), vim)
    await page.evaluate(() => { localStorage.setItem('vim', 'off'); window.dispatchEvent(new StorageEvent('storage', { key: 'vim', newValue: 'off' })) })
    await page.keyboard.press('Escape')
    await wait(800)
  })

  // --- 30: islands by kind in the box's Inbox.
  await step('islands', async () => {
    for (let n = 1; n <= 7; n++) await make(`Island note ${n}`)
    for (let n = 1; n <= 2; n++) await make(`“Island quote ${n}” - Someone`, 'quote')
    await page.evaluate(() => localStorage.setItem('view:prompt:captures', JSON.stringify({ sort: 'newest', group: 'kind', filter: { status: ['open'] } })))
    await page.reload()
    await wait(1500)
    await showBox()
    await page.keyboard.press('Control+1')
    await wait(900)
    const islands = await page.evaluate(() => [...document.querySelectorAll('[data-island]')].map((one) => ({ name: one.getAttribute('data-island'), rows: one.querySelectorAll('[data-row]').length, more: one.querySelector('[data-island-more]')?.textContent ?? '' })))
    const notes = islands.find((one) => one.name === 'Note')
    check('the box\'s Inbox is islands, one a kind', islands.length >= 2 && !!notes && islands.some((one) => one.name === 'Quote'), JSON.stringify(islands))
    check('a long kind shows 5, and "Show N more" under them', notes && notes.rows === 5 && /Show \d+ more/.test(notes.more), JSON.stringify(notes))
    await shot('islands-box')
    await page.locator('[data-island="Note"] [data-island-more]').click()
    await wait(500)
    const whole = await page.evaluate(() => document.querySelectorAll('[data-island="Note"] [data-row]').length)
    check('"Show more" shows them all', whole > 5, `${whole} rows`)
    await page.locator('[data-island-head="Note"]').click()
    await wait(500)
    const folded = await page.evaluate(() => ({ rows: document.querySelectorAll('[data-island="Note"] [data-row]').length, open: document.querySelector('[data-island-head="Note"]')?.getAttribute('aria-expanded') }))
    check('an island folds to its heading', folded.rows === 0 && folded.open === 'false', JSON.stringify(folded))
    await page.locator('[data-island-head="Note"]').click()
    // Everything, in the main window.
    await h.evaluate(() => localStorage.setItem('view:captures:All captures', JSON.stringify({ sort: 'newest', group: 'kind', filter: {}, pane: 'list', density: 'list' })))
    await h.reload()
    await h.waitForTimeout(2000)
    await c.go('all')
    await h.waitForTimeout(1200)
    const every = await h.evaluate(() => [...document.querySelectorAll('[data-island]')].map((one) => one.getAttribute('data-island')))
    check('Everything grouped by kind is islands too', every.length >= 2, every.join(', ') + ' ' + await h.evaluate(() => location.search + ' ' + (document.querySelector('main h1, header h1')?.textContent ?? '')))
    await shot('islands-everything', 'home')
    // A tag's page.
    await h.evaluate(() => localStorage.setItem('view:tag:wave', JSON.stringify({ sort: 'newest', group: 'kind', filter: {} })))
    await make('“A quote for the wave tag” - Someone #wave', 'quote')
    await make('A note for the wave tag #wave')
    await c.send('tag', 'wave')
    await h.waitForTimeout(1500)
    const tagIslands = await h.evaluate(() => [...document.querySelectorAll('[data-tag-islands] [data-island]')].map((one) => one.getAttribute('data-island')))
    check('a tag page grouped by kind is islands', tagIslands.length >= 2, tagIslands.join(', '))
    await shot('islands-tag', 'home')
  })

  // --- 24: the Graph beside the Inbox's kinds.
  await step('graph', async () => {
    await make('Graph one #alpha #beta')
    await make('Graph two #alpha')
    await make('Graph three #beta #gamma')
    await page.reload()
    await wait(1500)
    await showBox()
    await page.keyboard.press('Control+1')
    await wait(800)
    const chip = page.locator('[data-filter-chips] button', { hasText: 'Graph' }).first()
    check('Graph sits beside the kinds', (await chip.count()) === 1)
    await chip.click()
    await wait(1500)
    const graph = await page.evaluate(() => ({ on: document.querySelector('[data-inbox-graph]')?.getAttribute('data-inbox-graph'), canvas: !!document.querySelector('[data-inbox-graph] canvas'), said: document.querySelector('[data-inbox-graph-said]')?.textContent ?? '', rows: document.querySelectorAll('[data-row]').length }))
    check('the box shows captures clustered by shared tags', graph.on === 'captures' && graph.canvas && /captures?/.test(graph.said), JSON.stringify(graph))
    await shot('graph-captures')
    await page.locator('[data-inbox-graph] button[aria-label="Tags"]').click()
    await wait(1200)
    const tags = await page.evaluate(() => ({ on: document.querySelector('[data-inbox-graph]')?.getAttribute('data-inbox-graph'), said: document.querySelector('[data-inbox-graph-said]')?.textContent ?? '' }))
    check('…and a tag graph', tags.on === 'tags' && /tags?/.test(tags.said), JSON.stringify(tags))
    await shot('graph-tags')
    await chip.click()
    await wait(600)
    check('Graph again is back to the list', !(await page.evaluate(() => !!document.querySelector('[data-inbox-graph]'))))
  })

  // --- 45b: captures as marks on the Calendar's Day.
  await step('calendar marks', async () => {
    await h.evaluate(() => localStorage.setItem('vigil.calendar.mode', 'day'))
    await c.go('calendar')
    await h.waitForTimeout(1500)
    const marks = await h.evaluate(() => document.querySelectorAll('[data-cal-capture]').length)
    check('today\'s captures show as marks at their time', marks >= 5, `${marks} marks`)
    await shot('calendar-day', 'home')
    await h.locator('[data-day-show]').click()
    await h.waitForTimeout(400)
    await h.locator('[data-day-captures-switch]').click()
    await h.keyboard.press('Escape')
    await h.waitForTimeout(500)
    const off = await h.evaluate(() => document.querySelectorAll('[data-cal-capture]').length)
    check('the switch hides them', off === 0, `${off} marks`)
    await h.locator('[data-day-show]').click()
    await h.waitForTimeout(300)
    await h.locator('[data-day-captures-switch]').click()
    await h.keyboard.press('Escape')
  })

  // --- 18: ⇧⌘.'s area pick, into the box.
  await step('area into box', async () => {
    await boxWin('win.hide()')
    await wait(600)
    await page.keyboard.press('Meta+n').catch(() => undefined)
    const ok = await electron.evaluate(async () => { if (!globalThis.areaIntoBox) return false; await globalThis.areaIntoBox(); return true })
    await wait(1500)
    const now = await page.evaluate(() => {
      const editor = document.querySelector('.ProseMirror')
      const sel = window.getSelection()
      const caret = sel?.anchorNode instanceof Element ? sel.anchorNode : sel?.anchorNode?.parentElement
      return { picture: !!editor?.querySelector('img'), under: !!caret?.closest('p') && !!caret.closest('p').previousElementSibling, focused: document.activeElement?.closest?.('.ProseMirror') !== null }
    })
    const shown = await boxWin('return win.isVisible()')
    check('the area pick runs from the key', ok)
    check('quick capture comes up with the picture in', shown && now.picture, JSON.stringify({ shown, ...now }))
    check('…and the caret on the line under it', now.under && now.focused, JSON.stringify(now))
    await shot('area-into-box')
  })

  // --- 40: thrown to an edge, and back there next time.
  await step('throw', async () => {
    await showBox()
    const area = await electron.evaluate(({ screen, BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('view='))
      return screen.getDisplayMatching(win.getBounds()).workArea
    })
    await page.keyboard.press('Control+Alt+ArrowLeft')
    await wait(900)
    let at = await boxWin('return win.getBounds()')
    check('⌃⌥← throws the box to the left edge', Math.abs(at.x - (area.x + 12)) <= 2, `${at.x} vs ${area.x + 12}`)
    await page.keyboard.press('Control+Alt+ArrowDown')
    await wait(900)
    at = await boxWin('return win.getBounds()')
    check('⌃⌥↓ then takes it to the bottom left corner', Math.abs(at.x - (area.x + 12)) <= 2 && Math.abs(at.y + at.height - (area.y + area.height - 12)) <= 2, JSON.stringify(at))
    const spot = { x: at.x, y: at.y }
    await page.keyboard.press('Escape')
    await wait(600)
    await boxWin('win.hide()')
    await wait(400)
    await showBox()
    at = await boxWin('return win.getBounds()')
    check('summoned again, it is back where it was thrown', Math.abs(at.x - spot.x) <= 2 && Math.abs(at.y - spot.y) <= 40, `${JSON.stringify(spot)} → ${at.x},${at.y}`)
    // A flick with ⌘ held: wheel events toward the right.
    await page.mouse.move(200, 200)
    await page.keyboard.down('Meta')
    for (let n = 0; n < 6; n++) await page.mouse.wheel(-20, 0)
    await page.keyboard.up('Meta')
    await wait(900)
    at = await boxWin('return win.getBounds()')
    const right = area.x + area.width - at.width - 12
    const left = area.x + 12
    check('⌘ and a two-finger flick throws it sideways', Math.abs(at.x - right) <= 2 || Math.abs(at.x - left) <= 2, `${at.x} (left ${left}, right ${right})`)
  })
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
