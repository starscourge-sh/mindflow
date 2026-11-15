/**
 * A block carried by its grip, in the one look every carry has (carry.tsx, as the sidebar's folders): the carried card
 * (carry.tsx's, with the block's words) riding just past the pointer, the block's own place the quiet band, the blocks
 * between gliding aside to open room where it lands with ONE line through it, the grip out of sight and the pointer the
 * grabbing hand; the move made on letting go, ⌘Z taking it back in one step, Esc and a drop off the page putting it
 * back. QA_PART=beside: a block carried beside another (the upright line before the drop, a row of two, three, four,
 * none past four), a link's card carried beside one and back out, a list's item beside a paragraph making a list in a
 * column, a column emptied going. Frames every 50ms through each carry, light and dark, under FRAMES (a folder).
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
await page.setViewportSize?.({ width: 720, height: 520 }).catch(() => {})

const texts = () => page.$$eval(`${EDITOR} > *`, (all) => all.map((one) => one.textContent.trim()).filter(Boolean))
const state = () => page.evaluate(() => {
  const cards = [...document.querySelectorAll('[data-block-card]')]
  const card = cards[0]?.getBoundingClientRect()
  // The block in hand keeps its place out of sight: the quiet band stands there instead.
  const carried = [...document.querySelectorAll('[data-carried]')].map((one) => getComputedStyle(one).visibility)
  const lines = [...document.querySelectorAll('[data-drop-line]')].filter((one) => one.getBoundingClientRect().width > 0)
  const at = lines[0]?.getBoundingClientRect()
  const rooms = document.querySelectorAll('[data-drop-room]').length
  const own = document.querySelectorAll('[data-own-room]').length
  // The card rides clear of the line it is about: never over it, either way.
  const clear = !at || !card || card.bottom <= at.top || card.top >= at.bottom || card.right <= at.left || card.left >= at.right
  const moved = [...document.querySelectorAll('.tiptap.ProseMirror.haligtree-editor:not(.is-line) > *')].filter((one) => /translateY\(-?[1-9]/.test(one.style.transform)).length
  const grip = document.querySelector('.tiptap-drag-handle')
  const words = cards[0]?.querySelector('[data-drag-label]')?.textContent ?? null
  return { cards: cards.length, card: card && { x: card.left, y: card.top, w: card.width }, title: cards[0]?.textContent ?? '', words, carried, lines: lines.length, line: lines.length > 0, upright: lines.some((one) => one.dataset.dropLine.startsWith('beside')), rooms, own, clear, moved, grip: grip ? getComputedStyle(grip).visibility : 'none', cursor: getComputedStyle(document.body).cursor, refused: document.documentElement.hasAttribute('data-drag-refused') }
})

async function seed() {
  await app.reset()
  await page.$eval(EDITOR, (root) => root.editor.commands.setContent('<h2>What mattered most</h2><p>The first line of the note, a little longer so it wraps a bit on a narrow page.</p><p>The second line.</p><p>The third line.</p>'))
  await page.waitForTimeout(300)
}

/** Picks up block `from` by its grip and carries it to `to` (a point), filming as it goes; `let` says how it ends. */
async function carry(name, from, to, { end = 'drop' } = {}) {
  const lines = page.locator(`${EDITOR} > *`)
  await lines.nth(from).hover()
  await page.waitForTimeout(200)
  const grip = await page.locator('.tiptap-drag-handle-grip').boundingBox()
  const start = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  const seen = []
  let n = 0
  const film = async (point) => {
    const s = await state()
    seen.push({ ...s, point })
    if (FRAMES) await page.screenshot({ path: join(FRAMES, `${name}-${String(n++).padStart(2, '0')}.png`) })
  }
  const steps = 14
  for (let i = 1; i <= steps; i++) {
    const point = { x: start.x + ((to.x - start.x) * i) / steps, y: start.y + ((to.y - start.y) * i) / steps }
    await page.mouse.move(point.x, point.y)
    await page.waitForTimeout(50)
    await film(point)
  }
  if (end === 'escape') await page.keyboard.press('Escape')
  await page.mouse.up()
  for (let i = 0; i < 6; i++) (await page.waitForTimeout(50), await film(null))
  return seen
}

const PART = process.env.QA_PART ?? 'carry'
for (const theme of PART === 'carry' ? ['light', 'dark'] : []) {
  await page.evaluate((t) => localStorage.setItem('theme', t), theme)
  await page.reload()
  await page.waitForSelector(EDITOR)
  await seed()
  const before = await texts()
  const third = await page.locator(`${EDITOR} > *`).nth(3).boundingBox()
  const seen = await carry(`${theme}-down`, 0, { x: third.x + 60, y: third.y + third.height * 0.8 })
  const moving = seen.filter((one) => one.point)
  // From the second frame on: the first move may land before the drag has begun.
  const live = moving.slice(2)
  check(`${theme}: one carried card (carry.tsx's) through the carry, with the block's words`, live.every((one) => one.cards === 1 && one.title.includes('What mattered most')), live.map((one) => `${one.cards}:${one.title}`).join(','))
  const offsets = live.filter((one) => one.card).map((one) => Math.round(one.card.x - one.point.x))
  check(`${theme}: the card rides just past the pointer, as the sidebar's does (18px)`, offsets.every((x) => Math.abs(x - 18) <= 2), offsets.join(','))
  check(`${theme}: the place it left is the quiet band, the block out of sight (no faded copy)`, live.every((one) => one.carried.length === 1 && one.carried[0] === 'hidden' && one.rooms + one.own === 1), live.map((one) => `${one.carried.join('/')}:${one.rooms}+${one.own}`).join(','))
  check(`${theme}: the blocks between glide aside to open room, one line through it`, live.slice(-3).every((one) => one.lines === 1 && one.rooms === 1 && one.moved >= 2), live.slice(-3).map((one) => `${one.lines}/${one.rooms}/${one.moved}`).join(','))
  check(`${theme}: the card says what letting go does`, live.slice(-3).every((one) => one.words === 'Move here'), live.slice(-3).map((one) => one.words).join(','))
  check(`${theme}: the card never covers its line`, live.every((one) => one.clear), live.map((one) => one.clear).join(','))
  check(`${theme}: the grip stands down, the pointer is the grabbing hand`, live.every((one) => one.grip === 'hidden' && one.cursor === 'grabbing'), live.map((one) => `${one.grip}/${one.cursor}`).join(','))
  const after = await texts()
  check(`${theme}: the heading moved below the third line`, after.at(-1).endsWith('What mattered most') && after.length === before.length, after.join(' | '))
  const gone = seen.filter((one) => !one.point).at(-1)
  check(`${theme}: nothing left behind after the drop: no card, band, line or block still moved`, gone.cards === 0 && gone.carried.length === 0 && gone.lines === 0 && gone.rooms + gone.own === 0 && gone.moved === 0, JSON.stringify(gone))

  // Let go off the page: nothing moves, the card goes home.
  await seed()
  const kept = await texts()
  await carry(`${theme}-away`, 1, { x: 4, y: 4 })
  check(`${theme}: let go where it cannot land, nothing moves`, JSON.stringify(await texts()) === JSON.stringify(kept), (await texts()).join(' | '))
  check(`${theme}: and nothing is left out of sight`, (await state()).carried.length === 0 && (await state()).cards === 0)

  // Esc while carrying.
  await seed()
  const third2 = await page.locator(`${EDITOR} > *`).nth(3).boundingBox()
  await carry(`${theme}-esc`, 1, { x: third2.x + 60, y: third2.y + third2.height * 0.8 }, { end: 'escape' })
  const escaped = await texts()
  check(`${theme}: Esc then letting go leaves the note as it was`, JSON.stringify(escaped) === JSON.stringify(kept), escaped.join(' | '))
  check(`${theme}: and the card is gone`, (await state()).cards === 0)

  // Undo puts a move back in one step.
  await seed()
  const base = await texts()
  await carry(`${theme}-undo`, 2, { x: third.x + 60, y: (await page.locator(`${EDITOR} > *`).nth(0).boundingBox()).y + 4 })
  const moved = await texts()
  await page.keyboard.press('Meta+z')
  await page.waitForTimeout(200)
  check(`${theme}: the move happened and ⌘Z puts it back in one step`, moved[0] === 'The second line.' && JSON.stringify(await texts()) === JSON.stringify(base), `${moved.join(' | ')} → ${(await texts()).join(' | ')}`)
}

/** The note as a short outline: rows as [a | b], other blocks by their words (a link's card by its title). */
const outline = () => page.$eval(EDITOR, (root) => {
  const walk = (node) => node.type === 'columns'
    ? `[${node.content.map((column) => column.content.map(walk).join(' + ')).join(' | ')}]`
    : node.type === 'bookmark' ? node.attrs.title : (node.content ?? []).map((one) => one.text ?? walk(one)).join('')
  return root.editor.getJSON().content.map(walk).filter(Boolean).join(' / ')
})
/** Carries the block whose element is `from` (a locator) by its grip to a point on `to`'s box (`at`: 0 left, 1 right), filming. */
async function beside(name, from, to, at, { y = 0.5 } = {}) {
  await from.hover()
  await page.waitForTimeout(200)
  // A column's own grip is taken by itself; a block by the grip the editor shows beside it.
  const own = await from.evaluate((el) => el.classList.contains('mf-column-grip'))
  const grip = own ? await from.boundingBox() : await page.locator('.tiptap-drag-handle-grip').boundingBox()
  const box = await to.boundingBox()
  const start = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }
  const end = { x: box.x + box.width * at, y: box.y + box.height * y }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  const seen = []
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(start.x + ((end.x - start.x) * i) / 12, start.y + ((end.y - start.y) * i) / 12)
    await page.waitForTimeout(50)
    seen.push(await state())
    if (FRAMES) await page.screenshot({ path: join(FRAMES, `${name}-${String(i).padStart(2, '0')}.png`) })
  }
  const last = seen.at(-1)
  await page.mouse.up()
  await page.waitForTimeout(250)
  if (FRAMES) await page.screenshot({ path: join(FRAMES, `${name}-after.png`) })
  return last
}
const undo = async () => (await page.keyboard.press('Meta+z'), await page.waitForTimeout(200))
const block = (text) => page.locator(`${EDITOR} p`, { hasText: text }).first()
const card = (title) => page.locator(`${EDITOR} .node-bookmark`, { hasText: title }).first()
const BOOK = (title) => `<a data-bookmark href="https://example.org/${encodeURIComponent(title)}" title="${title}" description="A link's card" site="example.org"></a>`

// Rows side by side need a page wide enough not to stack them (three stack under 540px, extensions/columns.ts).
if (PART !== 'carry') await page.setViewportSize?.({ width: 1280, height: 820 }).catch(() => {})
if (PART === 'beside') {
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => localStorage.setItem('theme', t), theme)
    await page.reload()
    await page.waitForSelector(EDITOR)
    // Two lines, then a third beside, a fourth, and none past four.
    await page.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))
    await app.reset()
    await page.$eval(EDITOR, (root) => root.editor.commands.setContent('<p>Lecture one: the causes of the war.</p><p>Reading for Thursday.</p><p>Questions to ask.</p><p>Four more</p><p>Five more</p>'))
    await page.waitForTimeout(250)
    let seen = await beside(`${theme}-beside-two`, block('Questions to ask'), block('Lecture one'), 0.9)
    check(`${theme}: carried near a block's right quarter, a line stands up beside it before the drop`, seen.upright && seen.lines === 1 && seen.words === 'Side by side', JSON.stringify(seen))
    check(`${theme}: nothing opens between the blocks meanwhile: no band, nothing moved`, seen.rooms === 0 && seen.moved === 0, JSON.stringify(seen))
    check(`${theme}: let go there, the two sit side by side`, (await outline()) === '[Lecture one: the causes of the war. | Questions to ask.] / Reading for Thursday. / Four more / Five more', await outline())
    seen = await beside(`${theme}-beside-three`, block('Reading for Thursday'), block('Questions to ask'), 0.92)
    check(`${theme}: beside a row's column, the card says a column is added`, seen.upright && /Add a column, 3 side by side/.test(seen.words ?? ''), seen.words)
    seen = await beside(`${theme}-beside-four`, block('Four more'), block('Reading for Thursday'), 0.92)
    check(`${theme}: a row of three, then four`, (await outline()) === '[Lecture one: the causes of the war. | Questions to ask. | Reading for Thursday. | Four more] / Five more', await outline())
    seen = await beside(`${theme}-beside-five`, block('Five more'), block('Four more'), 0.92)
    check(`${theme}: none past four: the card says why, the pointer says no, no line, and nothing moves`, !seen.upright && seen.refused && /holds 4/.test(seen.words ?? '') && (await outline()).endsWith('| Four more] / Five more'), `${seen.words} ${seen.refused} ${await outline()}`)
    await undo()
    check(`${theme}: ⌘Z takes the fourth column back in one step`, (await outline()) === '[Lecture one: the causes of the war. | Questions to ask. | Reading for Thursday.] / Four more / Five more', await outline())

    // Three link cards in a row, one carried out to stand under another: the row reflows to two, then to one.
    await app.reset()
    await page.$eval(EDITOR, (root, html) => root.editor.commands.setContent(html), `${BOOK('Deal with the Devil')}${BOOK('Faust')}${BOOK('Mephistopheles')}<p>Under the cards</p>`)
    await page.waitForTimeout(400)
    seen = await beside(`${theme}-cards-two`, card('Faust'), card('Deal with the Devil'), 0.9)
    check(`${theme}: a link's card carried beside another: the card shows its title, and the line stands up`, seen.upright && seen.title.includes('Faust'), JSON.stringify(seen))
    await beside(`${theme}-cards-three`, card('Mephistopheles'), card('Faust'), 0.92)
    check(`${theme}: three link cards in a row`, (await outline()) === '[Deal with the Devil | Faust | Mephistopheles] / Under the cards', await outline())
    seen = await beside(`${theme}-cards-out`, card('Mephistopheles'), block('Under the cards'), 0.3, { y: 0.85 })
    check(`${theme}: carried out under a block, the room opens there with one line`, seen.lines === 1 && seen.rooms === 1 && !seen.upright, JSON.stringify(seen))
    check(`${theme}: and the row reflows to two`, (await outline()) === '[Deal with the Devil | Faust] / Under the cards / Mephistopheles', await outline())
    await beside(`${theme}-cards-one`, card('Faust'), block('Under the cards'), 0.3, { y: 0.15 })
    check(`${theme}: one more out: a row of one is just its blocks again`, (await outline()) === 'Deal with the Devil / Faust / Under the cards / Mephistopheles', await outline())
    await undo()
    check(`${theme}: ⌘Z puts that column back in one step`, (await outline()) === '[Deal with the Devil | Faust] / Under the cards / Mephistopheles', await outline())

    // A list's item carried beside a paragraph makes a list of its own in the new column.
    await app.reset()
    await page.$eval(EDITOR, (root) => root.editor.commands.setContent('<p>Plans for the essay</p><ul><li><p>first point</p></li><li><p>second point</p></li></ul>'))
    await page.waitForTimeout(250)
    seen = await beside(`${theme}-item-beside`, block('second point'), block('Plans for the essay'), 0.9)
    const made = await page.$eval(EDITOR, (root) => root.editor.getJSON().content.map((one) => one.type === 'columns' ? `[${one.content.map((c) => c.content.map((b) => b.type).join('+')).join('|')}]` : one.type).join(' / '))
    check(`${theme}: a list's item carried beside a paragraph is a list in its new column`, seen.upright && made === '[paragraph|bulletList] / bulletList' && (await outline()) === '[Plans for the essay | second point] / first point', `${made} ${await outline()}`)
  }
}

if (PART === 'cards') {
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => localStorage.setItem('theme', t), theme)
    await page.reload()
    await page.waitForSelector(EDITOR)
    // Cards in a row from the slash menu: three columns, each a quiet card; written to Markdown with its mark and read back.
    await app.reset()
    await page.$eval(EDITOR, (root) => root.editor.commands.setContent('<p></p>'))
    await page.locator(EDITOR).click()
    await page.keyboard.type('/Cards in a row', { delay: 20 })
    await page.waitForTimeout(400)
    const peek = await page.evaluate(() => document.querySelector('[data-slash-peek]')?.textContent ?? '')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(300)
    const row = await page.$eval(EDITOR, (root) => { const one = root.editor.getJSON().content.find((node) => node.type === 'columns'); return one && { look: one.attrs?.look, n: one.content.length } })
    const look = await page.$$eval(`${EDITOR} .mf-column`, (all) => all.map((one) => { const style = getComputedStyle(one); return `${style.borderTopLeftRadius}/${style.backgroundColor !== 'rgba(0, 0, 0, 0)'}` }))
    check(`${theme}: “Cards in a row” in the slash menu, with its peek, makes three columns that wear the card look (8px corners, a quiet fill)`, row?.look === 'cards' && row.n === 3 && look.length === 3 && look.every((one) => one === '8px/true') && /each a card/i.test(peek), `${JSON.stringify(row)} ${look.join(',')} peek: ${peek.slice(0, 80)}`)
    await page.keyboard.type('To read')
    const md = await page.$eval(EDITOR, (root) => root.editor.getMarkdown?.() ?? '')
    check(`${theme}: written to Markdown as columns are, its mark saying cards`, md.includes('<!-- columns cards -->') && md.includes('To read'), md.replace(/\n/g, '⏎').slice(0, 160))
    await page.$eval(EDITOR, (root, value) => root.editor.commands.setContent(value, { contentType: 'markdown' }), md)
    await page.waitForTimeout(200)
    const back = await page.$eval(EDITOR, (root) => root.editor.getJSON().content.find((node) => node.type === 'columns')?.attrs?.look ?? null)
    check(`${theme}: and read back from Markdown as cards`, back === 'cards', String(back))
    if (FRAMES) await page.screenshot({ path: join(FRAMES, `${theme}-cards-in-a-row.png`) })

    // The row's own menu: “Show as plain columns”, then “Show as cards” again.
    await app.reset()
    await page.$eval(EDITOR, (root) => root.editor.commands.setContent('<div data-columns data-look="cards"><div class="mf-columns-row"><div data-column><p>To read</p></div><div data-column><p>Reading</p></div></div></div><p>After the row</p>'))
    await page.waitForTimeout(250)
    const columns = await page.$$eval(`${EDITOR} .mf-column`, (all) => all.map((one) => { const r = one.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom } }))
    // The row itself is what the grip stands by in the gap between its columns.
    await page.mouse.move((columns[0].right + columns[1].left) / 2, (columns[0].top + columns[0].bottom) / 2)
    await page.waitForTimeout(250)
    await page.locator('.tiptap-drag-handle-grip').click()
    await page.waitForTimeout(250)
    const line = page.getByRole('menuitem', { name: 'Show as plain columns' })
    const offered = await line.count()
    if (offered) await line.click()
    await page.waitForTimeout(200)
    const plain = await page.$eval(EDITOR, (root) => root.editor.getJSON().content[0].attrs?.look ?? null)
    check(`${theme}: the row's own menu offers “Show as plain columns”, and it does`, offered === 1 && plain === null, `${offered} ${plain}`)
    await page.keyboard.press('Meta+z')
    await page.waitForTimeout(200)
    check(`${theme}: ⌘Z puts the cards back`, (await page.$eval(EDITOR, (root) => root.editor.getJSON().content[0].attrs?.look ?? null)) === 'cards')

    // A column carried whole by its own grip: to the other end of its row, then out of it to stand alone.
    await app.reset()
    await page.$eval(EDITOR, (root) => root.editor.commands.setContent('<div data-columns><div class="mf-columns-row"><div data-column><p>Alpha one</p><p>Alpha two</p></div><div data-column><p>Beta</p></div><div data-column><p>Gamma</p></div></div></div><p>Under the row</p>'))
    await page.waitForTimeout(250)
    await page.locator(`${EDITOR} p`, { hasText: 'Alpha one' }).hover()
    await page.waitForTimeout(150)
    const grip = page.locator('.mf-column-grip')
    const shown = await grip.isVisible()
    const cursor = shown ? await grip.evaluate((one) => getComputedStyle(one).cursor) : ''
    check(`${theme}: a column shows its own grip over its top while the pointer is in it, the open hand`, shown && cursor === 'grab', `${shown} ${cursor}`)
    let seen = await beside(`${theme}-column-end`, grip, page.locator(`${EDITOR} p`, { hasText: 'Gamma' }), 0.92)
    check(`${theme}: carried by it to the far side of its row, the line stands up there`, seen.upright && seen.title.includes('Alpha one'), JSON.stringify(seen))
    check(`${theme}: let go, the whole column moved to the other end of its row`, (await outline()) === '[Beta | Gamma | Alpha one + Alpha two] / Under the row', await outline())
    await page.locator(`${EDITOR} p`, { hasText: 'Gamma' }).hover()
    await page.waitForTimeout(150)
    seen = await beside(`${theme}-column-out`, page.locator('.mf-column-grip'), block('Under the row'), 0.3, { y: 0.85 })
    check(`${theme}: carried out under a block, the room opens with one line`, seen.lines === 1 && seen.rooms === 1, JSON.stringify(seen))
    check(`${theme}: let go, it stands alone and its row closes up`, (await outline()) === '[Beta | Alpha one + Alpha two] / Under the row / Gamma', await outline())
    await undo()
    check(`${theme}: ⌘Z puts the column back in one step`, (await outline()) === '[Beta | Gamma | Alpha one + Alpha two] / Under the row', await outline())
  }
}

const errors = app.drain().filter((line) => /PAGE ERROR/.test(line))
check('no page errors', errors.length === 0, errors.join(' / '))
await app.close().catch(() => {})
done()
