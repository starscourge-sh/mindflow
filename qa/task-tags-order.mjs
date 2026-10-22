// A task's #tags read one way in every list and card: the title without them,
// and each tag as the small coloured “#tag” Upcoming draws after it. Checked
// on Today, Upcoming, This week, the Matrix, Home's Next up, Today's page,
// quick capture's Tasks tab, the desktop Today sticky and search. Then the
// Matrix keeps your own order inside a box: a card dragged up its box stays
// there, ⌥↑ moves the picked one up, and both outlast a reload.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/task-tags-order.mjs
// SHOTS=dir keeps a picture of each list.
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1400, height: 900 })
const { h, page: box, go, v, electron } = c
const shot = async (w, file) => SHOTS && w.screenshot({ path: `${SHOTS}/${file}.png` }).catch(() => {})

const TAG = 'qatag'
// One today (Today, the week, the Matrix, the sticky), one in three days (Upcoming).
const WORDS = ['water the plants', 'paint the fence']

// Every task title on show: none with a # in its own words (its chips taken
// out), and ours with its tag beside it as a chip.
const read = (w) => w.evaluate(([tag, words]) => {
  const shown = (one) => one.getBoundingClientRect().width > 0 && !one.closest('[data-example]')
  const titles = [...document.querySelectorAll('[data-task-title], button[data-row] > span.truncate')].filter(shown)
  const own = (one) => { const copy = one.cloneNode(true); copy.querySelectorAll('[data-tags]').forEach((chip) => chip.remove()); return copy.textContent ?? '' }
  const raw = titles.filter((one) => /(^|\s)#[a-z]/i.test(own(one))).map((one) => own(one).trim().slice(0, 40))
  const ours = titles.filter((one) => words.some((word) => own(one).includes(word)))
  let chip = false
  for (const title of ours)
    for (let up = title, n = 0; up && n < 6 && !chip; up = up.parentElement, n++)
      chip = [...up.querySelectorAll('[data-tags] span')].some((one) => one.textContent === `#${tag}`)
  return { raw, ours: ours.length, chip }
}, [TAG, WORDS])

async function judge(name, w) {
  const seen = await read(w)
  check(`${name}: shows the task`, seen.ours > 0)
  check(`${name}: no title shows a raw #tag`, !seen.raw.length, seen.raw.join(' | '))
  check(`${name}: the tag is a chip beside it`, seen.chip)
}

const order = (q) => h.evaluate((q) => [...document.querySelectorAll(`[data-quadrant="${q}"] [data-row]`)].map((one) => one.dataset.id), q)

try {
  await v('settings:set', { sounds: false, hintRate: 0, motion: true })
  await v('onboarding:set', { pageHints: false })
  // Today at nine, important: Do now in the Matrix, on Today, the week and the sticky.
  const nine = new Date(); nine.setHours(9, 0, 0, 0)
  for (const [at, words] of WORDS.entries()) {
    await v('task:add', words, null, false)
    const id = (await v('tasks')).find((one) => one.title.includes(words))?.id
    const day = new Date(nine.getTime() + at * 3 * 86400000)
    await v('task:save', id, { title: `#${TAG} ${words}`, due: day.toISOString(), priority: 2 })
  }
  await v('task:save', (await v('tasks')).find((one) => one.title.includes(WORDS[0])).id, { sortOrder: -1 })
  for (const words of ['qa card one', 'qa card two', 'qa card three']) {
    const one = await v('task:add', words, null, false)
    const at = one?.id ?? one?.made?.id ?? (await v('tasks')).find((task) => task.title === words)?.id
    await v('task:save', at, { due: nine.toISOString(), priority: 2 })
  }

  for (const [name, page] of [['Today', 'today'], ['Upcoming', 'upcoming'], ['This week', 'week'], ['Matrix', 'matrix'], ['Home Next up', 'home'], ["Today's page", 'day']]) {
    await go(page); await h.waitForTimeout(1000)
    await judge(name, h)
    await shot(h, page)
  }

  // Quick capture's Tasks tab.
  await box.evaluate(() => window.api.showPrompt()); await box.waitForTimeout(700)
  await box.evaluate(() => document.activeElement?.blur?.()); await box.keyboard.press('Control+2'); await box.waitForTimeout(900)
  await judge('Quick capture Tasks', box)
  await shot(box, 'box-tasks')
  await box.keyboard.press('Escape')

  // The desktop Today sticky.
  let sticky = electron.windows().find((w) => w.url().includes('type=today'))
  if (!sticky) {
    await h.evaluate(() => window.api.openSticky('view', 'today', 'Today', false))
    for (let i = 0; i < 40 && !(sticky = electron.windows().find((w) => w.url().includes('type=today'))); i++) await h.waitForTimeout(200)
  }
  if (sticky) { await sticky.waitForTimeout(1200); await judge('Today sticky', sticky); await shot(sticky, 'sticky') }
  else check('Today sticky: opens', false)

  // Your own order inside a Matrix box.
  await go('matrix'); await h.waitForTimeout(1000)
  const before = await order('do')
  check('Matrix: Do now has cards to order', before.length >= 3, `${before.length}`)
  const last = before.at(-1)
  const lastCard = h.locator(`[data-quadrant="do"] [data-row][data-id="${last}"]`)
  const firstCard = h.locator(`[data-quadrant="do"] [data-row][data-id="${before[0]}"]`)
  const from = await lastCard.boundingBox()
  const to = await firstCard.boundingBox()
  await h.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await h.mouse.down()
  for (let i = 1; i <= 14; i++) { await h.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + ((to.y + 4 - (from.y + from.height / 2)) * i) / 14); await h.waitForTimeout(30) }
  await h.waitForTimeout(250)
  const line = await h.evaluate(() => !!document.querySelector('[data-quadrant="do"] [data-between]'))
  if (SHOTS) await h.screenshot({ path: `${SHOTS}/matrix-reorder-carried.png` })
  check('Matrix: a line shows where it will go in its own box', line)
  await h.mouse.up(); await h.waitForTimeout(1200)
  let now = await order('do')
  check('Matrix: dragged up its own box, it goes to the top', now[0] === last, now.join(','))
  check('Matrix: it stays in its box', now.length === before.length)
  await h.reload(); await h.waitForTimeout(1500)
  await go('matrix'); await h.waitForTimeout(1000)
  now = await order('do')
  check('Matrix: the order outlasts a reload', now[0] === last, now.join(','))
  // ⌥↑ on the second card moves it to the top.
  await h.evaluate(() => document.activeElement?.blur?.())
  await h.keyboard.press('j'); await h.keyboard.press('j'); await h.waitForTimeout(200)
  const second = now[1]
  await h.keyboard.press('Alt+ArrowUp'); await h.waitForTimeout(1200)
  now = await order('do')
  check('Matrix: ⌥↑ moves the picked card up its box', now[0] === second, now.join(','))
  await h.reload(); await h.waitForTimeout(1500)
  await go('matrix'); await h.waitForTimeout(1000)
  check('Matrix: and that outlasts a reload too', (await order('do'))[0] === second)
  await shot(h, 'matrix-ordered')

  // Today written out as a page: the tag stays where it is typed, tinted as a note tints it.
  await go('today'); await h.waitForTimeout(700)
  await h.evaluate(() => window.dispatchEvent(new Event('haligtree:write-day'))); await h.waitForTimeout(1000)
  const tint = (pick) => h.evaluate(([pick, tag]) => {
    const field = pick === 'new' ? document.querySelector('textarea[data-new="now"]') : [...document.querySelectorAll('textarea[data-line]')].find((one) => one.value.includes(pick))
    if (!field) return { found: false }
    const chip = [...field.parentElement.querySelectorAll('[data-tag-tint-tag]')].find((one) => one.textContent === `#${tag}`)
    const mirror = field.parentElement.querySelector('[data-tag-tint]')
    const a = field.getBoundingClientRect(), b = mirror?.getBoundingClientRect()
    return {
      found: true, kept: field.value.startsWith(`#${tag}`), chip: !!chip,
      ground: chip ? getComputedStyle(chip).backgroundColor : '',
      lined: !!b && Math.abs(a.left - b.left) < 1 && Math.abs(a.top - b.top) < 1 && Math.abs(a.width - b.width) < 1,
      font: !!mirror && ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing', 'fontFeatureSettings', 'fontVariationSettings'].every((key) => getComputedStyle(mirror)[key] === getComputedStyle(field)[key])
    }
  }, [pick, TAG])
  // Every tinted line, bold top three and plain ones alike, in the field's very font.
  const every = await h.evaluate(() => [...document.querySelectorAll('[data-tag-tint]')].filter((one) => one.textContent).map((mirror) => {
    const field = mirror.nextElementSibling
    return ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing', 'fontFeatureSettings', 'fontVariationSettings'].every((key) => getComputedStyle(mirror)[key] === getComputedStyle(field)[key]) && mirror.scrollWidth <= field.scrollWidth + 1
  }))
  check("Today's page: every tinted line is drawn in its field's own font", every.length > 0 && every.every(Boolean), `${every.filter(Boolean).length} of ${every.length}`)
  let written = await tint(WORDS[0])
  check("Today's page: the written line is there", written.found)
  check("Today's page: the tag stays in the line where it was typed", written.kept)
  check("Today's page: the tag in the line is tinted", written.chip && !/rgba\(0, 0, 0, 0\)|transparent/.test(written.ground), written.ground)
  check("Today's page: the tint sits exactly on the words (same box, same font)", written.lined && written.font)
  await shot(h, 'day-page')
  // A line being typed is tinted as it is typed.
  await h.locator('textarea[data-new="now"]').click(); await h.keyboard.type(`#${TAG} buy seeds`); await h.waitForTimeout(300)
  written = await tint("new")
  check("Today's page: a tag in the line being typed is tinted as it is typed", written.chip, written.ground)
  await shot(h, 'day-page-typing')
  await h.keyboard.press('Escape'); await h.evaluate(() => document.activeElement?.blur?.()); await h.waitForTimeout(800)
  // Ticked: the struck line keeps its words, the tag tinted where it was written.
  await h.evaluate((words) => [...document.querySelectorAll('[data-day-list] [role=checkbox]')].find((one) => one.getAttribute('aria-label')?.includes(words))?.click(), WORDS[0])
  await h.waitForTimeout(1500)
  const struck = await h.evaluate(([words, tag]) => {
    const row = [...document.querySelectorAll('[data-day-list] .line-through, [data-day-list] .mf-hand-struck, [data-day-list] button span')].find((one) => one.textContent.includes(words))
    const holder = row?.closest('button')
    const mark = holder && [...holder.querySelectorAll('span')].find((one) => one.textContent === `#${tag}`)
    return { found: !!row, kept: !!mark, tinted: !!mark && /highlight/.test(mark.getAttribute('style') ?? '') }
  }, [WORDS[0], TAG])
  // A ticked line keeps its words as written, its #tag tinted in place as the open lines show it (d09b540).
  check("Today's page: ticked, the struck line shows", struck.found)
  check("Today's page: ticked, the tag stays in the struck words where it was written", struck.found && struck.kept)
  check("Today's page: ticked, the tag is tinted as on the open lines", struck.tinted)
  await shot(h, 'day-page-done')

  // Search: the task found by its words shows them without the tag, the tag as a chip.
  await h.keyboard.press('Meta+k'); await h.waitForTimeout(600)
  await h.keyboard.type(WORDS[0]); await h.waitForTimeout(1200)
  if (await h.evaluate(() => !!document.querySelector('[data-search-at], [cmdk-input], input[type=search]'))) {
    await judge('Search', h)
    await shot(h, 'search')
  } else console.log('  Search: did not open with ⌘K here, skipped')
  await h.keyboard.press('Escape')
} finally {
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
if (passed !== results.length) process.exitCode = 1
