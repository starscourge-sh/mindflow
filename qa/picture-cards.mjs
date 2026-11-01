// Cards from a picture (image occlusion), driven as a person would: "From a picture" on the Decks page, a
// labelled diagram chosen (drawn by qa/labelled-diagram.swift), its labels found on this Mac by Vision, "Cover
// every label" in one click, a cover removed and drawn again (it snaps to its label), two grouped as one card
// and ⌘Z taking that back, "Hide all", and the cards made. In Review the asked cover glows, Space lifts it off
// and says the label, nothing moves, grades and ⌘Z work as on any card, "Show the whole picture" lifts the rest.
// Also: the beginner's "Make cards from a picture" opens it, every control shows the hand, and it fits 390 px.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_SHOTS=dir node qa/picture-cards.mjs
import { execFileSync } from 'child_process'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS = ''
const { check, done } = checks()
const folder = mkdtempSync(join(tmpdir(), 'picture-cards-'))
const diagram = join(folder, 'cell.png')
execFileSync('swift', [join(import.meta.dirname, 'labelled-diagram.swift'), diagram])
const c = await sandbox({ width: 1200, height: 900, seeded: false })
const { h } = c
const shots = process.env.QA_SHOTS
const waitFor = async (test, ms = 8000) => { for (const end = Date.now() + ms; Date.now() < end; await h.waitForTimeout(150)) if (await test().catch(() => false)) return true; return false }
const call = (...args) => h.evaluate((args) => window.api.haligtree(...args), args)
const has = (selector) => h.evaluate((selector) => !!document.querySelector(selector), selector)
const count = (selector) => h.evaluate((selector) => document.querySelectorAll(selector).length, selector)
const text = (selector) => h.evaluate((selector) => document.querySelector(selector)?.textContent ?? '', selector)
const boxes = (selector) => h.evaluate((selector) => [...document.querySelectorAll(selector)].map((one) => { const r = one.getBoundingClientRect(); return `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}` }).join(' '), selector)
const review = async () => { await c.go('home'); await c.go('review'); await waitFor(() => has('[data-review-tab]')) }
const both = async (name) => shots && c.both(join(shots, name))
const frames = async (name, act, n = 10) => { const run = act(); for (let at = 0; at < n; at++) { if (shots) await h.screenshot({ path: join(shots, `${name}-${String(at).padStart(2, '0')}.png`) }); await h.waitForTimeout(50) } await run }
const hands = (selector) => h.evaluate((selector) => [...document.querySelectorAll(selector)].filter((one) => !one.disabled && getComputedStyle(one).cursor !== 'pointer').map((one) => one.textContent.trim() || one.outerHTML.slice(0, 40)), selector)
try {
  await call('onboarding:set', { welcomed: new Date().toISOString() })
  await h.reload()
  await h.waitForTimeout(1500)
  await review()

  // 1. The ways in: the beginner's third tile, and "From a picture" at the top.
  check('1. the beginner sees "Make cards from a picture" with a drawn example', await waitFor(() => has('[data-first-way="picture"] [data-first-sample] svg')))
  check('1. "From a picture" sits at the top of the Decks page', /From a picture/.test(await text('[data-deck-picture]')))
  await h.click('[data-first-way="picture"]')
  check('1. it opens "Cards from a picture"', await waitFor(() => has('[data-picture-cards]')))
  await both('picture-1-open')

  // 2. A picture chosen: its labels found on this Mac.
  await h.setInputFiles('[data-picture-file]', diagram)
  check('2. the picture shows with its board', await waitFor(() => has('[data-picture-board]')))
  check('2. its six labels are found on this Mac', await waitFor(() => h.evaluate(() => document.querySelectorAll('[data-found-label]').length === 6), 15000), await text('[data-picture-status]'))
  check('2. the line says how many and that it is done without the internet', /6 labels found on this Mac, without the internet/.test(await text('[data-picture-status]')), await text('[data-picture-status]'))
  const tools = await boxes('[data-picture-tools] > *, [data-picture-status], [data-picture-make]')
  await both('picture-2-found')

  // 3. One click covers every label.
  await h.click('[data-picture-cover-all]')
  check('3. "Cover every label" covers all six', (await count('[data-made-cover]')) === 6 && !(await count('[data-found-label]')))
  check('3. "Make 6 cards"', /Make 6 cards/.test(await text('[data-picture-make]')), await text('[data-picture-make]'))
  check('3. nothing on the tool line moved', tools === (await boxes('[data-picture-tools] > *, [data-picture-status], [data-picture-make]')))

  // 4. One removed with ⌫, then drawn again roughly: it snaps to its label.
  const first = await h.evaluate(() => { const r = document.querySelector('[data-made-cover="0"]').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })
  await h.mouse.click(first.x + first.w / 2, first.y + first.h / 2)
  check('4. a click picks a cover', await has('[data-made-cover="0"][data-picked]'))
  await h.keyboard.press('Backspace')
  check('4. ⌫ removes it, and its label shows to cover again', (await count('[data-made-cover]')) === 5 && (await count('[data-found-label]')) === 1)
  await h.mouse.move(first.x + 6, first.y + 3)
  await h.mouse.down()
  await h.mouse.move(first.x + first.w * 0.5, first.y + first.h * 0.6, { steps: 4 })
  await h.mouse.move(first.x + first.w - 8, first.y + first.h - 4, { steps: 4 })
  await h.mouse.up()
  const drawn = await h.evaluate(() => { const r = document.querySelector('[data-made-cover="5"]')?.getBoundingClientRect(); return r && { x: r.x, y: r.y, w: r.width, h: r.height } })
  check('4. a box drawn roughly over a label snaps to it', !!drawn && Math.abs(drawn.x - first.x) < 2 && Math.abs(drawn.w - first.w) < 2 && Math.abs(drawn.h - first.h) < 2, JSON.stringify({ first, drawn }))

  // 5. Two grouped as one card with G; ⌘Z takes it back.
  const second = await h.evaluate(() => { const r = document.querySelector('[data-made-cover="1"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
  const third = await h.evaluate(() => { const r = document.querySelector('[data-made-cover="2"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
  await h.mouse.click(second.x, second.y)
  await h.keyboard.down('Shift')
  await h.mouse.click(third.x, third.y)
  await h.keyboard.up('Shift')
  await h.keyboard.press('g')
  check('5. G asks two covers as one card: "Make 5 cards"', /Make 5 cards/.test(await text('[data-picture-make]')), await text('[data-picture-make]'))
  await h.keyboard.press('Meta+z')
  check('5. ⌘Z takes the group back: "Make 6 cards"', /Make 6 cards/.test(await text('[data-picture-make]')), await text('[data-picture-make]'))
  await h.click('[data-picture-hide="all"]')
  check('5. every control shows the hand', !(await hands('[data-picture-cards] button, [data-made-cover]')).length, JSON.stringify(await hands('[data-picture-cards] button, [data-made-cover]')))
  await both('picture-5-covered')
  await h.click('[data-picture-make]')
  check('5. six cards made', await waitFor(async () => (await call('items', 'card')).filter((one) => /occlusion/.test(one.fields ?? '')).length === 6))
  const made = (await call('items', 'card')).filter((one) => /occlusion/.test(one.fields ?? ''))
  check('5. each card asks its own label, with "hide all" kept', new Set(made.map((one) => JSON.parse(one.fields).occlusion.ask)).size === 6 && made.every((one) => JSON.parse(one.fields).occlusion.hide === 'all'))

  // 6. Review: the asked cover glows, Space lifts it, the label is said; nothing moves.
  await h.click('[data-study-now]')
  check('6. a picture card shows its picture, every cover on, one asked', await waitFor(async () => (await has('[data-picture-face="asked"]')) && (await count('[data-cover]')) === 6 && (await count('[data-cover="asked"]')) === 1), String(await count('[data-cover]')))
  const before = await boxes('[data-covered-picture], [data-picture-answer]')
  await both('picture-6-asked')
  await frames('picture-6-reveal', () => h.keyboard.press('Space'))
  check('6. Space lifts the asked cover off', await waitFor(() => has('[data-picture-face="shown"] [data-cover="asked"][data-cover-off]')))
  const said = await text('[data-picture-answer]')
  check('6. the label it hid is said under the picture', ['Nucleus', 'Cell membrane', 'Cytoplasm', 'Mitochondrion', 'Ribosome', 'Vacuole'].includes(said.trim()), said)
  check('6. nothing moved as it was shown', before === (await boxes('[data-covered-picture], [data-picture-answer]')), `${before} | ${await boxes('[data-covered-picture], [data-picture-answer]')}`)
  check('6. all four grades show', /Again.*Hard.*Good.*Easy/s.test(await text('[data-grades]')))
  await both('picture-6-shown')
  await h.click('[data-picture-all]')
  check('6. "Show the whole picture" lifts every cover', await waitFor(async () => (await count('[data-cover-off]')) === 6))
  const asked = said.trim()
  await h.keyboard.press('3')
  check('6. a grade moves on to the next picture card', await waitFor(async () => (await has('[data-picture-face="asked"]'))))
  await h.keyboard.press('Meta+z')
  check('6. ⌘Z brings the graded card back', await waitFor(async () => (await has('[data-picture-face]')) && (await h.evaluate(() => document.querySelectorAll('[data-cover-off]').length)) === 0) && await waitFor(async () => { await h.keyboard.press('Space'); return (await text('[data-picture-answer]')).trim() === asked }), asked)

  // 7. Phone width: the maker and the card fit 390 px.
  await c.size(390, 844)
  await h.waitForTimeout(600)
  const sideways = () => h.evaluate(() => { const page = document.querySelector('[data-page]') ?? document.scrollingElement; return page.scrollWidth > page.clientWidth + 1 })
  check('7. a picture card fits 390 px', !(await sideways()) && (await h.evaluate(() => document.querySelector('[data-covered-picture]').getBoundingClientRect().right <= window.innerWidth)))
  await both('picture-7-phone-card')
  await review()
  await h.click('[data-deck-picture]')
  await h.setInputFiles('[data-picture-file]', diagram)
  await waitFor(() => h.evaluate(() => document.querySelectorAll('[data-found-label]').length === 6), 15000)
  const small = await h.evaluate(() => [...document.querySelectorAll('[data-picture-cards] button')].filter((one) => one.getBoundingClientRect().height < 32).map((one) => one.textContent))
  check('7. the maker fits 390 px, every tap target 32 px or more', !(await sideways()) && !small.length, JSON.stringify(small))
  await both('picture-7-phone-maker')
} catch (error) {
  check('ran', false, String(error?.message ?? error).split('\n')[0])
} finally {
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
  await c.close()
  rmSync(folder, { recursive: true, force: true })
  done()
}
