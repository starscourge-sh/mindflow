// Words in a note made into a gem stay in place, marked as kept: a wash over
// exactly those words and a small gem at their end that opens it. Checks the
// mark and its tip, that it is saved with the note and back on reopening,
// click and ⌘-click open the gem, the gem page says where it came from, the
// Bin dims it and taking it out brings it back, Undo and deleting for good
// take the mark off, editing inside keeps it and deleting the words drops it,
// Markdown has no trace of it. The same for a capture and a task made from a
// line, in a note's own window, and in quick capture (the words stay there,
// marked, and the gem points back once the note is saved). Shots in light and dark.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOT=<dir>] node qa/gem-line.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOT = process.env.SHOT ?? ''
if (SHOT) mkdirSync(SHOT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1100, height: 780 })
const { electron, h, v, send, page: box } = c
const wait = (ms) => h.waitForTimeout(ms)
const looks = [['light', 'paper'], ['dark', 'dark']]
const shoot = async (p, name) => {
  if (!SHOT) return
  for (const [look, theme] of looks) {
    await p.evaluate((t) => { localStorage.setItem('theme', t); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }, theme)
    await p.waitForTimeout(400)
    await p.screenshot({ path: `${SHOT}/${name}-${look}.png` })
  }
  await p.evaluate(() => { localStorage.setItem('theme', 'paper'); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) })
  await p.waitForTimeout(250)
}

/** Select a phrase in the page's note editor holding it. */
const select = (p, phrase) => p.evaluate((phrase) => {
  const dom = [...document.querySelectorAll('.ProseMirror')].find((one) => one.textContent.includes(phrase))
  const editor = dom?.editor
  if (!editor) return false
  let at = -1
  editor.state.doc.descendants((node, pos) => {
    if (at < 0 && node.isText && node.text.includes(phrase)) at = pos + node.text.indexOf(phrase)
  })
  if (at < 0) return false
  editor.chain().focus().setTextSelection({ from: at, to: at + phrase.length }).run()
  return true
}, phrase)
/** The words under each kept mark, by its id, and its mark's state. */
const marks = (p) => p.evaluate(() => {
  const out = {}
  for (const one of document.querySelectorAll('.ProseMirror .mf-kept[data-kept-id]')) out[one.dataset.keptId] = (out[one.dataset.keptId] ?? '') + one.textContent
  return out
})
const iconOf = (p, id) => p.locator(`.mf-kept-icon[data-kept-for="${id}"] button`)
const stateOf = (p, id) => p.evaluate((id) => document.querySelector(`.mf-kept-icon[data-kept-for="${id}"]`)?.dataset.keptState ?? null, id)
const toastText = (p) => p.evaluate(() => [...document.querySelectorAll('[role=status], [data-sonner-toast]')].map((one) => one.textContent).join(' | '))
const gemWith = async (words) => (await v('items', 'nugget')).find((one) => one.title === words)
const tipText = (p) => p.evaluate(() => [...document.querySelectorAll('[role=tooltip], [data-slot=tooltip-content]')].map((one) => one.textContent).join(' | '))
const markdownOf = (p, phrase) => p.evaluate((phrase) => {
  const editor = [...document.querySelectorAll('.ProseMirror')].find((one) => one.textContent.includes(phrase))?.editor
  return editor ? editor.storage.markdown.manager.serialize(editor.getJSON()) : null
}, phrase)

try {
  await v('settings:set', { hintRate: 0, countIn: false })
  const TITLE = 'Notes on the river walk'
  const note = await h.evaluate((title) => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: title }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Water always finds the lowest path, and so do tired walkers.' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Pack a spare pair of socks for the second day.' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'The heron waited without moving for ten minutes.' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Book the ferry back before Friday.' }] }
  ] } }), TITLE)
  await send('capture', note)
  await wait(1600)

  // --- a gem, reworded first ----------------------------------------------------
  const WORDS = 'Water always finds the lowest path'
  check('the note is open, the words picked', await select(h, WORDS))
  await wait(400)
  await h.locator('[aria-label="Gem"]:visible').first().click()
  await wait(350)
  await h.keyboard.press('Meta+Enter')
  await wait(1400)
  const gem = await gemWith(WORDS)
  check('saved as a gem', !!gem)
  let seen = await marks(h)
  check('the words stay in the note, marked as kept, exactly them', gem && seen[gem.id] === WORDS, JSON.stringify(seen))
  check('one gem mark at their end', gem && (await iconOf(h, gem.id).count()) === 1)
  check('the mark sits right after the words', gem && await h.evaluate((id) => document.querySelector(`.mf-kept[data-kept-id="${id}"]`)?.nextElementSibling?.matches(`.mf-kept-icon[data-kept-for="${id}"]`) ?? false, gem.id))
  const said = await toastText(h)
  check('the notice says the line stays and is marked', /Saved as a gem; the line is marked in your note/.test(said), said)
  await h.mouse.move(5, 300)
  await shoot(h, '1-gem-marked')

  // The tip, on the mark.
  await iconOf(h, gem.id).hover()
  await wait(900)
  const tip = await tipText(h)
  check('its tip: Kept as a gem: click to open it', /Kept as a gem: click to open it/.test(tip), tip)
  await shoot(h, '2-gem-tip')
  await h.mouse.move(5, 300)

  // Saved with the note, and back when it opens again.
  await wait(1500)
  const saved = JSON.stringify((await h.evaluate((id) => window.api.captures.get(id), note))?.body ?? '')
  check('saved in the note itself', saved.includes(`"keptId":"${gem.id}"`))
  await c.go('today')
  await send('capture', note)
  await wait(1600)
  seen = await marks(h)
  check('reopened: the words are still marked', seen[gem.id] === WORDS, JSON.stringify(seen))
  check('reopened: the mark is back', (await iconOf(h, gem.id).count()) === 1)

  // The gem knows where it came from.
  const from = (await v('lineage', gem.id))?.from ?? []
  check('the gem says it came from this note', from.some((one) => one.id === note), JSON.stringify(from))
  const became = (await v('lineage', note))?.became ?? []
  check('and the note lists the gem it became', became.some((one) => one.id === gem.id))

  // A click on the mark opens the gem.
  await iconOf(h, gem.id).click()
  await wait(1600)
  const opened = await h.evaluate((words) => [...document.querySelectorAll('.ProseMirror')].some((one) => one.textContent.trim() === words), WORDS)
  check('a click on the mark opens the gem', opened)
  // Its Family names the note it came from: in words where there is room, else on the node's own label (lineage.tsx).
  // Family sits in the details panel: opened if it is shut.
  const details = h.locator('button[aria-label="Details"][aria-pressed="false"]').first()
  if (await details.count()) { await details.click(); await wait(900) }
  check('its page says “From” the note', await h.evaluate((title) => document.body.innerText.includes(title) || [...document.querySelectorAll('[aria-label], [data-tip]')].some((one) => (one.getAttribute('aria-label') ?? one.getAttribute('data-tip') ?? '').includes(title)), TITLE))
  await shoot(h, '3-gem-opened')

  // ⌘-click on the marked words opens it too.
  await send('capture', note)
  await wait(1500)
  const word = h.locator(`.mf-kept[data-kept-id="${gem.id}"]`).first()
  await word.click({ modifiers: ['Meta'] })
  await wait(1600)
  check('⌘-click on the marked words opens the gem', await h.evaluate((words) => [...document.querySelectorAll('.ProseMirror')].some((one) => one.textContent.trim() === words), WORDS))

  // The Bin: the words dim, the mark says so; out of the Bin, back as it was.
  await send('capture', note)
  await wait(1500)
  await v('bin:put', gem.id)
  await wait(1200)
  check('gem in the Bin: the mark dims', (await stateOf(h, gem.id)) === 'bin')
  check('and the words lose their colour', await h.evaluate((id) => !!document.querySelector(`.mf-kept[data-kept-id="${id}"] > .mf-kept-binned`), gem.id))
  await iconOf(h, gem.id).hover()
  await wait(900)
  const binTip = await tipText(h)
  check('its tip says: Gem in the Bin', /Gem in the Bin/.test(binTip), binTip)
  await shoot(h, '4-gem-in-bin')
  await h.mouse.move(5, 300)
  await v('bin:restore', 'nugget', gem.id)
  await wait(1200)
  check('out of the Bin: kept again', (await stateOf(h, gem.id)) === 'live')

  // Editing inside the words keeps the mark; text typed just after them is not marked.
  await h.evaluate((id) => {
    const editor = document.querySelector('.ProseMirror').editor
    let end = -1
    editor.state.doc.descendants((node, pos) => { if (node.isText && node.marks.some((m) => m.attrs.keptId === id)) end = pos + node.nodeSize })
    editor.chain().focus().setTextSelection(end - 4).insertContent('wet ').setTextSelection(end + 4).insertContent(' (noted)').run()
  }, gem.id)
  await wait(500)
  seen = await marks(h)
  check('typing inside the words keeps the mark over them', seen[gem.id] === 'Water always finds the lowest wet path', JSON.stringify(seen))
  check('words typed just after are not marked', !String(seen[gem.id]).includes('noted'))

  // Markdown: the words, nothing else.
  const md = await markdownOf(h, 'heron')
  check('Markdown has the words and no trace of the mark', md && md.includes('Water always finds the lowest wet path (noted)') && !/kept|data-|<span|💎/.test(md), md)

  // --- ⌘-click Gem: kept as is, then Undo ----------------------------------------
  const HERON = 'The heron waited without moving'
  check('the heron line picked', await select(h, HERON))
  await wait(600)
  await h.locator('[aria-label="Gem"]:visible').first().click({ modifiers: ['Meta'] })
  await wait(1400)
  const heron = await gemWith(HERON)
  check('⌘-click Gem keeps it as is, marked', heron && (await marks(h))[heron.id] === HERON)
  await h.locator('[data-sonner-toast] button, [role=status] button', { hasText: 'Undo' }).first().click()
  await wait(1400)
  check('Undo: the gem goes', heron && !(await v('item', heron.id)))
  check('Undo: the mark goes, the words stay', heron && !(await marks(h))[heron.id] && (await iconOf(h, heron.id).count()) === 0 && await h.evaluate((w) => document.querySelector('.ProseMirror').textContent.includes(w), HERON))

  // --- deleted for good: the mark goes ---------------------------------------------
  await v('bin:put', gem.id)
  await v('bin:forget', 'nugget', gem.id)
  await wait(1400)
  check('gem deleted for good: the mark goes', !(await marks(h))[gem.id] && (await iconOf(h, gem.id).count()) === 0)

  // --- a capture and a task from a line ----------------------------------------------
  const SOCKS = 'Pack a spare pair of socks'
  await select(h, SOCKS)
  await wait(400)
  await h.locator('[aria-label="Capture"]:visible').first().click({ modifiers: ['Meta'] })
  await wait(1400)
  const capture = (await h.evaluate(() => window.api.captures.list())).find((one) => (one.label ?? '').trim() === SOCKS)
  check('Capture from the words: they stay, marked as kept in the Inbox', capture && (await marks(h))[capture.id] === SOCKS)
  check('the capture notice says so', /In your Inbox; the line is marked in your note/.test(await toastText(h)), await toastText(h))
  const FERRY = 'Book the ferry back'
  await select(h, FERRY)
  await wait(500)
  await h.locator('[aria-label="Task"]:visible').first().click()
  await wait(1500)
  const task = (await v('tasks')).find((one) => one.title === FERRY)
  check('Task from the words: they stay, marked as a task', task && (await marks(h))[task.id] === FERRY)
  check('the task notice says so', /the line is marked in your note/.test(await toastText(h)), await toastText(h))
  await h.mouse.move(5, 300)
  await shoot(h, '5-capture-and-task')
  await h.locator('[data-sonner-toast] button, [role=status] button', { hasText: 'Undo' }).first().click()
  await wait(1400)
  check('Undo the task: its mark goes', task && !(await marks(h))[task.id])

  // Deleting all the marked words drops the mark.
  await h.evaluate((id) => {
    const editor = document.querySelector('.ProseMirror').editor
    let from = -1, to = -1
    editor.state.doc.descendants((node, pos) => { if (node.isText && node.marks.some((m) => m.attrs.keptId === id)) { if (from < 0) from = pos; to = pos + node.nodeSize } })
    editor.chain().focus().deleteRange({ from, to }).run()
  }, capture?.id)
  await wait(500)
  check('the marked words deleted: no mark left', capture && !(await marks(h))[capture.id] && (await iconOf(h, capture.id).count()) === 0)
  check('no errors in the main window', !c.errors.length, c.errors.slice(0, 2).join(' | '))

  // --- a note in its own window -----------------------------------------------------
  await v('notes:window', 'capture', note)
  let nw
  for (let i = 0; i < 40 && !nw; i++) { nw = electron.windows().find((w) => w.url().includes('note=capture')); await wait(250) }
  await nw.waitForSelector('.ProseMirror')
  await nw.waitForTimeout(1400)
  const NW = 'waited without moving'
  await select(nw, NW)
  await nw.waitForTimeout(400)
  await nw.keyboard.press('Control+Meta+i')
  await nw.waitForTimeout(350)
  await nw.keyboard.press('Meta+Enter')
  await nw.waitForTimeout(1400)
  const nwGem = await gemWith(NW)
  check('note window: ⌃⌘I then save marks the words', nwGem && (await marks(nw))[nwGem.id] === NW)
  check('note window: its mark shows', nwGem && (await iconOf(nw, nwGem.id).count()) === 1)
  await nw.mouse.move(5, 300)
  await shoot(nw, '6-note-window')
  await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('note='))?.close())

  // --- quick capture: the words stay, marked ---------------------------------------------
  await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => !/[?&](view|note)=/.test(w.webContents.getURL()))?.show())
  await box.waitForTimeout(600)
  await c.qa.reset()
  await c.qa.type(['Morning pages help me think slowly and clearly'])
  const BOX = 'think slowly and clearly'
  await select(box, BOX)
  await box.waitForTimeout(300)
  await box.keyboard.press('Control+Meta+i')
  await box.waitForTimeout(350)
  await box.keyboard.press('Meta+Enter')
  await box.waitForTimeout(1400)
  const boxGem = await gemWith(BOX)
  check('quick capture: the gem is made', !!boxGem)
  check('quick capture: the words stay in the note, marked', boxGem && (await marks(box))[boxGem.id] === BOX && (await iconOf(box, boxGem.id).count()) === 1)
  await box.mouse.move(5, 5)
  await box.screenshot({ path: SHOT ? `${SHOT}/7-quick-capture-light.png` : `${process.env.QA_DATA}/qc.png` })
  // Sent: the note is kept, and the gem points back to it.
  await box.locator('.ProseMirror').first().click()
  await box.keyboard.press('Meta+End')
  await box.keyboard.press('Meta+Enter')
  await box.waitForTimeout(2200)
  const kept = (await h.evaluate(() => window.api.captures.list())).find((one) => /Morning pages/.test(one.label ?? ''))
  const boxFrom = boxGem ? ((await v('lineage', boxGem.id))?.from ?? []) : []
  check('quick capture sent: the gem says it came from the note', kept && boxFrom.some((one) => one.id === kept.id), JSON.stringify(boxFrom))
} catch (error) {
  check('ran to the end', false, String(error?.stack ?? error).slice(0, 400))
} finally {
  const passed = results.filter(Boolean).length
  console.log(`\n${passed}/${results.length} passed`)
  await c.close()
  process.exit(passed === results.length ? 0 : 1)
}
