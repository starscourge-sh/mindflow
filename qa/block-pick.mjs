/**
 * Blocks picked as blocks, as Notion picks them (extensions/picked-blocks.ts): a click on a block's grip picks it (the
 * menu titled for it, its keys on its lines), ⇧↓ ⇧↑ and ⇧ with another grip pick a run, a box drawn from the margin
 * picks every block it touches; each picked block wears its own soft box (4px, a callout's 8px, a table square), a
 * list's items and a task each their own. Picked, they answer ⌫ (one ⌘Z back), ⌘D, Tab and ⇧Tab, ⌘C (the app's
 * stand-in clipboard, qa/pasteboard.mjs), a typed letter goes nowhere, Esc lets go. QA_PART=carry: picked blocks
 * carried together by one's grip, under another block (one card with their count, ⌘Z back in one step) and beside
 * another into a column. QA_PART=rest: a box into a list or out of one picks only the items it touched; "Color" on
 * several colours them all; a box held at the note's edges scrolls it; the menu in Notion's words ("Copy link",
 * "Caption" ⌥⌘M, "Move to…" ⇧⌘P), every row under a resting pointer with the hand and its fill; ⇧⌘P moves picked
 * blocks to another note, one ⌘Z putting both back. Frames under FRAMES (a folder), light and dark.
 */
import { mkdirSync } from 'fs'
import { join } from 'path'
import { open, checks } from './harness.mjs'
import { clearBoard, copiedText } from './pasteboard.mjs'

const { check, done } = checks()
const FRAMES = process.env.FRAMES
if (FRAMES) mkdirSync(FRAMES, { recursive: true })
const PART = process.env.QA_PART ?? 'pick'
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line):not(.is-plain)'
const app = await open()
const { page } = app
await page.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))
await page.setViewportSize?.({ width: 1280, height: 820 }).catch(() => {})

// Lines after the last one, so the note scrolls inside quick capture's box at its full height: a short note's box
// grows while a carry's room opens, moving what the pointer aims at.
const MORE = Array.from({ length: 14 }, (_, at) => `<p>After ${at + 1}</p>`).join('')
const NOTE = `<p>Alpha line</p><ul><li><p>First item</p></li><li><p>Second item</p></li></ul><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>A task to do</p></li></ul><p>Omega line</p><div data-callout><p>A callout line</p></div><table><tbody><tr><td><p>Cell one</p></td><td><p>Cell two</p></td></tr></tbody></table><p>Last line</p>${MORE}`
const seed = async () => {
  await app.reset()
  await page.$eval(EDITOR, (root, html) => root.editor.commands.setContent(html), NOTE)
  await page.waitForTimeout(300)
}
const texts = () => page.$eval(EDITOR, (root) => [...root.querySelectorAll('p')].map((one) => one.textContent.trim()).filter(Boolean))
/** Each picked block's box as drawn: its words, its corner, whether it wears the wash. */
const picked = () => page.$eval(EDITOR, (root) => ({
  kind: root.editor.state.selection.toJSON().type,
  // Its words, as its first line has them (a task's box holds its tick's label too).
  boxes: [...root.querySelectorAll('.mf-picked')].map((one) => ({ words: (one.querySelector('p') ?? one).textContent.trim().slice(0, 24), radius: getComputedStyle(one).borderTopLeftRadius, own: getComputedStyle(one.querySelector('.tiptap-callout') ?? one).borderTopLeftRadius, reach: getComputedStyle(one).boxShadow !== 'none', wash: getComputedStyle(one).backgroundImage !== 'none', cell: getComputedStyle(one.querySelector('td') ?? one).backgroundImage !== 'none' })),
}))
const shot = async (name) => FRAMES && page.screenshot({ path: join(FRAMES, `${name}.png`) })
const block = (words) => page.locator(`${EDITOR} p`, { hasText: words }).first()
/** The grip beside the block with these words, found as a person finds it: the pointer on the block. */
async function grip(words) {
  await block(words).hover()
  await page.waitForTimeout(250)
  const box = await page.locator('.tiptap-drag-handle-grip').boundingBox()
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}
const column = () => page.$eval(EDITOR, (root) => {
  const area = root.getBoundingClientRect()
  const style = getComputedStyle(root)
  return { left: area.left + parseFloat(style.paddingLeft), right: area.right - parseFloat(style.paddingRight) }
})
/** A box drawn from the margin left of the words, from just above `top`'s block (or `dy` from its top) to just inside `bottom`'s. */
async function marquee(top, bottom, name, dy = -4) {
  const edge = await column()
  const a = await block(top).boundingBox()
  const b = await block(bottom).boundingBox()
  // Out past the grip and its + (beside the block the pointer was last on), in the margin round the page.
  const from = { x: edge.left - 90, y: a.y + dy }
  const to = { x: edge.left + 140, y: b.y + b.height - 4 }
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 8, from.y + ((to.y - from.y) * i) / 8)
    await page.waitForTimeout(40)
    if (i === 5) await shot(name)
  }
  const drawn = await page.$$eval('.mf-pick-box', (all) => all.length)
  await page.mouse.up()
  await page.waitForTimeout(120)
  return drawn
}
const theme = async (name) => {
  await page.evaluate((t) => localStorage.setItem('theme', t), name)
  await page.reload()
  await page.waitForSelector(EDITOR)
}

const FIVE = ['Alpha line', 'First item', 'Second item', 'A task to do', 'Omega line']

if (PART === 'pick') {
  for (const look of ['light', 'dark']) {
    await theme(look)
    await seed()
    const before = await texts()
    // One picked by its grip: its own soft box, the menu titled for it.
    const at = await grip('Alpha line')
    await page.mouse.click(at.x, at.y)
    await page.waitForTimeout(250)
    await shot(`${look}-grip-pick`)
    const one = await picked()
    check(`${look}: a click on a block's grip picks it: one soft box, the accent's wash, a 4px corner`, one.boxes.length === 1 && one.boxes[0].words === 'Alpha line' && one.boxes[0].radius === '4px' && one.boxes[0].wash, JSON.stringify(one))
    const menu = await page.evaluate(() => {
      const list = document.querySelector('.tiptap-block-menu')
      return { title: list?.querySelector('[data-kind-heading]')?.textContent ?? '', search: list?.querySelector('input')?.getAttribute('placeholder') ?? '', hints: [...(list?.querySelectorAll('.tiptap-slash-menu-hint') ?? [])].map((one) => one.textContent) }
    })
    check(`${look}: its menu is titled for what it is on ("Paragraph"), with "Search actions…" at its top`, menu.title === 'Paragraph' && menu.search === 'Search actions…', JSON.stringify(menu))
    check(`${look}: and its keys on their lines (⌘C, ⌘D, ⌫)`, ['⌘C', '⌘D', '⌫'].every((key) => menu.hints.includes(key)), menu.hints.join(' '))
    await page.keyboard.press('Escape')
    await page.waitForTimeout(150)
    check(`${look}: Esc closes the menu and the block stays picked`, (await picked()).boxes.length === 1 && !(await page.$('.tiptap-block-menu')), '')

    // A run with ⇧: ⇧↓ twice (a list's two items, then a task), ⇧↑ back one; ⇧ and another block's grip.
    await page.keyboard.press('Shift+ArrowDown')
    await page.keyboard.press('Shift+ArrowDown')
    await page.waitForTimeout(100)
    const down = await picked()
    check(`${look}: ⇧↓ from a picked block picks a run, each list item and the task its own box`, down.boxes.map((one) => one.words).join('|') === FIVE.slice(0, 4).join('|'), down.boxes.map((one) => one.words).join('|'))
    await page.keyboard.press('Shift+ArrowUp')
    await page.waitForTimeout(100)
    check(`${look}: ⇧↑ takes the last one back`, (await picked()).boxes.length === 3, '')
    const omega = await grip('Omega line')
    await page.keyboard.down('Shift')
    await page.mouse.click(omega.x, omega.y)
    await page.keyboard.up('Shift')
    await page.waitForTimeout(150)
    await shot(`${look}-shift-run`)
    const run = await picked()
    check(`${look}: ⇧ and another block's grip picks the run to it, its menu left shut`, run.boxes.map((one) => one.words).join('|') === FIVE.join('|') && !(await page.$('.tiptap-block-menu')), run.boxes.map((one) => one.words).join('|'))
    await page.keyboard.press('Escape')
    await page.waitForTimeout(100)
    check(`${look}: Esc lets go of the pick`, (await picked()).boxes.length === 0, '')

    // A box drawn from the margin over five blocks: two list items and a task among them, each its own box.
    const drawn = await marquee('Alpha line', 'Omega line', `${look}-marquee`)
    const boxed = await picked()
    await shot(`${look}-five-picked`)
    check(`${look}: dragging from the margin draws a box`, drawn === 1, `${drawn}`)
    check(`${look}: the box picks every block it touches, five, each its own box with a 4px corner`, boxed.boxes.map((one) => one.words).join('|') === FIVE.join('|') && boxed.boxes.every((one) => one.radius === '4px' && one.wash), JSON.stringify(boxed.boxes))
    // One left edge: a bullet's box reaches out over its bullet (outside its item), a task's and a line's never past it.
    check(`${look}: every box starts at the words' one left edge: only the two bullet items reach out over their bullets`, boxed.boxes.map((one) => one.reach).join() === 'false,true,true,false,false', boxed.boxes.map((one) => `${one.words}:${one.reach}`).join(', '))
    check(`${look}: the box is gone once let go, the pick kept`, (await page.$$('.mf-pick-box')).length === 0 && boxed.kind === 'nodeRange', boxed.kind)
    // A letter typed over the pick goes nowhere.
    await page.keyboard.press('x')
    await page.waitForTimeout(100)
    check(`${look}: a letter typed over picked blocks writes nothing over them`, JSON.stringify(await texts()) === JSON.stringify(before), (await texts()).join('|'))
    // ⌫ takes them, one ⌘Z brings them back.
    await page.keyboard.press('Backspace')
    await page.waitForTimeout(150)
    const gone = await texts()
    check(`${look}: ⌫ takes the five picked blocks`, FIVE.every((words) => !gone.includes(words)) && gone.includes('A callout line') && gone.includes('Last line'), gone.join('|'))
    await page.keyboard.press('ControlOrMeta+z')
    await page.waitForTimeout(150)
    check(`${look}: one ⌘Z brings all five back`, JSON.stringify(await texts()) === JSON.stringify(before), (await texts()).join('|'))

    // A callout keeps its own 8px corner picked, a table stays square, its cells washed.
    await page.keyboard.press('Escape')
    await marquee('A callout line', 'Cell one', `${look}-callout-table`)
    const kinds = await picked()
    await shot(`${look}-callout-table-picked`)
    const callout = kinds.boxes.find((one) => one.words.includes('A callout'))
    const table = kinds.boxes.find((one) => one.words.startsWith('Cell one'))
    // The callout's own corner is 0.5rem: 8px at the plain text size, a little more where the app is grown.
    check(`${look}: a picked callout's box keeps the callout's own square corner`, !!callout && callout.radius === callout.own, JSON.stringify(callout))
    check(`${look}: a picked table's box stays square, its cells wearing the wash`, table?.radius === '0px' && table?.cell, JSON.stringify(table))
    await page.keyboard.press('Escape')
  }

  // The keys a pick answers, on the light page.
  await theme('light')
  await seed()
  const once = await texts()
  const alpha = await grip('Alpha line')
  await page.mouse.click(alpha.x, alpha.y)
  await page.waitForTimeout(200)
  // The menu shut, the keys are the note's again.
  await page.keyboard.press('Escape')
  await page.waitForTimeout(150)
  await page.keyboard.press('ControlOrMeta+d')
  await page.waitForTimeout(150)
  const twice = await texts()
  const copies = await picked()
  check('⌘D puts a copy of the picked block under it, the copy picked', twice.filter((one) => one === 'Alpha line').length === 2 && copies.boxes.length === 1, twice.join('|'))
  await page.keyboard.press('ControlOrMeta+z')
  await page.waitForTimeout(150)
  check('and ⌘Z takes the copy back', JSON.stringify(await texts()) === JSON.stringify(once), '')
  await page.keyboard.press('Escape')
  // Tab and ⇧Tab move a picked item in and out a level, still picked.
  const second = await grip('Second item')
  await page.mouse.click(second.x, second.y)
  await page.waitForTimeout(200)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(150)
  await page.keyboard.press('Tab')
  await page.waitForTimeout(150)
  const nested = await page.$eval(EDITOR, (root) => !!root.querySelector('li li') && root.querySelector('li li')?.textContent.includes('Second item'))
  check('Tab on a picked list item puts it in under the one above, still picked', nested && (await picked()).boxes.map((one) => one.words).join('|') === 'Second item', JSON.stringify(await picked()))
  await page.keyboard.press('Shift+Tab')
  await page.waitForTimeout(150)
  check('⇧Tab takes it out again', !(await page.$(`${EDITOR} li li`)) && (await picked()).boxes.length === 1, '')
  // ⌘C copies the picked blocks (the app's stand-in clipboard in a test run, never the Mac's).
  await page.keyboard.press('Escape')
  await clearBoard(app.electron)
  await marquee('Alpha line', 'Second item', 'light-copy')
  await page.keyboard.press('ControlOrMeta+c')
  await page.waitForTimeout(150)
  const copied = await copiedText(app.electron)
  check('⌘C copies the picked blocks, the line and both items', ['Alpha line', 'First item', 'Second item'].every((words) => copied.includes(words)), `${copied.length} characters`)

  // A link card's menu, in Notion's words: titled "Link card", and "Turn into link" makes it its title, linked.
  await page.keyboard.press('Escape')
  await page.$eval(EDITOR, (root) => root.editor.commands.setContent('<p>Before the card</p><a data-bookmark href="https://example.org/faust" title="Faust" description="A link\'s card" site="example.org"></a><p>After the card</p>'))
  await page.waitForTimeout(300)
  await page.locator(`${EDITOR} .tiptap-bookmark`).first().hover()
  await page.waitForTimeout(250)
  await page.locator('.tiptap-drag-handle-grip').click()
  await page.waitForTimeout(250)
  await shot('light-link-card-menu')
  const cardMenu = await page.evaluate(() => ({ title: document.querySelector('.tiptap-block-menu [data-kind-heading]')?.textContent ?? '', rows: [...document.querySelectorAll('.tiptap-block-menu .tiptap-slash-menu-title')].map((one) => one.textContent) }))
  check('a link card\'s menu is titled "Link card" and offers "Turn into link"', cardMenu.title === 'Link card' && cardMenu.rows.includes('Turn into link'), JSON.stringify(cardMenu))
  if (await page.$('.tiptap-block-menu [data-turn-into-link]')) await page.locator('.tiptap-block-menu [data-turn-into-link]').click()
  await page.waitForTimeout(250)
  const linked = await page.$eval(EDITOR, (root) => ({ text: root.querySelector('p a[href="https://example.org/faust"]')?.textContent ?? '', cards: root.querySelectorAll('.tiptap-bookmark').length }))
  check('"Turn into link" leaves its title as a link in a line of its own, the card gone', linked.text === 'Faust' && linked.cards === 0, JSON.stringify(linked))
}

if (PART === 'carry') {
  for (const look of ['light', 'dark']) {
    await theme(look)
    await seed()
    const before = await texts()
    // Picked by a box, carried by one's grip under the last line: one card with their count.
    await marquee('Alpha line', 'Omega line', `${look}-carry-pick`)
    const from = await grip('First item')
    const last = await block('Last line').boundingBox()
    const to = { x: from.x + 80, y: last.y + last.height * 0.85 }
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    const seen = []
    for (let i = 1; i <= 14; i++) {
      await page.mouse.move(from.x + ((to.x - from.x) * i) / 14, from.y + ((to.y - from.y) * i) / 14)
      await page.waitForTimeout(50)
      seen.push(await page.evaluate(() => ({ cards: document.querySelectorAll('[data-block-card]').length, count: document.querySelector('[data-block-card]')?.parentElement?.querySelector('[data-carried]')?.textContent ?? '', words: [...document.querySelectorAll('[data-block-card] [data-drag-label]')].at(-1)?.textContent ?? null, lines: document.querySelectorAll('[data-drop-line]').length })))
      if (i === 12) await shot(`${look}-carry-together`)
    }
    await page.waitForTimeout(300)
    const held = seen.slice(-3)
    check(`${look}: carried by one's grip, the picked blocks go as one card with their count (5)`, held.every((one) => one.cards === 1 && one.count === '5'), JSON.stringify(held))
    check(`${look}: the card says what letting go does ("Move 5 here"), one line where they land`, held.every((one) => one.words === 'Move 5 here' && one.lines === 1), JSON.stringify(held))
    await page.mouse.up()
    await page.waitForTimeout(300)
    await shot(`${look}-carry-landed`)
    const after = await texts()
    const under = after.indexOf('Last line')
    check(`${look}: let go, all five land together under the last line, in their order`, JSON.stringify(after.slice(under + 1, under + 6)) === JSON.stringify(FIVE), after.join('|'))
    check(`${look}: and they are still picked where they landed`, (await picked()).boxes.map((one) => one.words).join('|') === FIVE.join('|'), JSON.stringify(await picked()))
    await page.keyboard.press('ControlOrMeta+z')
    await page.waitForTimeout(200)
    check(`${look}: one ⌘Z puts them all back`, JSON.stringify(await texts()) === JSON.stringify(before), (await texts()).join('|'))

    // Beside another block: the line stands up before the drop, and they make a column of the row.
    await page.keyboard.press('Escape')
    const alpha = await grip('Alpha line')
    await page.mouse.click(alpha.x, alpha.y)
    await page.waitForTimeout(200)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(150)
    await page.keyboard.press('Shift+ArrowDown')
    await page.waitForTimeout(100)
    const pair = await picked()
    check(`${look}: the line and the list under it picked to carry beside`, pair.boxes.map((one) => one.words).join('|') === 'Alpha line|First item|Second item', JSON.stringify(pair.boxes.map((one) => one.words)))
    const target = await block('Last line').boundingBox()
    const edge = await column()
    const start = await grip('Alpha line')
    const side = { x: edge.right - 30, y: target.y + target.height / 2 }
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    let upright = false
    for (let i = 1; i <= 14; i++) {
      await page.mouse.move(start.x + ((side.x - start.x) * i) / 14, start.y + ((side.y - start.y) * i) / 14)
      await page.waitForTimeout(50)
      if (i >= 12) upright ||= await page.evaluate(() => [...document.querySelectorAll('[data-drop-line]')].some((one) => one.dataset.dropLine?.startsWith('beside')))
    }
    await page.waitForTimeout(250)
    await shot(`${look}-carry-beside`)
    upright ||= await page.evaluate(() => [...document.querySelectorAll('[data-drop-line]')].some((one) => one.dataset.dropLine?.startsWith('beside')))
    check(`${look}: carried near another block's side, the line stands up beside it before the drop`, upright, JSON.stringify(pair.boxes.map((one) => one.words)))
    await page.mouse.up()
    await page.waitForTimeout(300)
    const row = await page.$eval(EDITOR, (root) => root.editor.getJSON().content.filter((one) => one.type === 'columns').map((one) => one.content.map((col) => col.content.map((block) => block.type).join('+'))))
    check(`${look}: let go, the line and the list stand in a new column beside the last line`, row.length === 1 && row[0].length === 2 && row[0].some((col) => col === 'paragraph+bulletList'), JSON.stringify(row))
    await page.keyboard.press('ControlOrMeta+z')
    await page.waitForTimeout(200)
    const rows = await page.$eval(EDITOR, (root) => root.editor.getJSON().content.filter((one) => one.type === 'columns').length)
    check(`${look}: one ⌘Z puts them back`, JSON.stringify(await texts()) === JSON.stringify(before) && rows === 0, (await texts()).join('|'))
  }
}

if (PART === 'rest') {
  /** The blocks the note holds as the editor has them: each block's kind, words and colour. */
  const blocks = () => page.$eval(EDITOR, (root) => {
    const out = []
    root.editor.state.doc.descendants((node) => {
      if (['paragraph', 'listItem', 'taskItem'].includes(node.type.name)) out.push({ kind: node.type.name, words: node.textContent.slice(0, 20), bg: node.attrs.backgroundColor ?? null })
      return !node.isTextblock
    })
    return out
  })
  const menuRows = () => page.evaluate(() => [...document.querySelectorAll('.tiptap-block-menu [role=menuitem]')].map((one) => ({ title: one.querySelector('.tiptap-slash-menu-title')?.textContent ?? one.textContent.trim(), hint: one.querySelector('.tiptap-slash-menu-hint')?.textContent ?? '' })))
  const scrollTop = () => page.$eval(EDITOR, (root) => (root.closest('.haligtree-editor-content') ?? root).scrollTop)
  for (const look of ['light', 'dark']) {
    await theme(look)
    await seed()
    const before = await texts()

    // 5. A box from a line into a list's first item: the line and that item only, the list's other item left, as Notion picks.
    await marquee('Alpha line', 'First item', `${look}-into-list`)
    await shot(`${look}-into-list-picked`)
    const into = await picked()
    check(`${look}: a box reaching into a list picks only the items it touched (the line and the first item)`, into.boxes.map((one) => one.words).join('|') === 'Alpha line|First item', into.boxes.map((one) => one.words).join('|'))
    await page.keyboard.press('Backspace')
    await page.waitForTimeout(150)
    const left = await texts()
    const still = await page.$eval(EDITOR, (root) => [...root.querySelectorAll('ul:not([data-type]) > li')].map((one) => one.textContent.trim()))
    check(`${look}: ⌫ takes the line and that item, the other item staying in its list`, !left.includes('Alpha line') && !left.includes('First item') && JSON.stringify(still) === '["Second item"]', `${left.slice(0, 4).join('|')} / list: ${JSON.stringify(still)}`)
    await page.keyboard.press('ControlOrMeta+z')
    await page.waitForTimeout(150)
    check(`${look}: one ⌘Z puts both back`, JSON.stringify(await texts()) === JSON.stringify(before), (await texts()).slice(0, 5).join('|'))
    await page.keyboard.press('Escape')
    // Carried by the line's grip under the last line: the line and that item go, the item in a list of its own there.
    await marquee('Alpha line', 'First item', `${look}-into-list-carry`)
    const lift = await grip('Alpha line')
    const foot = await block('Last line').boundingBox()
    const drop = { x: lift.x + 80, y: foot.y + foot.height * 0.85 }
    await page.mouse.move(lift.x, lift.y)
    await page.mouse.down()
    for (let i = 1; i <= 14; i++) (await page.mouse.move(lift.x + ((drop.x - lift.x) * i) / 14, lift.y + ((drop.y - lift.y) * i) / 14), await page.waitForTimeout(50))
    await page.waitForTimeout(300)
    await page.mouse.up()
    await page.waitForTimeout(300)
    const shape = await page.$eval(EDITOR, (root) => root.editor.getJSON().content.map((one) => one.type === 'bulletList' ? `list(${one.content.map((li) => li.content?.[0]?.content?.[0]?.text).join('+')})` : one.content?.[0]?.content?.[0]?.text ?? one.content?.[0]?.text ?? one.type).join(' | '))
    check(`${look}: carried, the line and that item land under the last line, the item in a list of its own, the other item left in its list`, shape.startsWith('list(Second item)') && shape.includes('Last line | Alpha line | list(First item)'), shape.slice(0, 160))
    await page.keyboard.press('ControlOrMeta+z')
    await page.waitForTimeout(200)
    check(`${look}: and one ⌘Z puts them back`, JSON.stringify(await texts()) === JSON.stringify(before), (await texts()).slice(0, 5).join('|'))
    await page.keyboard.press('Escape')
    // From inside a list out past it: the item it started on, then what follows, never the item above.
    await marquee('Second item', 'Omega line', `${look}-out-of-list`, 4)
    const out = await picked()
    check(`${look}: a box from a list's second item out past the list picks that item on, not the first`, out.boxes.map((one) => one.words).join('|') === 'Second item|A task to do|Omega line', out.boxes.map((one) => one.words).join('|'))
    await page.keyboard.press('Escape')

    // 2. "Color" for several picked: every one of them takes it.
    await marquee('Alpha line', 'Second item', `${look}-color-pick`)
    const at = await grip('First item')
    await page.mouse.click(at.x, at.y)
    await page.waitForTimeout(300)
    const rows = await menuRows()
    check(`${look}: three picked, the grip's menu offers "Color"`, rows.some((one) => one.title === 'Color'), rows.map((one) => one.title).join(', '))
    // The menu holds the keys: the picked words wear their boxes only, never the blurred selection's band over them too.
    const bands = await page.$$eval(`${EDITOR} .mf-picked .selection`, (all) => all.map((one) => getComputedStyle(one).backgroundColor))
    check(`${look}: with the menu up, the picked words wear no second band over their boxes`, bands.every((one) => one === 'rgba(0, 0, 0, 0)'), bands.join(', '))
    const color = page.locator('.tiptap-block-menu [role=menuitem]', { hasText: 'Color' }).first()
    if (await color.count()) {
      await color.hover()
      await page.waitForTimeout(350)
      await shot(`${look}-color-menu`)
      await page.locator('.tiptap-block-colors [data-background="blue"]').first().click()
      await page.waitForTimeout(200)
    }
    const tinted = (await blocks()).filter((one) => one.bg === 'blue')
    check(`${look}: a background picked colours all three: the line and both items`, ['Alpha line', 'First item', 'Second item'].every((words) => tinted.some((one) => one.words === words)) && tinted.every((one) => ['Alpha line', 'First item', 'Second item'].includes(one.words)), JSON.stringify(tinted))
    await shot(`${look}-color-many`)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(150)
    await page.keyboard.press('ControlOrMeta+z')
    await page.waitForTimeout(150)
    check(`${look}: one ⌘Z takes the colour off all three`, (await blocks()).every((one) => one.bg === null), JSON.stringify((await blocks()).filter((one) => one.bg)))
    await page.keyboard.press('Escape')

    // 3. Held at the note's bottom edge, then its top, while the box is drawn: the note scrolls and the box picks on.
    const LONG = Array.from({ length: 60 }, (_, n) => `<p>Line ${n + 1}</p>`).join('')
    await page.$eval(EDITOR, (root, html) => { root.editor.commands.setContent(html); (root.closest('.haligtree-editor-content') ?? root).scrollTop = 0 }, LONG)
    await page.waitForTimeout(300)
    const room = await page.$eval(EDITOR, (root) => { const box = (root.closest('.haligtree-editor-content') ?? root).getBoundingClientRect(); return { top: box.top, bottom: box.bottom } })
    const edge = await column()
    const two = await block('Line 2').boundingBox()
    const start = { x: edge.left - 90, y: two.y + 4 }
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    const low = { x: edge.left + 120, y: room.bottom - 10 }
    for (let i = 1; i <= 8; i++) {
      await page.mouse.move(start.x + ((low.x - start.x) * i) / 8, start.y + ((low.y - start.y) * i) / 8)
      await page.waitForTimeout(30)
    }
    const top0 = await scrollTop()
    const count0 = (await picked()).boxes.length
    const counts = []
    for (let i = 0; i < 10; i++) (await page.waitForTimeout(150), await shot(`${look}-edge-bottom-${i}`), counts.push((await picked()).boxes.length))
    const top1 = await scrollTop()
    const count1 = (await picked()).boxes.length
    check(`${look}: a box held at the note's bottom edge scrolls the note down and picks on (${Math.round(top1 - top0)}px, ${count0} → ${count1} blocks)`, top1 - top0 > 40 && count1 > count0, `${top0} → ${top1}, ${count0} → ${count1}`)
    check(`${look}: and the pick only grows while it scrolls, never let go between lines`, counts.every((n, i) => n > 0 && n >= (counts[i - 1] ?? 0)), counts.join(' '))
    const drawn = await page.$eval('.mf-pick-box', (one) => { const box = one.getBoundingClientRect(); return { top: Math.round(box.top), bottom: Math.round(box.bottom) } }).catch(() => null)
    check(`${look}: the box is drawn inside the note's own room, never past its edges`, !!drawn && drawn.top >= Math.floor(room.top) && drawn.bottom <= Math.ceil(room.bottom), `${JSON.stringify(drawn)} in ${JSON.stringify(room)}`)
    const high = { x: low.x, y: room.top + 10 }
    for (let i = 1; i <= 8; i++) (await page.mouse.move(low.x, low.y + ((high.y - low.y) * i) / 8), await page.waitForTimeout(30))
    const top2 = await scrollTop()
    for (let i = 0; i < 10; i++) (await page.waitForTimeout(150), await shot(`${look}-edge-top-${i}`))
    const top3 = await scrollTop()
    check(`${look}: held at the note's top edge, the note scrolls back up (${Math.round(top2 - top3)}px)`, top2 - top3 > 40, `${top2} → ${top3}`)
    await page.mouse.up()
    await page.waitForTimeout(150)
    check(`${look}: let go, the box goes and the pick stays`, (await page.$$('.mf-pick-box')).length === 0 && (await picked()).boxes.length > 0, '')
    await page.keyboard.press('Escape')
  }

  // 1. The menu in Notion's words, every row answering a resting pointer with the hand and its fill.
  await theme('light')
  await seed()
  const alpha = await grip('Alpha line')
  await page.mouse.click(alpha.x, alpha.y)
  await page.waitForTimeout(300)
  const lines = await menuRows()
  check('a picked line\'s menu offers "Move to…" with ⇧⌘P, after "Duplicate"', lines.some((one) => one.title === 'Move to…' && one.hint === '⇧⌘P') && lines.findIndex((one) => one.title === 'Move to…') === lines.findIndex((one) => one.title === 'Duplicate') + 1, lines.map((one) => `${one.title} ${one.hint}`.trim()).join(', '))
  const rested = []
  for (const row of await page.locator('.tiptap-block-menu [role=menuitem]').all()) {
    const box = await row.boundingBox()
    if (!box) continue
    // Rested as a hand rests: there, past the menu's 300 ms grace, then the hand's own small move. Leaving a row whose
    // submenu had opened ("Color ›", "Turn into ›") reads to Radix as heading into that submenu, so the row under the
    // pointer lights on the next move once the grace is over. Whether the submenu above had opened yet depended on how
    // fast this probe ran (it opens 100 ms after the pointer comes), so the row below passed or failed by the load.
    const [x, y] = [box.x + box.width / 2, box.y + box.height / 2]
    await page.mouse.move(x, y, { steps: 4 })
    await page.waitForTimeout(350)
    await page.mouse.move(x + 1, y)
    await page.waitForTimeout(60)
    rested.push(await row.evaluate((one) => ({ title: one.textContent.trim(), cursor: getComputedStyle(one).cursor, fill: getComputedStyle(one).backgroundColor, under: document.elementFromPoint(one.getBoundingClientRect().left + 20, one.getBoundingClientRect().top + one.getBoundingClientRect().height / 2)?.closest('[role=menuitem]') === one })))
  }
  await shot('light-menu-rested')
  check('every row of the menu under a resting pointer shows the hand and its hover fill', rested.length >= 5 && rested.every((one) => one.cursor === 'pointer' && one.under && !/rgba\(0, 0, 0, 0\)|transparent/.test(one.fill)), JSON.stringify(rested.filter((one) => one.cursor !== 'pointer' || !one.under || /rgba\(0, 0, 0, 0\)|transparent/.test(one.fill))))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(150)
  await page.keyboard.press('Escape')

  // A link card: "Copy link", as Notion says it, never "Copy address".
  await page.$eval(EDITOR, (root) => root.editor.commands.setContent('<p>Before the card</p><a data-bookmark href="https://example.org/faust" title="Faust" description="A link\'s card" site="example.org"></a><p>After the card</p>'))
  await page.waitForTimeout(300)
  await page.locator(`${EDITOR} .tiptap-bookmark`).first().hover()
  await page.waitForTimeout(250)
  await page.locator('.tiptap-drag-handle-grip').click()
  await page.waitForTimeout(250)
  const card = (await menuRows()).map((one) => one.title)
  check('a link card\'s menu says "Copy link" for its address, never "Copy address"', card.includes('Copy link') && !card.includes('Copy address'), card.join(', '))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(150)

  // "Caption" with its key: on a picture's menu, and ⌥⌘M on the picture picked writes one.
  await page.$eval(EDITOR, (root) => root.editor.commands.setContent('<p>Above the picture</p><p>Under the picture</p>'))
  // A picture dropped in, as Finder drops it, so it is the book's own file (qa/picture-menu.mjs).
  await page.evaluate((sel) => new Promise((done) => {
    const canvas = Object.assign(document.createElement('canvas'), { width: 320, height: 200 })
    const pen = canvas.getContext('2d'); pen.fillStyle = '#6a8'; pen.fillRect(0, 0, 320, 200)
    canvas.toBlob((blob) => {
      const ed = document.querySelector(sel).editor
      const data = new DataTransfer()
      data.items.add(new File([blob], 'square.png', { type: 'image/png' }))
      const box = ed.view.dom.getBoundingClientRect()
      ed.view.dom.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true, clientX: box.left + 20, clientY: box.bottom - 4 }))
      done()
    })
  }), EDITOR)
  await page.waitForSelector(`${EDITOR} img`, { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(800)
  await page.locator(`${EDITOR} img`).first().hover()
  await page.waitForTimeout(250)
  await page.locator('.tiptap-drag-handle-grip').click()
  await page.waitForTimeout(300)
  const picture = await menuRows()
  check('a picture\'s menu says "Caption" with its key, ⌥⌘M', picture.some((one) => one.title === 'Caption' && one.hint === '⌥⌘M'), picture.map((one) => `${one.title} ${one.hint}`.trim()).join(', '))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  await page.keyboard.press('Meta+Alt+KeyM')
  await page.waitForTimeout(300)
  await page.keyboard.type('A small square', { delay: 15 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(250)
  const caption = await page.$eval(EDITOR, (root) => root.editor.getJSON().content.find((one) => one.type === 'image')?.attrs.caption ?? null)
  check('⌥⌘M on the picture picked writes its caption', caption === 'A small square', String(caption))

  // "Move to…" by ⇧⌘P: another note picked from the search, the blocks there and gone from here, one ⌘Z puts both back.
  const target = await page.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Moving day target' }] }] } }))
  const targetBody = () => page.evaluate((id) => window.api.captures.get(id).then((one) => JSON.stringify(one?.body ?? '')), target)
  await seed()
  const whole = await texts()
  await marquee('Alpha line', 'First item', 'light-move-pick')
  await page.keyboard.press('Meta+Shift+KeyP')
  await page.waitForTimeout(500)
  const asked = await page.evaluate(() => document.querySelector('input[placeholder$="to which note?"]')?.getAttribute('placeholder') ?? '')
  check('⇧⌘P on two picked blocks asks which note, in the notes\' own search', asked === 'Move 2 blocks to which note?', asked)
  await page.keyboard.type('Moving day target', { delay: 20 })
  await page.waitForTimeout(900)
  await shot('light-move-picker')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1200)
  const moved = await texts()
  const there = await targetBody()
  const said = await page.evaluate(() => [...document.querySelectorAll('[role=status]')].map((one) => one.textContent.trim()).filter(Boolean).join(' / '))
  check('the two blocks go: gone from here, at the end of the note picked', !moved.includes('Alpha line') && !moved.includes('First item') && moved.includes('Second item') && there.includes('Alpha line') && there.includes('First item'), `${moved.slice(0, 3).join('|')} / ${there.slice(0, 160)}`)
  check('the notice says where they went', /Moved 2 blocks to .Moving day target/.test(said), said.slice(0, 200))
  await page.keyboard.press('ControlOrMeta+z')
  await page.waitForTimeout(1200)
  const back = await targetBody()
  check('one ⌘Z in the note puts them back here and takes them out of the other note', JSON.stringify(await texts()) === JSON.stringify(whole) && !back.includes('Alpha line') && back.includes('Moving day target'), `${(await texts()).slice(0, 4).join('|')} / ${back.slice(0, 160)}`)
}

const errors = app.drain().filter((line) => /PAGE ERROR/.test(line))
check('no page errors', errors.length === 0, errors.join(' / '))
await app.close().catch(() => {})
done()
