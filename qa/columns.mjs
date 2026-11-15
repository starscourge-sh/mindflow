/**
 * Columns made by dragging a block to the side of another, the way Notion
 * does: the upright line (carry.tsx's own), the row it makes, a column added beside a row (four
 * at most, a fifth refused in words), the gap dragged to resize (kept, drawn into halves and thirds),
 * the last block dragged out folding the row back into lines, blocks inside
 * still written in, one ⌘Z per act, stacked when narrow, Markdown in reading
 * order, a row saved before this still opening, and a drag let go off the page
 * changing nothing. Frames under FRAMES.
 */
import { mkdirSync } from 'fs'
import { join } from 'path'
import { open, checks } from './harness.mjs'

const { check, done } = checks()
const FRAMES = process.env.FRAMES
if (FRAMES) mkdirSync(FRAMES, { recursive: true })
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const app = await open()
const { page } = app
await page.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))
await page.reload()
await page.waitForSelector(EDITOR)

/** The document as a short outline: rows as [a | b], other blocks by their words. */
const outline = () => page.$eval(EDITOR, (root) => {
  const walk = (node) => node.type === 'columns'
    ? `[${node.content.map((column) => column.content.map(walk).join(' + ')).join(' | ')}]`
    : (node.content ?? []).map((one) => one.text ?? walk(one)).join('')
  return root.editor.getJSON().content.map(walk).filter(Boolean).join(' / ')
})
const json = () => page.$eval(EDITOR, (root) => root.editor.getJSON())
let n = 0
const shot = async (name) => FRAMES && page.screenshot({ path: join(FRAMES, `${String(n++).padStart(2, '0')}-${name}.png`) })

async function seed(html) {
  await app.reset()
  await page.$eval(EDITOR, (root, value) => root.editor.commands.setContent(value), html)
  await page.waitForTimeout(250)
}

/** The element for block words `text` (a top-level paragraph or one inside a column). */
const box = (text) => page.locator(`${EDITOR} p`, { hasText: text }).first().boundingBox()

/** Drags block `text` by its grip to a point; `away` lets go off the page. Returns whether an upright line showed. */
async function carry(text, to, { away = false, name = 'carry' } = {}) {
  await page.locator(`${EDITOR} p`, { hasText: text }).first().hover()
  await page.waitForTimeout(200)
  const grip = await page.locator('.tiptap-drag-handle-grip').boundingBox()
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
  await page.mouse.down()
  const steps = 10
  let upright = false
  twins.length = 0
  refusals.length = 0
  const from = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps)
    await page.waitForTimeout(50)
    const seen = await page.evaluate(() => {
      // The one line every carry draws (carry.tsx DropLine), standing up beside the block; the card never over it.
      const line = document.querySelector('[data-drop-line^="beside"]')
      const card = document.querySelector('[data-block-card]')?.getBoundingClientRect()
      const l = line?.getBoundingClientRect()
      const covered = !!l && !!card && card.left < l.right && card.right > l.left && card.top < l.bottom && card.bottom > l.top
      return { line: !!line, twin: !covered, l: l && [l.left, l.top, l.width, l.height], refused: document.documentElement.hasAttribute('data-drag-refused'), words: document.querySelector('[data-block-card] [data-drag-label]')?.textContent ?? null }
    })
    upright ||= seen.line
    if (seen.line) twins.push(seen)
    refusals.push(seen)
    if (i === steps) await shot(name)
  }
  if (away) {
    await page.mouse.move(2, 2, { steps: 4 })
    await page.waitForTimeout(50)
  }
  await page.mouse.up()
  await page.waitForTimeout(300)
  return upright
}

const twins = []
const refusals = []
const undo = async () => (await page.keyboard.press('Meta+z'), await page.waitForTimeout(200))

// 1. Beside a block: a row of two.
await seed('<p>Lecture one: the causes of the war.</p><p>Reading for Thursday.</p><p>Questions to ask.</p>')
let a = await box('Lecture one')
let upright = await carry('Questions to ask', { x: a.x + a.width - 20, y: a.y + a.height / 2 }, { name: 'beside-right' })
check('a vertical line shows at the right edge of a block', upright)
check('and the carried card never covers it', twins.length && twins.every((one) => one.twin), JSON.stringify(twins.slice(0, 2)))
check('dropped there, the two sit side by side', (await outline()) === '[Lecture one: the causes of the war. | Questions to ask.] / Reading for Thursday.', await outline())
await shot('row-of-two')

// 2. Beside a column: a third column.
let q = await box('Questions to ask')
upright = await carry('Reading for Thursday', { x: q.x + q.width - 16, y: q.y + q.height / 2 }, { name: 'third' })
check('a block dropped beside a row adds a column', (await outline()) === '[Lecture one: the causes of the war. | Questions to ask. | Reading for Thursday.]', await outline())

// 3. One ⌘Z per act.
await undo()
check('⌘Z takes the third column back in one step', (await outline()) === '[Lecture one: the causes of the war. | Questions to ask.] / Reading for Thursday.', await outline())
await undo()
check('and ⌘Z again takes the row back to lines', (await outline()) === 'Lecture one: the causes of the war. / Reading for Thursday. / Questions to ask.', await outline())

// 4. Four at most.
await seed('<div data-columns><div class="mf-columns-row"><div data-column><p>One</p></div><div data-column><p>Two</p></div><div data-column><p>Three</p></div></div></div><p>Four more</p><p>Five more</p>')
let three = await box('Three')
await carry('Four more', { x: three.x + three.width - 12, y: three.y + three.height / 2 })
check('a fourth column can be added', (await outline()) === '[One | Two | Three | Four more] / Five more', await outline())
let four = await box('Four more')
upright = await carry('Five more', { x: four.x + four.width - 8, y: four.y + four.height / 2 }, { name: 'fifth-refused' })
check('a fifth is refused: no line, the card says why, and letting go moves nothing', !upright && refusals.some((one) => one.refused && /holds 4/.test(one.words ?? '')) && (await outline()) === '[One | Two | Three | Four more] / Five more', `${JSON.stringify(refusals.at(-1))} ${await outline()}`)

// 5. The gap between columns resizes, drawn into halves, and is kept.
await seed('<div data-columns><div class="mf-columns-row"><div data-column><p>Left column words</p></div><div data-column><p>Right column words</p></div></div></div><p>After</p>')
const cols = await page.$$eval(`${EDITOR} .mf-column`, (all) => all.map((one) => { const r = one.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom } }))
const gapX = (cols[0].right + cols[1].left) / 2
const gapY = cols[0].top + 8
await page.mouse.move(gapX, gapY)
await page.waitForTimeout(100)
const cursor = await page.$eval(EDITOR, (root) => getComputedStyle(root).cursor)
check('the gap between columns shows the resize arrows', cursor === 'col-resize', cursor)
await shot('seam-hover')
await page.mouse.down()
for (let i = 1; i <= 8; i++) (await page.mouse.move(gapX + i * 12, gapY), await page.waitForTimeout(30))
await shot('seam-drag')
await page.mouse.up()
await page.waitForTimeout(200)
let widths = (await json()).content[0].content.map((column) => column.attrs.width)
const share = widths[0] / (widths[0] + widths[1])
check('dragging the gap right widens the left column, and it is saved on the columns', share > 0.55 && share < 0.8, JSON.stringify(widths))
const drawn = await page.$$eval(`${EDITOR} .mf-column`, (all) => all.map((one) => one.getBoundingClientRect().width))
check('the drawn widths follow', drawn[0] > drawn[1] + 20, drawn.join(','))
await undo()
widths = (await json()).content[0].content.map((column) => column.attrs.width)
check('⌘Z puts the widths back in one step', widths.every((one) => one === null), JSON.stringify(widths))
// Near a third: drawn into exactly a third.
const total = cols[1].right - cols[0].left - 28
const toThird = cols[0].left + total / 3 + 4
await page.mouse.move(gapX, gapY)
await page.mouse.down()
for (let i = 1; i <= 6; i++) (await page.mouse.move(gapX + ((toThird - gapX) * i) / 6, gapY), await page.waitForTimeout(30))
await page.mouse.up()
await page.waitForTimeout(200)
widths = (await json()).content[0].content.map((column) => column.attrs.width)
check('let go near a third, it rests on a third exactly', Math.abs(widths[0] / (widths[0] + widths[1]) - 1 / 3) < 0.002, JSON.stringify(widths))

// 6. The last block dragged out of a column: the row folds back to lines.
await seed('<div data-columns><div class="mf-columns-row"><div data-column><p>Quote from Montaigne</p></div><div data-column><p>My reply to it</p></div></div></div><p>Under the row</p>')
const under = await box('Under the row')
await carry('My reply to it', { x: under.x + 40, y: under.y + under.height * 0.8 })
check('dragging the last block out of a column folds the row back into lines', (await outline()) === 'Quote from Montaigne / Under the row / My reply to it', await outline())
await undo()
check('⌘Z puts the row back in one step', (await outline()) === '[Quote from Montaigne | My reply to it] / Under the row', await outline())

// 7. Blocks inside keep working: typing, a list, a checklist, the "/" menu.
await page.locator(`${EDITOR} p`, { hasText: 'My reply to it' }).click()
await page.keyboard.press('End')
await page.keyboard.press('Enter')
await page.keyboard.type('- first point', { delay: 20 })
await page.keyboard.press('Enter')
await page.keyboard.press('Tab')
await page.keyboard.type('nested point', { delay: 20 })
await page.keyboard.press('Enter')
await page.keyboard.press('Shift+Tab')
await page.keyboard.press('Shift+Tab')
await page.keyboard.type('[] a task', { delay: 20 })
await page.waitForTimeout(150)
const inside = await page.$eval(`${EDITOR} .mf-column:nth-child(2)`, (column) => ({ ul: !!column.querySelector('ul ul'), task: !!column.querySelector('[data-type="taskList"], ul[data-type="taskList"]'), text: column.textContent }))
check('inside a column: typing, a nested list and a checklist all work', inside.ul && inside.text.includes('nested point') && inside.text.includes('a task'), JSON.stringify(inside))
await page.keyboard.press('Enter')
await page.keyboard.press('Enter')
await page.keyboard.type('/', { delay: 20 })
await page.waitForTimeout(400)
const menu = await page.evaluate(() => !!document.querySelector('.tiptap-suggestion-popup, [data-slash-menu], [role=listbox]'))
await shot('slash-in-column')
check('"/" opens the block menu inside a column', menu)
await page.keyboard.press('Escape')

// 8. A drag let go off the page changes nothing.
await seed('<p>Alpha</p><p>Beta</p>')
const alpha = await box('Alpha')
const before = await outline()
await carry('Beta', { x: alpha.x + alpha.width - 20, y: alpha.y + alpha.height / 2 }, { away: true })
check('a column drag let go off the page changes nothing, and leaves no line', (await outline()) === before && !(await page.evaluate(() => document.querySelector('[data-drop-line]'))), await outline())

// 9. Narrow: stacked.
await seed('<div data-columns><div class="mf-columns-row"><div data-column><p>Left</p></div><div data-column><p>Right</p></div></div></div>')
const stacked = await page.$eval(`${EDITOR} .mf-columns`, (row) => {
  row.style.width = '340px'
  const flow = getComputedStyle(row.querySelector('.mf-columns-row')).flexDirection
  row.style.width = ''
  return flow
})
check('on a narrow page the columns stack', stacked === 'column', stacked)

// 10. Markdown keeps the words in reading order.
await seed('<div data-columns><div class="mf-columns-row"><div data-column><p>First left</p><p>Then left</p></div><div data-column><p>First right</p></div></div></div><p>Last</p>')
const md = await page.$eval(EDITOR, (root) => root.editor.getMarkdown?.() ?? root.editor.storage.markdown?.getMarkdown?.() ?? '')
const order = ['First left', 'Then left', 'First right', 'Last'].map((one) => md.indexOf(one))
check('Markdown keeps the words in reading order', order.every((at, i) => at >= 0 && (i === 0 || at > order[i - 1])), md.replace(/\n/g, '⏎').slice(0, 200))

// 11. A row saved before widths existed opens as it was.
await seed('<div data-columns="" class="mf-columns"><div class="mf-columns-row"><div data-column="" class="mf-column"><p>Old left</p></div><div data-column="" class="mf-column"><p>Old right</p></div></div></div>')
const old = await page.$$eval(`${EDITOR} .mf-column`, (all) => all.map((one) => Math.round(one.getBoundingClientRect().width)))
check('a row saved before opens as two equal columns', old.length === 2 && Math.abs(old[0] - old[1]) <= 1, old.join(','))

const errors = app.drain().filter((line) => /PAGE ERROR/.test(line))
check('no page errors', errors.length === 0, errors.join(' / '))
await app.close().catch(() => {})
done()
