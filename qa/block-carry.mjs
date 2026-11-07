/**
 * A block carried by its grip: one lifted card that keeps the grab offset as
 * it follows the pointer, the place it left dimmed (not tinted), a drop line,
 * the move made on letting go, and the block put back when let go nowhere.
 * Frames every 50ms through each drag, light and dark, under FRAMES (a folder).
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
  const cards = [...document.querySelectorAll('.mf-block-carried')]
  const card = cards[0]?.getBoundingClientRect()
  const carried = [...document.querySelectorAll('[data-carried]')].map((one) => getComputedStyle(one).opacity)
  const line = document.querySelector('.prosemirror-dropcursor-block')
  return { cards: cards.length, card: card && { x: card.left, y: card.top, w: card.width }, carried, line: !!line && line.getBoundingClientRect().width > 0 }
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

for (const theme of ['light', 'dark']) {
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
  check(`${theme}: one lifted card through the carry`, live.every((one) => one.cards === 1), live.map((one) => one.cards).join(','))
  const offsets = live.filter((one) => one.card).map((one) => [Math.round(one.point.x - one.card.x), Math.round(one.point.y - one.card.y)])
  const spread = offsets.length ? Math.max(...offsets.map(([x]) => x)) - Math.min(...offsets.map(([x]) => x)) + Math.max(...offsets.map(([, y]) => y)) - Math.min(...offsets.map(([, y]) => y)) : 999
  check(`${theme}: the card keeps the grab offset (moves with the pointer within 3px)`, spread <= 3, JSON.stringify(offsets))
  check(`${theme}: the place it left is dimmed`, live.every((one) => one.carried.length === 1 && Number(one.carried[0]) < 0.5), live.map((one) => one.carried.join('/')).join(','))
  check(`${theme}: a drop line shows where it lands`, live.slice(-3).every((one) => one.line))
  const after = await texts()
  check(`${theme}: the heading moved below the third line`, after.at(-1).endsWith('What mattered most') && after.length === before.length, after.join(' | '))
  const gone = seen.filter((one) => !one.point).at(-1)
  check(`${theme}: nothing left behind after the drop`, gone.cards === 0 && gone.carried.length === 0, JSON.stringify(gone))

  // Let go off the page: nothing moves, the card goes home.
  await seed()
  const kept = await texts()
  await carry(`${theme}-away`, 1, { x: 4, y: 4 })
  check(`${theme}: let go where it cannot land, nothing moves`, JSON.stringify(await texts()) === JSON.stringify(kept), (await texts()).join(' | '))
  check(`${theme}: and nothing is left dimmed`, (await state()).carried.length === 0 && (await state()).cards === 0)

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

const errors = app.drain().filter((line) => /PAGE ERROR/.test(line))
check('no page errors', errors.length === 0, errors.join(' / '))
await app.close().catch(() => {})
done()
