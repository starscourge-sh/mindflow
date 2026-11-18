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
  // The card rides clear of the line it is about, measured as qa/one-drag.mjs measures the sidebar's: its dot and at
  // least two thirds of it in sight (an upright line: never under the card).
  const level = !!at && !!card && Math.min(card.bottom, at.bottom + 3) - Math.max(card.top, at.top - 3) > 0
  const hidden = level ? Math.max(0, Math.min(card.right, at.right) - Math.max(card.left, at.left)) : 0
  const dot = !at || !level || !(card.left < at.left && card.right > at.left - 8)
  const clear = !at || !card || (at.height > at.width ? card.right <= at.left || card.left >= at.right || !level : dot && hidden / Math.max(1, at.width) <= 1 / 3)
  const moved = [...document.querySelectorAll('.tiptap.ProseMirror.haligtree-editor:not(.is-line) > *')].filter((one) => /translateY\(-?[1-9]/.test(one.style.transform)).length
  const grip = document.querySelector('.tiptap-drag-handle')
  // The words arriving, not those leaving (they cross-fade in place).
  const words = [...(cards[0]?.querySelectorAll('[data-drag-label]') ?? [])].at(-1)?.textContent ?? null
  // A list's item lit, as a sidebar folder is when a folder is carried onto it: its own line filled, a ring.
  const lit = [...document.querySelectorAll('.ProseMirror li [data-drop-hot]')]
  const fill = lit[0] ? getComputedStyle(lit[0]).backgroundColor : ''
  // What a person sees there, not only what is marked: a mark on a copy of the note out of sight would pass.
  const hit = (el) => { const box = el?.getBoundingClientRect(); return box && box.width ? document.elementFromPoint(box.left + 12, box.top + Math.min(box.height / 2, 12)) : null }
  const held = document.querySelector('.ProseMirror [data-carried]')
  const shown = hit(held)?.closest('li, p, h1, h2, h3, h4')
  const carriedSeen = !!held && !!shown && !held.contains(shown) && shown.textContent.trim() !== '' && held.textContent.includes(shown.textContent.trim())
  const litSeen = !!lit[0] && !!hit(lit[0])?.closest('[data-drop-hot]')
  return { cards: cards.length, card: card && { x: card.left, y: card.top, w: card.width, right: card.right, bottom: card.bottom }, title: cards[0]?.textContent ?? '', words, carried, lines: lines.length, line: lines.length > 0, lineY: at ? at.top + at.height / 2 : null, lineSeen: lines[0] ? Number(getComputedStyle(lines[0]).opacity) : 0, upright: lines.some((one) => one.dataset.dropLine.startsWith('beside')), rooms, own, clear, moved, grip: grip ? getComputedStyle(grip).visibility : 'none', cursor: getComputedStyle([...document.querySelectorAll(":hover")].at(-1) ?? document.body).cursor, refused: document.documentElement.hasAttribute('data-drag-refused'), lit: lit.length, litFilled: !!fill && fill !== 'rgba(0, 0, 0, 0)', dropCursor: !!document.querySelector('.prosemirror-dropcursor-block, .prosemirror-dropcursor-inline'), carriedSeen, litSeen }
})
/** The note's lists as a short tree: [item [child], item] / other blocks by their words. */
const tree = () => page.$eval(EDITOR, (root) => {
  const walk = (node) => ['bulletList', 'orderedList', 'taskList'].includes(node.type) ? `[${node.content.map(walk).join(', ')}]`
    : ['listItem', 'taskItem'].includes(node.type) ? node.content.map(walk).join(' ')
      : node.type === 'paragraph' || node.type === 'heading' ? (node.content ?? []).map((one) => one.text ?? '').join('')
        : node.type === 'image' ? 'picture' : node.type === 'attachment' ? node.attrs.name : node.type
  return root.editor.getJSON().content.map(walk).filter(Boolean).join(' / ')
})
const theme = async (name) => {
  await page.evaluate((t) => localStorage.setItem('theme', t), name)
  await page.reload()
  await page.waitForSelector(EDITOR)
}

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
  // Held still where it will land, once the card has ridden clear of its line (useClear's spring).
  await page.waitForTimeout(400)
  const still = await state()
  seen.push({ ...still, point: seen.at(-1)?.point, still: true })
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
  check(`${theme}: held still where it lands, the card leaves the line's dot and two thirds of it in sight (as the sidebar's)`, seen.filter((one) => one.still).every((one) => one.clear && one.line), JSON.stringify(seen.filter((one) => one.still).map((one) => [one.clear, one.line])))
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

// Reduce motion: the blocks are at once where they make way to (no step between), the room and its line at once too.
if (PART === 'carry') {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await seed()
  const third = await page.locator(`${EDITOR} > *`).nth(3).boundingBox()
  await page.locator(`${EDITOR} > *`).nth(0).hover()
  await page.waitForTimeout(200)
  const grip = await page.locator('.tiptap-drag-handle-grip').boundingBox()
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
  await page.mouse.down()
  const steps = []
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(grip.x + 8 + (third.x - grip.x) * i / 10, grip.y + (third.y + third.height * 0.8 - grip.y) * i / 10)
    // Read in the frame after the move: a glide would show a step between.
    steps.push(await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => done({
      ys: [...document.querySelectorAll('.tiptap.ProseMirror.haligtree-editor:not(.is-line) > *')].map((one) => Math.round(new DOMMatrixReadOnly(getComputedStyle(one).transform).m42 * 10) / 10).filter(Boolean),
      line: [...document.querySelectorAll('[data-drop-line]')].map((one) => getComputedStyle(one).animationName).join()
    })))))
  }
  await page.mouse.up()
  await page.waitForTimeout(200)
  const sizes = new Set(steps.flatMap((one) => one.ys.map((y) => Math.abs(y))))
  check('Reduce motion: the blocks are at once where they make way to (one size of step, no glide between), the line at once', sizes.size <= 1 && steps.some((one) => one.ys.length) && steps.every((one) => !/mf-room/.test(one.line)), JSON.stringify(steps.map((one) => one.ys)))
  await page.emulateMedia({ reducedMotion: 'no-preference' })
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
  // Held still before letting go: the card's words have arrived and it has ridden clear of its line.
  await page.waitForTimeout(350)
  const last = await state()
  if (FRAMES) await page.screenshot({ path: join(FRAMES, `${name}-held.png`) })
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
    check(`${theme}: a list's item carried beside a paragraph is a list in its new column`, seen.upright && made.replace(/ \/ paragraph$/, '') === '[paragraph|bulletList] / bulletList' && (await outline()) === '[Plans for the essay | second point] / first point', `${made} ${await outline()} ${JSON.stringify(seen)}`)
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

/**
 * Carries the block by `from`'s grip to `to`'s own line (a little in from its left, its middle), then holds still there
 * for `hold` ms, a frame every 50ms through the move and the rest. `release`: let go at once, no rest.
 */
async function rest(name, from, to, { hold = 900, grip: by = '.tiptap-drag-handle-grip', film = true } = {}) {
  await page.mouse.move(5, 5)
  await from.hover()
  await page.waitForTimeout(220)
  const grip = await page.locator(by).first().boundingBox()
  const box = await to.boundingBox()
  const start = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }
  const end = { x: box.x + Math.min(box.width * 0.4, 120), y: box.y + box.height / 2 }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  const seen = []
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(start.x + ((end.x - start.x) * i) / 12, start.y + ((end.y - start.y) * i) / 12)
    await page.waitForTimeout(50)
    seen.push(await state())
    if (FRAMES && film) await page.screenshot({ path: join(FRAMES, `${name}-${String(i).padStart(2, '0')}.png`) })
  }
  const held = []
  for (let t = 50; t <= hold; t += 50) {
    await page.waitForTimeout(50)
    held.push(await state())
    if (FRAMES && film) await page.screenshot({ path: join(FRAMES, `${name}-rest-${String(t).padStart(4, '0')}.png`) })
  }
  await page.mouse.up()
  await page.waitForTimeout(250)
  if (FRAMES) await page.screenshot({ path: join(FRAMES, `${name}-after.png`) })
  return { seen, held, last: held.at(-1) ?? seen.at(-1) }
}
const item = (text) => page.locator(`${EDITOR} li p`, { hasText: text }).first()

// A list's item rested on another becomes its child; a task's, its step. A quick pass only reorders.
if (PART === 'child') {
  for (const look of ['light', 'dark']) {
    await theme(look)
    await app.reset()
    await page.$eval(EDITOR, (root) => root.editor.commands.setContent('<ul><li><p>Buy bread</p></li><li><p>Call the bank</p></li><li><p>Read chapter two</p></li></ul><p>After the list</p>'))
    await page.waitForTimeout(250)
    const was = await tree()
    let run = await rest(`${look}-child`, item('Read chapter two'), item('Buy bread'))
    const early = run.held.slice(0, Math.max(0, run.held.findIndex((one) => one.lit)))
    check(`${look}: until it has rested, over an item's middle it only moves beside it (the room and its line, nothing lit)`, early.length > 0 && early.every((one) => one.lit === 0 && one.lines === 1), JSON.stringify(run.held.slice(0, 6).map((one) => [one.lit, one.lines, one.words])))
    check(`${look}: rested there, that item lights (filled, as a sidebar folder does), the card says “Move into …”, no room or line`, run.last.lit === 1 && run.last.litFilled && run.last.words === 'Move into “Buy bread”' && run.last.lines === 0 && run.last.rooms === 0, JSON.stringify(run.last))
    check(`${look}: let go, it is that item's child (after its own, as Tab would put it)`, (await tree()) === '[Buy bread [Read chapter two], Call the bank] / After the list', await tree())
    check(`${look}: and nothing stays lit`, (await state()).lit === 0)
    await undo()
    check(`${look}: ⌘Z puts it back in one step`, (await tree()) === was, await tree())

    // A quick pass over the same middle: a move, never a child.
    run = await rest(`${look}-pass`, item('Read chapter two'), item('Buy bread'), { hold: 0, film: false })
    check(`${look}: let go without resting, it moves beside the item and is no one's child`, !(await tree()).includes('[Read') && (await tree()).startsWith('[') && run.last.lit === 0, await tree())
    await undo()

    // An item that already has children: it goes after them.
    await page.$eval(EDITOR, (root) => root.editor.commands.setContent('<ul><li><p>Chapter one</p><ul><li><p>the storm</p></li></ul></li><li><p>the letter</p></li></ul>'))
    await page.waitForTimeout(250)
    run = await rest(`${look}-after-children`, item('the letter'), item('Chapter one'))
    check(`${look}: into an item with children of its own, it goes last among them`, (await tree()) === '[Chapter one [the storm, the letter]]', `${await tree()} ${run.last.words}`)

    // A task's step.
    await page.$eval(EDITOR, (root) => root.editor.commands.setContent('<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>Write the essay</p></li><li data-type="taskItem" data-checked="false"><p>Find three sources</p></li></ul><p>After the tasks</p>'))
    await page.waitForTimeout(250)
    const tasks = await tree()
    run = await rest(`${look}-step`, item('Find three sources'), item('Write the essay'))
    check(`${look}: a task rested on another: that task lights and the card says “Make it a step of …”, the carried task out of sight`, run.last.lit === 1 && run.last.litSeen && run.last.words === 'Make it a step of “Write the essay”' && run.last.carried.length === 1 && run.last.carried[0] === 'hidden' && !run.last.carriedSeen, JSON.stringify(run.last))
    check(`${look}: and on its way there, the carried task stays out of sight in every frame`, run.seen.slice(2).every((one) => one.carried.length === 1 && one.carried[0] === 'hidden' && !one.carriedSeen), JSON.stringify(run.seen.map((one) => one.carried)))
    check(`${look}: let go, it is that task's step`, (await tree()) === '[Write the essay [Find three sources]] / After the tasks', await tree())
    await undo()
    check(`${look}: ⌘Z takes the step back out in one step`, (await tree()) === tasks, await tree())
  }
}

// A picture or a file carried by itself (the browser's own drag, the system's for one kept in the app). The system's
// drag cannot run off screen: main's `drag-out` is a recorder here, and the drag over the note is the events the page
// would hear, at the same places, a frame every 50ms.
if (PART === 'away') {
  await app.electron.evaluate(({ ipcMain }) => {
    ipcMain.removeAllListeners('drag-out')
    globalThis.outs = []
    ipcMain.on('drag-out', (_event, src, name) => globalThis.outs.push({ src, name }))
  })
  const outs = () => app.electron.evaluate(() => globalThis.outs.splice(0))
  const save = (bytes, name) => page.evaluate(([b, n]) => window.api.saveFile(n, new Uint8Array(b)), [bytes, name])
  const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  const map = await save([...Buffer.from(PNG, 'base64')], 'Map.png')
  const list = await save([...Buffer.from('hello')], 'Reading list.txt')
  const start = (sel) => page.evaluate((sel) => {
    const el = document.querySelector(sel)
    window.carried = new DataTransfer()
    const box = el.getBoundingClientRect()
    ;(el.closest('[draggable=true]') ?? el).dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: window.carried, clientX: box.left + 20, clientY: box.top + box.height / 2 }))
  }, sel)
  const hear = (x, y, kind = 'dragover') => page.evaluate(([x, y, kind]) => {
    const target = kind === 'dragleave' ? document.body : document.elementFromPoint(x, y) ?? document.body
    return !target.dispatchEvent(new DragEvent(kind, { bubbles: true, cancelable: true, dataTransfer: window.carried, clientX: x, clientY: y, relatedTarget: null }))
  }, [x, y, kind])
  const centre = async (locator) => { const box = await locator.boundingBox(); return { x: box.x + box.width / 2, y: box.y + box.height / 2, box } }
  /**
   * Over the note from `from` to `to` in 12 steps, then held there for 6 more (the browser says dragover every 50ms or
   * so while the pointer rests), a frame every 50ms. Held, the room it opened at the last steps is there to be read: a
   * picture's own place reaches to just above the line below it, so the room opens only once past that line's middle.
   */
  const across = async (name, from, to) => {
    const seen = []
    for (let i = 1; i <= 18; i++) {
      const k = Math.min(i, 12)
      seen.push({ taken: await hear(from.x + ((to.x - from.x) * k) / 12, from.y + ((to.y - from.y) * k) / 12) })
      await page.waitForTimeout(50)
      Object.assign(seen.at(-1), await state())
      if (FRAMES) await page.screenshot({ path: join(FRAMES, `${name}-${String(i).padStart(2, '0')}.png`) })
    }
    return seen
  }
  for (const look of ['light', 'dark']) {
    await theme(look)
    await app.reset()
    const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
    const doc = { type: 'doc', content: [para('First line.'), para('Second line.'), { type: 'image', attrs: { src: map, alt: 'Map', width: '96px' } }, para('Third line.'), { type: 'attachment', attrs: { src: list, name: 'Reading list.txt', mime: 'text/plain', size: 5 } }, para('Fourth line.')] }
    await page.$eval(EDITOR, (root, doc) => root.editor.commands.setContent(doc), doc)
    await page.waitForTimeout(500)
    const was = await tree()
    // The picture, taken by itself, down past the third line.
    await start(`${EDITOR} img[alt="Map"]`)
    const from = await centre(page.locator(`${EDITOR} img[alt="Map"]`))
    const third = await centre(page.locator(`${EDITOR} p`, { hasText: 'Third line.' }))
    const to = { x: third.box.x + 40, y: third.box.y + third.box.height * 0.8 }
    const seen = await across(`${look}-picture`, from, to)
    const live = seen.slice(-4)
    check(`${look}: a picture carried by itself: the blocks glide aside, the room opens with its one line (carry.tsx's), its own place out of sight`, live.every((one) => one.taken && one.lines === 1 && one.rooms === 1 && one.moved >= 1 && one.carried.length === 1 && one.carried[0] === 'hidden'), JSON.stringify(live))
    check(`${look}: and nothing else is drawn: no editor drop line, no second card (the system shows the picture in hand)`, seen.every((one) => !one.dropCursor && one.cards === 0), JSON.stringify(seen.map((one) => [one.dropCursor, one.cards])))
    await hear(to.x, to.y, 'drop')
    await page.waitForTimeout(300)
    check(`${look}: let go there, it moved there, once`, (await tree()) === 'First line. / Second line. / Third line. / picture / Reading list.txt / Fourth line.', await tree())
    const after = await state()
    check(`${look}: nothing left behind: no band, line, block moved or out of sight`, after.rooms + after.own === 0 && after.lines === 0 && after.moved === 0 && after.carried.length === 0, JSON.stringify(after))
    const sent = await outs()
    check(`${look}: it can still leave the app: the system's drag was started with the file`, sent.length === 1 && sent[0].src === map, JSON.stringify(sent))
    await undo()
    check(`${look}: ⌘Z puts it back in one step`, (await tree()) === was, await tree())

    // Out of the window: all home, the picture in sight; back in, the room opens again; the drag ending elsewhere leaves the note as it was.
    await start(`${EDITOR} img[alt="Map"]`)
    await across(`${look}-picture-out`, await centre(page.locator(`${EDITOR} img[alt="Map"]`)), to)
    await hear(2, 2, 'dragleave')
    await page.waitForTimeout(400)
    const out = await state()
    check(`${look}: carried out of the window: everything at home, the picture back in sight, nothing drawn`, out.rooms + out.own === 0 && out.lines === 0 && out.moved === 0 && out.carried.length === 0, JSON.stringify(out))
    await hear(to.x, to.y)
    await page.waitForTimeout(300)
    const back = await state()
    check(`${look}: brought back in, the room opens again`, back.rooms === 1 && back.lines === 1, JSON.stringify(back))
    await hear(2, 2, 'dragleave')
    await page.mouse.move(30, 30)
    await page.mouse.move(40, 40)
    await page.waitForTimeout(300)
    check(`${look}: let go in another app, the note is as it was and nothing is held`, (await tree()) === was && (await state()).carried.length === 0, await tree())
    await outs()

    // A file's card, carried by itself, up under the first line.
    await start(`${EDITOR} .tiptap-attachment`)
    const first = await centre(page.locator(`${EDITOR} p`, { hasText: 'First line.' }))
    const up = { x: first.box.x + 40, y: first.box.y + first.box.height * 0.85 }
    const file = await across(`${look}-file`, await centre(page.locator(`${EDITOR} .tiptap-attachment`).first()), up)
    check(`${look}: a file's card carried by itself: the room with its one line opens where it lands`, file.slice(-3).every((one) => one.taken && one.lines === 1 && one.rooms === 1), JSON.stringify(file.slice(-3)))
    await hear(up.x, up.y, 'drop')
    await page.waitForTimeout(300)
    check(`${look}: let go, the file moved there`, (await tree()) === 'First line. / Reading list.txt / Second line. / picture / Third line. / Fourth line.', await tree())
    await undo()
    await outs()
  }
  // A picture from the web goes by the browser's own drag (no system drag): the same room, the same move.
  await theme('light')
  await app.reset()
  await page.$eval(EDITOR, (root, src) => root.editor.commands.setContent(`<p>Alpha line.</p><img src="${src}" alt="Web" style="width: 96px"><p>Beta line.</p><p>Gamma line.</p>`), `data:image/png;base64,${PNG}`)
  await page.waitForTimeout(400)
  // Gone from the note as set (the box may take a picture's data address in as a stored file), the case says so and the rest runs on.
  const webShown = await page.locator(`${EDITOR} img[alt="Web"]`).count()
  if (!webShown) check('a picture from the web (a data address) is in the note to carry', false, `${await tree()} | ${await page.$eval(EDITOR, (root) => [...root.querySelectorAll('img')].map((one) => `${one.alt}:${one.src.slice(0, 24)}`).join(', '))}`)
  else {
    await start(`${EDITOR} img[alt="Web"]`)
    const gamma = await centre(page.locator(`${EDITOR} p`, { hasText: 'Gamma line.' }))
    const down = { x: gamma.box.x + 40, y: gamma.box.y + gamma.box.height * 0.8 }
    const web = await across('light-web-picture', await centre(page.locator(`${EDITOR} img[alt="Web"]`)), down)
    check('a picture from the web (the browser\'s own drag): the same room and line', web.slice(-3).every((one) => one.taken && one.lines === 1 && one.rooms === 1 && !one.dropCursor), JSON.stringify(web.slice(-3)))
    await hear(down.x, down.y, 'drop')
    await page.waitForTimeout(300)
    check('let go, it moved there, and no system drag was started for it', (await tree()) === 'Alpha line. / Beta line. / Gamma line. / picture' && (await outs()).length === 0, await tree())
  }

  // Any other block a person takes by its body (a link's card by its picture, an embedded note by its frame): the same
  // room and line, never the editor's own drop line (it took the drop as something new, a copy); let go, it moves once.
  const line = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
  for (const [kind, node, grab] of [
    ['a link\'s card', { type: 'bookmark', attrs: { href: 'https://example.com/faust', title: 'Faust', image: map } }, `${EDITOR} .tiptap-bookmark-image`],
    ['an embedded note', { type: 'noteEmbed', attrs: { id: 'elsewhere', label: 'Elsewhere' } }, `${EDITOR} .note-embed`],
  ]) {
    await app.reset()
    await page.$eval(EDITOR, (root, doc) => root.editor.commands.setContent(doc), { type: 'doc', content: [line('Alpha line.'), node, line('Beta line.'), line('Gamma line.')] })
    await page.waitForTimeout(600)
    const was = await tree()
    const grabbed = page.locator(grab).first()
    if (!(await grabbed.count())) {
      check(`${kind}: drawn in the note`, false, grab)
      continue
    }
    // On the thing itself, as the browser begins it: a picture is dragged by itself, the frame by the block's own box.
    await page.evaluate((sel) => {
      const el = document.querySelector(sel)
      window.carried = new DataTransfer()
      const box = el.getBoundingClientRect()
      const at = el instanceof HTMLImageElement ? el : el.closest('[draggable=true]') ?? el
      at.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: window.carried, clientX: box.left + 10, clientY: box.top + box.height / 2 }))
    }, grab)
    const gamma = await centre(page.locator(`${EDITOR} p`, { hasText: 'Gamma line.' }))
    const to = { x: gamma.box.x + 40, y: gamma.box.y + gamma.box.height * 0.8 }
    const seen = await across(`light-body-${node.type}`, await centre(grabbed), to)
    check(`${kind} carried by its body: the room with its one line (carry.tsx's), its own place out of sight, and no editor drop line`, seen.slice(-3).every((one) => one.taken && one.lines === 1 && one.rooms === 1 && !one.dropCursor && one.carried[0] === 'hidden'), JSON.stringify(seen.slice(-3)))
    await hear(to.x, to.y, 'drop')
    await page.waitForTimeout(300)
    check(`${kind}: let go, it moved there, once, nothing added`, (await tree()) === `Alpha line. / Beta line. / Gamma line. / ${node.type}`, await tree())
    await undo()
    check(`${kind}: ⌘Z puts it back in one step`, (await tree()) === was, await tree())
    await outs()
  }

  // Words carried land between two letters, where no block can make way: the editor's own line stands up there, as wide
  // as every carry's line (2px), its dot at its top, in the accent.
  await app.reset()
  await page.$eval(EDITOR, (root) => root.editor.commands.setContent('<p>Alpha words here.</p><p>Gamma line of words.</p>'))
  await page.waitForTimeout(300)
  const words = await page.evaluate((sel) => {
    const editor = document.querySelector(sel).editor
    editor.commands.setTextSelection({ from: 7, to: 12 })
    const at = editor.view.coordsAtPos(9)
    window.carried = new DataTransfer()
    editor.view.dom.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: window.carried, clientX: at.left, clientY: (at.top + at.bottom) / 2 }))
    const to = editor.view.coordsAtPos(editor.state.doc.content.size - 6)
    return { x: to.left, y: (to.top + to.bottom) / 2 }
  }, EDITOR)
  await hear(words.x, words.y)
  await page.waitForTimeout(250)
  if (FRAMES) await page.screenshot({ path: join(FRAMES, 'light-words.png') })
  const cursor = await page.evaluate(() => {
    const el = document.querySelector('.prosemirror-dropcursor-inline')
    if (!el) return null
    const dot = getComputedStyle(el, '::before')
    return { width: el.getBoundingClientRect().width, colour: getComputedStyle(el).backgroundColor, dot: dot.width, ring: dot.borderTopColor, rooms: document.querySelectorAll('[data-drop-room]').length }
  })
  check('words carried: the line stands up between two letters, 2px as every carry\'s, its dot at its top, in the accent, no room', !!cursor && Math.round(cursor.width) === 2 && cursor.dot === '8px' && cursor.colour === cursor.ring && cursor.rooms === 0, JSON.stringify(cursor))
  await hear(2, 2, 'dragleave')
  await page.evaluate(() => document.body.dispatchEvent(new DragEvent('dragend', { bubbles: true })))
}

// Scrolling while carrying, the "+" carried, ⌥ carrying a copy (no clipboard), and the smallest window.
if (PART === 'more') {
  await theme('light')
  // Carried to the note's foot and held there: the note scrolls, the room and its line stay on the blocks under the pointer, and it lands there.
  await app.reset()
  await page.$eval(EDITOR, (root) => root.editor.commands.setContent(Array.from({ length: 60 }, (_, at) => `<p>Line ${at + 1} of a long note</p>`).join('')))
  await page.waitForTimeout(300)
  const scroller = () => page.$eval(EDITOR, (root) => {
    let el = root
    while (el && !(el.scrollHeight > el.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(el).overflowY))) el = el.parentElement
    if (!el) return null
    const box = el.getBoundingClientRect()
    return { top: el.scrollTop, boxTop: box.top, bottom: Math.min(box.bottom, innerHeight), left: box.left }
  })
  const box = await scroller()
  check('the long note scrolls in its own box', !!box, JSON.stringify(box))
  if (box) {
    await page.locator(`${EDITOR} p`, { hasText: 'Line 2 of' }).hover()
    await page.waitForTimeout(220)
    const grip = await page.locator('.tiptap-drag-handle-grip').boundingBox()
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
    await page.mouse.down()
    const foot = { x: grip.x + 80, y: box.bottom - 20 }
    for (let i = 1; i <= 10; i++) (await page.mouse.move(grip.x + 8 + (foot.x - grip.x) * i / 10, grip.y + (foot.y - grip.y) * i / 10), await page.waitForTimeout(40))
    const during = []
    for (let t = 0; t < 30; t++) {
      await page.waitForTimeout(50)
      const one = await state()
      during.push({ ...one, top: (await scroller()).top })
      if (FRAMES) await page.screenshot({ path: join(FRAMES, `scroll-${String(t).padStart(2, '0')}.png`) })
    }
    const last = during.at(-1)
    check('held at the note\'s foot, the note scrolls under the pointer', last.top - box.top > 60, `${box.top} → ${last.top}`)
    check('and the room and its line stay under the pointer as it scrolls, never left behind', during.slice(5).every((one) => one.lines === 1 && one.rooms === 1 && one.lineY !== null && Math.abs(one.lineY - foot.y) < 60), JSON.stringify(during.slice(5).map((one) => [one.lines, one.rooms, one.lineY && Math.round(one.lineY)])))
    // Seen, not only there: drawn afresh at each step of the scroll, the line waited again each time and never showed.
    const seen = during.slice(5).filter((one) => one.lineSeen > 0.9).length
    check('and the line can be seen through the scroll, most of the time (it waits only when it moves to a new place)', seen >= during.slice(5).length / 2, `${seen} of ${during.slice(5).length} frames show it`)
    const lineY = last.lineY
    await page.mouse.up()
    await page.waitForTimeout(300)
    const landed = await page.locator(`${EDITOR} p`, { hasText: 'Line 2 of' }).boundingBox()
    check('let go, it lands where the line was', !!landed && Math.abs(landed.y + landed.height / 2 - lineY) < 30, `${landed && Math.round(landed.y + landed.height / 2)} vs ${Math.round(lineY)}`)
  }

  // The "+" carries the block as the grip does; pressed alone, it still adds a line below.
  await app.reset()
  await page.$eval(EDITOR, (root) => root.editor.commands.setContent('<p>Plus one</p><p>Plus two</p><p>Plus three</p><p>Plus four</p>'))
  await page.waitForTimeout(250)
  const run = await rest('plus', page.locator(`${EDITOR} p`, { hasText: 'Plus one' }), page.locator(`${EDITOR} p`, { hasText: 'Plus four' }), { hold: 300, grip: '[aria-label="Insert a block below"]' })
  check('the "+" carried: the card with the block\'s words says “Move here”, the room with its one line', run.last.cards === 1 && /Plus one/.test(run.last.title) && run.last.words === 'Move here' && run.last.lines === 1, JSON.stringify(run.last))
  check('let go, the block moved', (await texts()).join('|').startsWith('Plus two|Plus three') && (await texts()).includes('Plus one'), (await texts()).join('|'))
  await page.locator(`${EDITOR} p`, { hasText: 'Plus two' }).hover()
  await page.waitForTimeout(220)
  await page.locator('[aria-label="Insert a block below"]').click()
  await page.waitForTimeout(250)
  const slash = await page.$eval(EDITOR, (root) => root.editor.getJSON().content.map((one) => (one.content ?? []).map((t) => t.text).join('')))
  check('pressed alone, the "+" still adds a line below with “/”', slash[1] === '/', JSON.stringify(slash))
  await page.keyboard.press('Escape')

  // ⌥ held: a copy. The card says so, the block stays in sight, only the room where the copy lands opens. No clipboard.
  await app.reset()
  await page.$eval(EDITOR, (root) => root.editor.commands.setContent('<p>Copy me</p><p>Second</p><p>Third</p>'))
  await page.waitForTimeout(250)
  // Counted and never passed on: were the carry to reach for the clipboard, the Mac's own would still be untouched.
  await page.evaluate(() => {
    window.clip = 0
    for (const name of ['writeText', 'write', 'readText', 'read']) navigator.clipboard[name] = () => (window.clip++, Promise.resolve())
    const exec = document.execCommand.bind(document)
    document.execCommand = (name, ...rest) => (/copy|cut|paste/i.test(name) ? (window.clip++, false) : exec(name, ...rest))
  })
  await page.keyboard.down('Alt')
  const copy = await rest('copy', page.locator(`${EDITOR} p`, { hasText: 'Copy me' }), page.locator(`${EDITOR} p`, { hasText: 'Third' }), { hold: 300 })
  await page.keyboard.up('Alt')
  const live = copy.seen.slice(-4)
  check('⌥ held: the card says “Copy here”, the block stays in sight, the room with its line opens where the copy lands', live.every((one) => one.words === 'Copy here' && one.carried.length === 0 && one.lines === 1 && one.rooms === 1 && one.own === 0), JSON.stringify(live))
  check('let go, the copy is there and the block where it was', JSON.stringify(await texts()) === JSON.stringify(['Copy me', 'Second', 'Copy me', 'Third']) || JSON.stringify(await texts()) === JSON.stringify(['Copy me', 'Second', 'Third', 'Copy me']), (await texts()).join('|'))
  check('and the clipboard was never touched', (await page.evaluate(() => window.clip)) === 0, String(await page.evaluate(() => window.clip)))
  await undo()
  check('⌘Z takes the copy away in one step', JSON.stringify(await texts()) === JSON.stringify(['Copy me', 'Second', 'Third']), (await texts()).join('|'))

  // The smallest window, 560 by 400: the card stays in it, the room and line show, the move lands.
  await page.setViewportSize?.({ width: 560, height: 400 }).catch(() => {})
  await app.reset()
  await page.$eval(EDITOR, (root) => root.editor.commands.setContent('<p>Small one</p><p>Small two</p><p>Small three</p>'))
  await page.waitForTimeout(250)
  const small = await rest('narrow', page.locator(`${EDITOR} p`, { hasText: 'Small one' }), page.locator(`${EDITOR} p`, { hasText: 'Small three' }), { hold: 300 })
  const width = await page.evaluate(() => innerWidth)
  check('560 by 400: the card stays inside the window, the room and its line show', small.seen.slice(2).every((one) => !one.card || (one.card.right <= width - 4 && one.card.x >= 4)) && small.last.lines === 1 && small.last.rooms === 1, JSON.stringify(small.last))
  check('560 by 400: let go, it moved where the line was', (await texts())[0] !== 'Small one' && (await texts()).includes('Small one'), (await texts()).join('|'))
}

// A table's row and column carried by their own grips: the row (or column) itself in hand along its line, and where it
// lands the line every carry draws (carry.tsx DropLine, its dot), a frame every 50ms, light and dark.
if (PART === 'table') {
  for (const look of ['light', 'dark']) {
    await theme(look)
    await app.reset()
    await page.$eval(EDITOR, (root) => root.editor.commands.setContent('<table><tbody><tr><th><p>Book</p></th><th><p>Year</p></th><th><p>Shelf</p></th></tr><tr><td><p>Middlemarch</p></td><td><p>1871</p></td><td><p>A</p></td></tr><tr><td><p>Bleak House</p></td><td><p>1853</p></td><td><p>B</p></td></tr><tr><td><p>Persuasion</p></td><td><p>1817</p></td><td><p>C</p></td></tr></tbody></table><p>After the table</p>'))
    await page.waitForTimeout(300)
    for (const axis of ['row', 'column']) {
      const cell = page.locator(`${EDITOR} td`, { hasText: 'Middlemarch' }).first()
      await cell.hover()
      await page.waitForTimeout(250)
      const grip = await page.locator(`.tiptap-table-grip.is-${axis}`).first().boundingBox().catch(() => null)
      if (!grip) {
        check(`${look}: the table's ${axis} grip shows`, false, 'no grip')
        continue
      }
      const start = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }
      const end = axis === 'row' ? { x: start.x, y: start.y + 70 } : { x: start.x + 220, y: start.y }
      await page.mouse.move(start.x, start.y)
      await page.mouse.down()
      const seen = []
      for (let i = 1; i <= 10; i++) {
        await page.mouse.move(start.x + ((end.x - start.x) * i) / 10, start.y + ((end.y - start.y) * i) / 10)
        await page.waitForTimeout(50)
        seen.push(await page.evaluate(() => {
          const lines = [...document.querySelectorAll('[data-drop-line]')]
          const dot = lines[0] ? getComputedStyle(lines[0], '::before').borderTopWidth : ''
          return { lines: lines.length, dot, old: document.querySelectorAll('.tiptap-table-landing').length }
        }))
        if (FRAMES) await page.screenshot({ path: join(FRAMES, `${look}-table-${axis}-${String(i).padStart(2, '0')}.png`) })
      }
      await page.mouse.up()
      await page.waitForTimeout(400)
      if (FRAMES) await page.screenshot({ path: join(FRAMES, `${look}-table-${axis}-after.png`) })
      const late = seen.slice(-3)
      check(`${look}: a table's ${axis} carried by its grip lands on the one line every carry draws, with its dot`, late.every((one) => one.lines === 1 && one.dot === '2px' && one.old === 0), JSON.stringify(seen))
      await undo()
    }
  }
}

const errors = app.drain().filter((line) => /PAGE ERROR/.test(line))
check('no page errors', errors.length === 0, errors.join(' / '))
await app.close().catch(() => {})
done()
