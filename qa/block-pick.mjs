/**
 * Blocks picked as blocks, as Notion picks them (extensions/picked-blocks.ts): a click on a block's grip picks it (the
 * menu titled for it, its keys on its lines), ⇧↓ ⇧↑ and ⇧ with another grip pick a run, a box drawn from the margin
 * picks every block it touches; each picked block wears its own soft box (4px, a callout's 8px, a table square), a
 * list's items and a task each their own. Picked, they answer ⌫ (one ⌘Z back), ⌘D, Tab and ⇧Tab, ⌘C (the app's
 * stand-in clipboard, qa/pasteboard.mjs), a typed letter goes nowhere, Esc lets go. QA_PART=carry: picked blocks
 * carried together by one's grip, under another block (one card with their count, ⌘Z back in one step) and beside
 * another into a column. Frames under FRAMES (a folder), light and dark.
 */
import { mkdirSync } from 'fs'
import { join } from 'path'
import { open, checks } from './harness.mjs'
import { clearBoard, copiedText } from './pasteboard.mjs'

const { check, done } = checks()
const FRAMES = process.env.FRAMES
if (FRAMES) mkdirSync(FRAMES, { recursive: true })
const PART = process.env.QA_PART ?? 'pick'
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const app = await open()
const { page } = app
await page.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))
await page.setViewportSize?.({ width: 1280, height: 820 }).catch(() => {})

const NOTE = '<p>Alpha line</p><ul><li><p>First item</p></li><li><p>Second item</p></li></ul><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>A task to do</p></li></ul><p>Omega line</p><div data-callout><p>A callout line</p></div><table><tbody><tr><td><p>Cell one</p></td><td><p>Cell two</p></td></tr></tbody></table><p>Last line</p>'
const seed = async () => {
  await app.reset()
  await page.$eval(EDITOR, (root, html) => root.editor.commands.setContent(html), NOTE)
  await page.waitForTimeout(300)
}
const texts = () => page.$eval(EDITOR, (root) => [...root.querySelectorAll('p')].map((one) => one.textContent.trim()).filter(Boolean))
/** Each picked block's box as drawn: its words, its corner, whether it wears the wash. */
const picked = () => page.$eval(EDITOR, (root) => ({
  kind: root.editor.state.selection.toJSON().type,
  boxes: [...root.querySelectorAll('.mf-picked')].map((one) => ({ words: one.textContent.trim().slice(0, 24), radius: getComputedStyle(one).borderTopLeftRadius, wash: getComputedStyle(one).backgroundImage !== 'none', cell: getComputedStyle(one.querySelector('td') ?? one).backgroundImage !== 'none' })),
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
/** A box drawn from the margin left of the words, from just above `top`'s block to just inside `bottom`'s. */
async function marquee(top, bottom, name) {
  const edge = await column()
  const a = await block(top).boundingBox()
  const b = await block(bottom).boundingBox()
  // Out past the grip and its +, in the page's own margin.
  const from = { x: edge.left - 66, y: a.y - 4 }
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
    check(`${look}: a picked callout's box keeps its 8px corner`, callout?.radius === '8px', JSON.stringify(callout))
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
  await page.keyboard.press('Escape')
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
      seen.push(await page.evaluate(() => ({ cards: document.querySelectorAll('[data-block-card]').length, count: document.querySelector('[data-block-carry-layer] [data-carried]')?.textContent ?? '', words: [...document.querySelectorAll('[data-block-card] [data-drag-label]')].at(-1)?.textContent ?? null, lines: document.querySelectorAll('[data-drop-line]').length })))
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
    check(`${look}: let go, all five land together under the last line, in their order`, JSON.stringify(after.slice(-5)) === JSON.stringify(FIVE) && after.at(-6) === 'Last line', after.join('|'))
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
    await page.keyboard.press('Shift+ArrowDown')
    await page.waitForTimeout(100)
    const pair = await picked()
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

const errors = app.drain().filter((line) => /PAGE ERROR/.test(line))
check('no page errors', errors.length === 0, errors.join(' / '))
await app.close().catch(() => {})
done()
