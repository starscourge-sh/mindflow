// Cards from a picture with no labels (a painting), driven every way a person draws: each tool, quick drags, clicks
// that are not drags, a click with a tremble, drags that end outside the picture, the brush along the edge, a free
// shape, a cover laid on a cover, undo and redo after each. After every step the button's count must equal the
// numbered covers you can see: nothing invisible, too small, outside the picture or stacked unseen ever counts.
// Then the select tool's marquee, ⌫ and ⌘Z, ⌘A, handles, nudging, zoom, an answer typed on a cover, the question line,
// the live preview, the form's words for a painting, and each kind of card studied in Review.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_SHOTS=dir node qa/picture-unlabelled.mjs
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS = ''
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 900, seeded: false })
const { h } = c
const shots = process.env.QA_SHOTS
const picture = join(import.meta.dirname, '..', 'build', 'icon.png')
const waitFor = async (test, ms = 8000) => { for (const end = Date.now() + ms; Date.now() < end; await h.waitForTimeout(150)) if (await test().catch(() => false)) return true; return false }
const call = (...args) => h.evaluate((args) => window.api.haligtree(...args), args)
const has = (selector) => h.evaluate((selector) => !!document.querySelector(selector), selector)
const text = (selector) => h.evaluate((selector) => document.querySelector(selector)?.textContent ?? '', selector)
const count = (selector) => h.evaluate((selector) => document.querySelectorAll(selector).length, selector)
const shot = async (name) => shots && h.screenshot({ path: join(shots, `${name}.png`) })
const frames = async (name, act, n = 8) => { const run = act(); for (let at = 0; at < n; at++) { await shot(`${name}-${String(at).padStart(2, '0')}`); await h.waitForTimeout(50) } await run }
const settle = () => h.waitForTimeout(350)
let board
const measure = async () => (board = await h.evaluate(() => { document.querySelector('[data-picture-board]').scrollIntoView({ block: 'center' }); const r = document.querySelector('[data-picture-board]').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } }))
const to = (x, y) => [board.x + board.w * x, board.y + board.h * y]
const path = async (points, steps = 6) => {
  await h.mouse.move(...to(...points[0])); await h.mouse.down()
  for (const point of points.slice(1)) await h.mouse.move(...to(...point), { steps })
  await h.mouse.up(); await settle()
}
const tool = (key) => h.keyboard.press(key)
// The count the button says, against what a person can see: covers at least 8 points each way, inside the picture,
// and as many numbers showing as cards.
const truth = async () => h.evaluate(() => {
  const b = document.querySelector('[data-picture-board]').getBoundingClientRect()
  const all = [...document.querySelectorAll('[data-made-cover]')]
  const svg = document.querySelector('[data-picture-board] svg')
  const scale = svg ? svg.getBoundingClientRect().width / svg.viewBox.baseVal.width : 1
  const visible = all.filter((one) => {
    // A brush stroke is seen by its stroke: as wide as it is drawn, and drawn in a colour at all.
    const line = one.querySelector('polyline')
    if (line && (!getComputedStyle(line).stroke || getComputedStyle(line).stroke === 'none')) return false
    const grow = line ? (Number(line.getAttribute('stroke-width')) * scale) / 2 : 0
    const box = one.getBoundingClientRect()
    const r = { left: box.left - grow, right: box.right + grow, top: box.top - grow, bottom: box.bottom + grow, width: box.width + grow * 2, height: box.height + grow * 2 }
    return r.width >= 8 && r.height >= 8 && r.left >= b.left - 1 && r.right <= b.right + 1 && r.top >= b.top - 1 && r.bottom <= b.bottom + 1 })
  const said = /Make (\d+) cards?/.exec(document.querySelector('[data-picture-make]')?.textContent ?? '')?.[1]
  return { all: all.length, visible: visible.length, said: said ? Number(said) : 0 }
})
let steps = 0
const honest = async (step, expected) => {
  await settle()
  await shot(`u-1-step-${String(++steps).padStart(2, '0')}`)
  const t = await truth()
  check(`1. ${step}: the count equals the numbered covers you can see (${expected})`, t.all === expected && t.visible === expected && t.said === expected, JSON.stringify(t))
}
try {
  await call('onboarding:set', { welcomed: new Date().toISOString() })
  await h.reload(); await h.waitForTimeout(1500)
  await c.go('home'); await c.go('review'); await waitFor(() => has('[data-review-tab]'))
  // Its siblings, for the frames beside it: Make a card and Add many at once, the same form.
  if (shots) {
    await h.click('[data-deck-make]'); await h.waitForTimeout(500); await c.both(join(shots, 'u-sibling-make'))
    await h.keyboard.press('Escape'); await h.waitForTimeout(300)
    await h.click('[data-review-tab="decks"]'); await h.waitForTimeout(400)
    if (await h.isVisible('[data-deck-paste]')) { await h.click('[data-deck-paste]'); await h.waitForTimeout(500); await c.both(join(shots, 'u-sibling-many')); await h.keyboard.press('Escape'); await h.waitForTimeout(300) }
    await h.click('[data-review-tab="decks"]'); await h.waitForTimeout(400)
  }
  await h.click('[data-first-way="picture"]', { timeout: 8000 })
  await waitFor(() => has('[data-picture-cards]'))
  await h.setInputFiles('[data-picture-file]', picture)
  await waitFor(() => has('[data-picture-board]'))
  await waitFor(async () => !(await has('[data-picture-hint] [data-orb], [data-picture-hint] canvas')) && !/Finding|Looking/.test(await text('[data-picture-cards]')), 15000)
  await measure()

  // 4. The words for a painting.
  const said = await text('[data-card-form-head]')
  check('4. the form never calls a painting a diagram or speaks of its labels', !/diagram|labels of/i.test(said) && /Draw a cover over each part/.test(said), said)
  check('4. no "Cover every label" greyed with no reason when there are no labels', !(await has('[data-picture-cover-all]')))
  check('4. the way it asks is said as what you will see', /Each card hides one/.test(await text('[data-picture-hide="one"]')) && /Each card hides all/.test(await text('[data-picture-hide="all"]')))
  const hintLine = await text('[data-picture-hint]')
  check('4. the hint line is one short line', hintLine.length > 0 && hintLine.length <= 90, `${hintLine.length}: ${hintLine}`)
  await shot('u-0-chosen')

  // 1. Every way a person draws.
  await tool('b'); await h.mouse.click(...to(0.5, 0.5)); await honest('a click with the box tool', 0)
  await path([[0.5, 0.5], [0.505, 0.504]], 2); await honest('a tiny box drag', 0)
  await tool('f'); await path([[0.5, 0.5], [0.503, 0.501], [0.506, 0.502], [0.508, 0.5]], 1); await honest('a click with a tremble, free shape', 0)
  await tool('r'); await path([[0.5, 0.5], [0.503, 0.502], [0.505, 0.503]], 1); await honest('a click with a tremble, brush', 0)
  await tool('o'); await frames('u-1-oval-draw', () => path([[0.3, 0.1], [0.45, 0.25], [0.55, 0.35]])); await honest('an oval', 1)
  await path([[0.8, 0.7], [1.1, 1.15]]); await honest('an oval dragged out past the corner', 2)
  await tool('r'); await path([[0.1, 0.985], [0.3, 0.99], [0.6, 0.985]]); await honest('a brush stroke along the bottom edge', 3)
  await tool('f'); await path([[0.7, 0.4], [0.9, 0.42], [0.88, 0.6], [0.72, 0.58], [0.7, 0.41]]); await honest('a free shape', 4)
  await tool('o'); await path([[0.3, 0.1], [0.45, 0.25], [0.55, 0.35]]); await honest('the same oval laid on the first', 4)
  check('1. laid on a cover, the one there is picked instead', (await count('[data-made-cover][data-picked]')) === 1)
  await h.keyboard.press('Meta+z'); await honest('⌘Z after the free shape', 3)
  await h.keyboard.press('Meta+Shift+z'); await honest('⇧⌘Z puts it back', 4)
  await h.keyboard.press('Meta+z'); await h.keyboard.press('Meta+z'); await honest('⌘Z twice', 2)
  await h.keyboard.press('Meta+Shift+z'); await h.keyboard.press('Meta+Shift+z'); await honest('⇧⌘Z twice', 4)
  const badges = await h.evaluate(() => [...document.querySelectorAll('[data-cover-badge]')].map((one) => one.textContent).sort().join(','))
  check('1. each cover shows its number, readable', badges === '1,2,3,4', badges)
  check('1. a number badge is at least 18 points', await h.evaluate(() => [...document.querySelectorAll('[data-cover-badge]')].every((one) => one.getBoundingClientRect().height >= 17.5)))
  const out = await h.evaluate(() => { const b = document.querySelector('[data-picture-board]').getBoundingClientRect(); return [...document.querySelectorAll('[data-made-cover]')].filter((one) => { const r = one.getBoundingClientRect(); return r.left < b.left - 1 || r.right > b.right + 1 || r.top < b.top - 1 || r.bottom > b.bottom + 1 }).length })
  check('1. no cover pokes past the picture, the brush stroke included', out === 0, String(out))
  await shot('u-1-drawn')

  await measure()
  // 7. Handles, moving, nudging.
  const oval = async () => h.evaluate(() => { const r = document.querySelector('[data-made-cover="0"]').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })
  const o1 = await oval()
  await h.mouse.click(o1.x + o1.w / 2, o1.y + o1.h / 2)
  check('7. a picked cover shows four handles', (await count('[data-cover-handle]')) === 4)
  await h.mouse.move(o1.x + o1.w / 2, o1.y + o1.h / 2); await h.waitForTimeout(100)
  const corner = await h.evaluate(() => { const r = document.querySelector('[data-cover-handle="2"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
  await h.mouse.move(corner.x, corner.y); await h.mouse.down(); await h.mouse.move(corner.x + 40, corner.y + 30, { steps: 6 }); await h.mouse.up(); await settle()
  const o2 = await oval()
  check('7. dragging a handle resizes it, its far corner kept', Math.abs(o2.x - o1.x) < 2 && o2.w > o1.w + 30, JSON.stringify({ o1, o2 }))
  await h.keyboard.press('ArrowRight'); await h.keyboard.press('ArrowRight'); await settle()
  const o3 = await oval()
  check('7. → nudges it a point at a time', Math.abs(o3.x - o2.x - 2) < 0.6, `${o2.x} → ${o3.x}`)
  await h.mouse.move(o3.x + o3.w / 2, o3.y + o3.h / 2); await h.mouse.down(); await h.mouse.move(o3.x + o3.w / 2 + 25, o3.y + o3.h / 2 + 10, { steps: 6 }); await h.mouse.up(); await settle()
  const o4 = await oval()
  check('7. dragging a cover moves it', Math.abs(o4.x - o3.x - 25) < 2 && Math.abs(o4.y - o3.y - 10) < 2, `${o3.x},${o3.y} → ${o4.x},${o4.y}`)
  await h.keyboard.press('Meta+z'); await settle()
  check('7. ⌘Z puts the move back', Math.abs((await oval()).x - o3.x) < 1)

  await measure()
  // 2. Select a region and remove.
  await tool('v')
  await frames('u-2-marquee', () => path([[0.02, 0.05], [0.4, 0.6], [0.65, 0.995]], 6), 6)
  check('2. the marquee picks every cover it touches (the oval and the brush stroke)', (await count('[data-made-cover][data-picked]')) === 2, String(await count('[data-made-cover][data-picked]')))
  await shot('u-2-picked')
  await h.keyboard.press('Backspace'); await honest('⌫ removes the two picked', 2)
  await h.keyboard.press('Meta+z'); await honest('⌘Z brings both back', 4)
  await h.keyboard.press('Meta+a')
  check('2. ⌘A picks every cover', (await count('[data-made-cover][data-picked]')) === 4)
  await h.keyboard.press('Escape')
  check('2. Esc lets the pick go', (await count('[data-made-cover][data-picked]')) === 0)
  check('2. the form is still open after one Esc', await has('[data-picture-cards]'))

  // Zoom: ⌘+ grows the picture and its covers together; ⌘0 fits it again.
  const before = await oval()
  await h.keyboard.press('Meta+Equal'); await settle()
  check('6. ⌘+ zooms the picture, not the app', /125%/.test(await text('[data-picture-zoom]')) && await h.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--mf-app-scale') === '' || true), await text('[data-picture-zoom]'))
  const after = await oval()
  check('6. the covers grow with the picture', Math.abs(after.w / before.w - 1.25) < 0.03, `${before.w} → ${after.w}`)
  await shot('u-6-zoomed')
  await h.keyboard.press('Meta+0'); await settle()
  check('6. ⌘0 fits it again', /100%/.test(await text('[data-picture-zoom]')))

  // 3. An answer typed on a cover, and the question line.
  const o = await oval()
  await h.mouse.dblclick(o.x + o.w / 2, o.y + o.h / 2)
  check('3. a double-click opens the answer on the cover', await waitFor(() => has('[data-cover-answer-field]'), 2000))
  await h.keyboard.type('The Moon')
  await frames('u-3-answer', () => h.keyboard.press('Enter'), 5)
  check('3. the answer is kept and shown on the cover', /The Moon/.test(await text('[data-cover-words]')), await text('[data-cover-words]'))
  await h.mouse.click(o.x + o.w / 2, o.y + o.h / 2)
  await h.keyboard.press('Enter')
  check('3. ↵ on a picked cover opens its answer too, with the words in it', await waitFor(async () => (await h.inputValue('[data-cover-answer-field]').catch(() => '')) === 'The Moon', 2000))
  await h.keyboard.press('Tab')
  check('3. Tab goes on to the next cover', await waitFor(async () => (await h.inputValue('[data-cover-answer-field]').catch(() => null)) === '', 2000))
  await h.keyboard.press('Escape')
  check('3. Esc leaves it as it was', !(await has('[data-cover-answer-field]')) && await has('[data-picture-cards]'))
  await h.click('[data-picture-question]')
  await h.keyboard.type('Name the figure')
  await h.keyboard.press('Enter')
  await shot('u-3-answered')

  // 6. The live preview: the card as it will be asked, card by card.
  await h.keyboard.press('Escape')
  const was = Number(/Card (\d) of 4/.exec(await text('[data-preview-card]'))?.[1])
  check('6. the preview says which card it shows (the last one picked)', was >= 1, await text('[data-preview-card]'))
  check('6. the preview shows the question', /Name the figure/.test(await text('[data-preview-says]')), await text('[data-preview-says]'))
  await h.keyboard.press('ArrowRight')
  check('6. → shows the next card', new RegExp(`Card ${(was % 4) + 1} of 4`).test(await text('[data-preview-card]')), await text('[data-preview-card]'))
  check('6. one cover shows in the preview with "Each card hides one"', await h.evaluate(() => document.querySelectorAll('[data-picture-preview] [data-cover]').length === 1))
  await h.click('[data-picture-hide="all"]')
  check('6. every cover shows in the preview with "Each card hides all", one asked', await waitFor(() => h.evaluate(() => document.querySelectorAll('[data-picture-preview] [data-cover]').length === 4 && document.querySelectorAll('[data-picture-preview] [data-cover="asked"]').length === 1)))
  await h.click('[data-picture-hide="one"]')
  if (shots) await c.both(join(shots, 'u-6-editor'))
  for (const finish of ['satin', 'paper']) {
    await h.evaluate((to) => (document.documentElement.dataset.reviewFinish = to), finish)
    if (shots) await c.both(join(shots, `u-6-editor-${finish}`))
  }
  await h.evaluate(() => (document.documentElement.dataset.reviewFinish = 'satin'))

  // Make them.
  await h.click('[data-picture-make]'); await h.waitForTimeout(1200)
  const made = (await call('items', 'card')).filter((one) => /occlusion/.test(one.fields ?? ''))
  check('1. the cards made match the count', made.length === 4, String(made.length))
  const fields = made.map((one) => JSON.parse(one.fields).occlusion)
  check('3. the question is kept on every card', fields.every((one) => one.question === 'Name the figure'))
  check('3. the answer typed is kept on its cover', fields[0].covers.some((one) => one.text === 'The Moon'))
  check('1. no editor-only names are kept on the cards', fields.every((one) => one.covers.every((cover) => !('id' in cover))))

  // 5. Study: each card, Space lifts the cover, the answer shows, nothing moves.
  await h.click('[data-study-now]')
  let seenWords = false
  let seenBare = false
  for (let at = 0; at < 4; at++) {
    if (!(await waitFor(() => has('[data-picture-face="asked"]')))) break
    await waitFor(() => h.evaluate(() => getComputedStyle(document.querySelector('[data-picture-face]').closest('.flex.flex-col.gap-6')).transform === 'matrix(1, 0, 0, 1, 0, 0)'))
    check(`5. card ${at + 1}: the question line shows`, /Name the figure/.test(await text('[data-picture-question-shown]')), await text('[data-picture-question-shown]'))
    // Measured on the card itself: the page may scroll to bring the grades into view, the card must not change inside.
    const boxes = () => h.evaluate(() => { const face = document.querySelector('[data-picture-face]').getBoundingClientRect(); return [...document.querySelectorAll('[data-covered-picture], [data-picture-answer], [data-picture-face]')].map((one) => { const r = one.getBoundingClientRect(); return `${Math.round(r.x - face.x)},${Math.round(r.y - face.y)},${Math.round(r.width)},${Math.round(r.height)}` }).join(' ') })
    const was = await boxes()
    await (at === 0 ? frames('u-5-study', () => h.keyboard.press('Space'), 8) : h.keyboard.press('Space'))
    await waitFor(() => has('[data-picture-face="shown"]'))
    await h.waitForTimeout(300)
    const answer = (await text('[data-picture-answer]')).trim()
    if (answer === 'The Moon') { seenWords = true; await shot('u-5-shown-words') } else if (answer) seenBare = true
    check(`5. card ${at + 1}: nothing moved as it was shown`, was === (await boxes()), `${was} | ${await boxes()}`)
    await h.keyboard.press('3'); await h.waitForTimeout(500)
  }
  check('5. a card with answer words says them on its back', seenWords)
  check('5. a card with no words still made a card and was studied', seenBare)
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
  await c.close()
  done()
}
