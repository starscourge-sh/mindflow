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
// QA_SIZE=1000x700 runs it in a smaller window, where the page scrolls once the answer shows.
const [width, height] = (process.env.QA_SIZE ?? '1200x900').split('x').map(Number)
const c = await sandbox({ width, height, seeded: false })
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
  check('2. the line says how many and that it is done without the internet', /6 labels found on it, on this Mac, without the internet/.test(await text('[data-card-form-head]')), await text('[data-card-form-head]'))
  const tools = await boxes('[data-picture-tools] > :not(.flex-1), [data-picture-hint], [data-picture-make]')
  await both('picture-2-found')

  // 2b. A label not to be asked: picked with the marquee and set aside with ⌫; ⌘Z brings it back.
  await h.evaluate(() => document.querySelector('[data-picture-board]').scrollIntoView({ block: 'center' }))
  const label = await h.evaluate(() => { const r = document.querySelector('[data-found-label="0"]').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })
  await h.keyboard.press('v')
  await h.mouse.move(label.x - 6, label.y - 6); await h.mouse.down(); await h.mouse.move(label.x + label.w / 2, label.y + label.h / 2, { steps: 5 }); await h.mouse.up()
  check('2b. the marquee picks the label it touches', (await count('[data-found-label][data-picked]')) === 1, String(await count('[data-found-label][data-picked]')))
  await both('picture-2b-label-picked')
  await h.keyboard.press('Backspace')
  check('2b. ⌫ sets the label aside: 5 left to cover', (await count('[data-found-label]')) === 5 && /Cover every label\s*5/.test(await text('[data-picture-cover-all]')), await text('[data-picture-cover-all]'))
  await h.keyboard.press('Meta+z')
  check('2b. ⌘Z brings it back', (await count('[data-found-label]')) === 6)
  await h.keyboard.press('b')
  const toolsAgain = await boxes('[data-picture-tools] > :not(.flex-1), [data-picture-hint], [data-picture-make]')

  // 3. One click covers every label.
  await h.click('[data-picture-cover-all]')
  check('3. "Cover every label" covers all six', (await count('[data-made-cover]')) === 6 && !(await count('[data-found-label]')))
  check('3. "Make 6 cards"', /Make 6 cards/.test(await text('[data-picture-make]')), await text('[data-picture-make]'))
  check('3. nothing on the tool line moved', tools.split(' ').map((one) => one.split(',').filter((_, at) => at !== 1).join()).join() === toolsAgain.split(' ').map((one) => one.split(',').filter((_, at) => at !== 1).join()).join() && toolsAgain === (await boxes('[data-picture-tools] > :not(.flex-1), [data-picture-hint], [data-picture-make]')), `${tools} | ${await boxes('[data-picture-tools] > :not(.flex-1), [data-picture-hint], [data-picture-make]')}`)
  // 3b. A found label's word is its cover's answer, filled in already.
  const c0 = await h.evaluate(() => { const r = document.querySelector('[data-made-cover="0"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
  await h.mouse.dblclick(c0.x, c0.y)
  const prefilled = await h.inputValue('[data-cover-answer-field]').catch(() => '')
  check('3b. the answer on a label\'s cover is the label, filled in', ['Nucleus', 'Cell membrane', 'Cytoplasm', 'Mitochondrion', 'Ribosome', 'Vacuole'].includes(prefilled), prefilled)
  await both('picture-3b-answer')
  await h.keyboard.press('Escape')
  await h.keyboard.press('Escape')

  // 4. One removed with ⌫, then drawn again roughly: it snaps to its label.
  const first = await h.evaluate(() => { const r = document.querySelector('[data-made-cover="0"]').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })
  await h.mouse.click(first.x + first.w / 2, first.y + first.h / 2)
  check('4. a click picks a cover', await has('[data-made-cover="0"][data-picked]'))
  await h.keyboard.press('Backspace')
  await h.waitForTimeout(300)
  check('4. ⌫ removes it, and its label shows to cover again', (await count('[data-made-cover]')) === 5 && (await count('[data-found-label]')) === 1)
  await h.mouse.move(first.x + 6, first.y + 3)
  await h.mouse.down()
  await h.mouse.move(first.x + first.w * 0.5, first.y + first.h * 0.6, { steps: 4 })
  await h.mouse.move(first.x + first.w - 8, first.y + first.h - 4, { steps: 4 })
  await h.mouse.up()
  await h.waitForTimeout(400)
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
  // 5b. Asked together, studied as one card: G again, then "Each card hides all", seen in the preview.
  await h.mouse.click(second.x, second.y)
  await h.keyboard.down('Shift'); await h.mouse.click(third.x, third.y); await h.keyboard.up('Shift')
  await h.keyboard.press('g')
  check('5b. G asks the two together again: "Make 5 cards"', /Make 5 cards/.test(await text('[data-picture-make]')), await text('[data-picture-make]'))
  await h.click('[data-picture-hide="all"]')
  check('5. the way it asks is said as what you will see: "Each card hides all"', (await h.getAttribute('[data-picture-hide="all"]', 'aria-checked')) === 'true' && /Each card hides all/.test(await text('[data-picture-hide="all"]')))
  check('5. the preview shows every cover on, the asked one glowing', await h.evaluate(() => document.querySelectorAll('[data-picture-preview] [data-cover]').length === 6 && document.querySelectorAll('[data-picture-preview] [data-cover="asked"]').length >= 1))
  check('5. every control shows the hand', !(await hands('[data-picture-cards] button, [data-made-cover]')).length, JSON.stringify(await hands('[data-picture-cards] button, [data-made-cover]')))
  await both('picture-5-covered')
  for (const finish of ['satin', 'paper']) {
    await h.evaluate((to) => (document.documentElement.dataset.reviewFinish = to), finish)
    await both(`picture-5-covered-${finish}`)
  }
  await h.evaluate(() => (document.documentElement.dataset.reviewFinish = 'satin'))
  await h.click('[data-picture-make]')
  check('5. five cards made', await waitFor(async () => (await call('items', 'card')).filter((one) => /occlusion/.test(one.fields ?? '')).length === 5))
  const made = (await call('items', 'card')).filter((one) => /occlusion/.test(one.fields ?? ''))
  check('5. each card asks its own label or pair, with "hide all" kept', new Set(made.map((one) => JSON.parse(one.fields).occlusion.ask)).size === 5 && made.every((one) => JSON.parse(one.fields).occlusion.hide === 'all'))
  check('5b. the pair\'s card answers with both labels', made.some((one) => { const o = JSON.parse(one.fields).occlusion; const pair = o.covers.filter((c) => c.group === o.ask); return pair.length === 2 && pair.every((c) => c.text) }))

  // 6. Review: the asked cover glows, Space lifts it, the label is said; nothing moves.
  await h.click('[data-study-now]')
  check('6. a picture card shows its picture, every cover on, one card asked (one cover, or the pair)', await waitFor(async () => (await has('[data-picture-face="asked"]')) && (await count('[data-cover]')) === 6 && (await count('[data-cover="asked"]')) >= 1), String(await count('[data-cover]')))
  // The card slides in from the right as it arrives (review-view.tsx, 220 ms): measured once it has settled, or its slide reads as a move.
  check('6. the card has settled from its arrival', await waitFor(() => h.evaluate(() => getComputedStyle(document.querySelector('[data-picture-face]').closest('.flex.flex-col.gap-6')).transform === 'matrix(1, 0, 0, 1, 0, 0)')))
  const before = await boxes('[data-covered-picture], [data-picture-answer], [data-picture-face], [data-review-tabs]')
  await both('picture-6-asked')
  await frames('picture-6-reveal', () => h.keyboard.press('Space'))
  check('6. Space lifts the asked cover off', await waitFor(() => has('[data-picture-face="shown"] [data-cover="asked"][data-cover-off]')))
  const said = await text('[data-picture-answer]')
  check('6. the label it hid is said under the picture', said.trim().split(', ').every((one) => ['Nucleus', 'Cell membrane', 'Cytoplasm', 'Mitochondrion', 'Ribosome', 'Vacuole'].includes(one)), said)
  check('6. nothing moved as it was shown', before === (await boxes('[data-covered-picture], [data-picture-answer], [data-picture-face], [data-review-tabs]')), `${before} | ${await boxes('[data-covered-picture], [data-picture-answer], [data-picture-face], [data-review-tabs]')}`)
  check('6. all four grades show', /Again.*Hard.*Good.*Easy/s.test(await text('[data-grades]')))
  await both('picture-6-shown')
  await h.click('[data-picture-all]')
  check('6. "Show the whole picture" lifts every cover', await waitFor(async () => (await count('[data-picture-face] [data-cover-off]')) === 6))
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
  // In a narrow window "From a picture" folds into the toolbar's More menu.
  await h.click('[data-review-tab="decks"]')
  if (await h.isVisible('[data-deck-picture]')) await h.click('[data-deck-picture]')
  else { await h.click('[data-toolbar-more]'); await h.click('[data-toolbar-more-item="picture"]') }
  await h.setInputFiles('[data-picture-file]', diagram)
  await waitFor(() => h.evaluate(() => document.querySelectorAll('[data-found-label]').length === 6), 15000)
  const small = await h.evaluate(() => [...document.querySelectorAll('[data-picture-cards] button')].filter((one) => one.getBoundingClientRect().height < 32).map((one) => one.textContent))
  check('7. the maker fits 390 px, every tap target 32 px or more', !(await sideways()) && !small.length, JSON.stringify(small))
  await h.click('[data-picture-cover-all]')
  await both('picture-7-phone-covered')
  await h.click('[data-picture-other]')
  check('7. "Another picture" puts the picture aside', await waitFor(async () => !(await has('[data-picture-board]'))))
  await h.locator('button:has-text("Undo")').last().click()
  check('7. its Undo brings the picture back with every cover', await waitFor(async () => (await count('[data-made-cover]')) === 6))
  await both('picture-7-phone-maker')
} catch (error) {
  check('ran', false, String(error?.message ?? error).split('\n')[0])
} finally {
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
  await c.close()
  rmSync(folder, { recursive: true, force: true })
  done()
}
