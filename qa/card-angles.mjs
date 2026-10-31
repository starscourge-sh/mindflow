// Slice D, cards with more to them, for any subject:
// - "Ask another way" (A in Review, or the card's menu): a new card under the
//   one in front that keeps its context, source and #tags; Undo takes it back.
// - Pictures on the back: ⌘V of a picture while the answer shows puts it under
//   the answer at once, with Undo; a gem's Context takes a pasted picture and
//   Review draws it after the answer.
// - Better blanks: three numbers blanked on one gem ("25 L, 13 L, 3 L, about
//   41 L in all") are one card asked together, with the reason; each unit
//   stays outside its blank; "an" goes inside; an item of a list is warned
//   about; a hint written for a blank sits inside it.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/card-angles.mjs [shots-folder]
import { deflateSync, crc32 } from 'node:zlib'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const shots = process.argv[2]

const png = (r, g, b, w = 120, h = 80) => {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data])
    const out = Buffer.alloc(8 + data.length + 4)
    out.writeUInt32BE(data.length, 0)
    body.copy(out, 4)
    out.writeUInt32BE(crc32(body), 8 + data.length)
    return out
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(w, 0); header.writeUInt32BE(h, 4); header[8] = 8; header[9] = 2
  const rows = Buffer.concat(Array.from({ length: h }, () => Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [r, g, b]).flat())])))
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]).toString('base64')
}

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 950 })
const { h, v, go, both } = c
const wait = (ms) => h.waitForTimeout(ms)
// A picture pasted where the focus is (or on the window), as ⌘V of a copied picture does.
const paste = (base64, selector) => h.evaluate(([data, at]) => {
  const bytes = Uint8Array.from(atob(data), (ch) => ch.charCodeAt(0))
  const transfer = new DataTransfer()
  transfer.items.add(new File([bytes], 'map.png', { type: 'image/png' }))
  const target = at ? document.querySelector(at) : document.activeElement ?? document.body
  target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }))
}, [base64, selector])
// Words picked in the gem's own editor, as a mouse would pick them.
const pick = (words) => h.evaluate((w) => {
  const root = document.querySelector('[data-open] .ProseMirror')
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walk.nextNode(); node; node = walk.nextNode()) {
    const at = node.textContent.indexOf(w)
    if (at < 0) continue
    root.focus()
    const range = document.createRange()
    range.setStart(node, at); range.setEnd(node, at + w.length)
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range)
    document.dispatchEvent(new Event('selectionchange'))
    return true
  }
  return false
}, words)
const item = (id) => v('item', id)
// The gem's details open, and its "Comes back" group, where the question and its blanks are.
const details = async () => {
  const open = h.locator('button[aria-label="Details"][aria-pressed="false"]').first()
  if (await open.count()) { await open.click(); await wait(700) }
  const fold = h.locator('[data-details-group="Comes back"] button[aria-expanded="false"]')
  if (await fold.count()) { await fold.first().click(); await wait(400) }
}
const blankIt = async (words) => {
  const ok = await pick(words)
  await details()
  if (!(await pick(words))) return false
  await h.locator('text=/Blank (more of )?the selected words/').first().click(); await wait(700)
  return ok
}

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await v('onboarding:set', { pageHints: false })

  // --- Ask another way
  await go('review'); await wait(1500)
  const face = h.locator('[data-review-card] h2').first()
  check('Review shows a card', await face.count() === 1)
  const front = (await v('review:queue'))[0]
  await v('item:save', front.id, { context: 'Kept context: the bigger story' })
  await go('inbox'); await go('review'); await wait(1500)
  const before = (await v('items', 'nugget')).length
  await h.keyboard.press('a'); await wait(500)
  check('A opens "Ask another way" under the card', await h.locator('[data-another-way]').isVisible())
  check('it says what the new card keeps', /keeps its context/.test(await h.locator('[data-another-way]').textContent()))
  if (shots) await both(`${shots}/another-way`)
  await h.keyboard.type('A narrower side question?'); await h.keyboard.press('Enter')
  await h.keyboard.type('Its answer #probeangle'); await h.keyboard.press('Enter'); await wait(900)
  const after = await v('items', 'nugget')
  check('a new card is made', after.length === before + 1, `${before} → ${after.length}`)
  const made = after.find((one) => one.prompt === 'A narrower side question?')
  const full = made && await item(made.id)
  check('it keeps the card\'s context', full?.context === 'Kept context: the bigger story', full?.context)
  check('it keeps the source the card had', (full?.attribution ?? null) === (front.attribution ?? null) && (full?.medium ?? null) === (front.medium ?? null))
  check('the box stays open for the next angle, and counts', /1 new angle on this/.test(await h.locator('[data-another-made]').textContent()))
  await h.keyboard.press('Escape'); await wait(300)
  check('Esc closes it', !(await h.locator('[data-another-way]').count()))
  await face.click({ button: 'right' }); await wait(400)
  check('the card\'s menu has "Ask another way"', await h.locator('[role="menuitem"]', { hasText: 'Ask another way' }).count() === 1)
  await h.keyboard.press('Escape'); await wait(300)

  // --- A picture pasted on the answer
  await h.keyboard.press(' '); await wait(700)
  const shown = h.locator('[data-answer-side]')
  check('the answer shows', await shown.isVisible())
  const was = (await item(front.id)).body
  await h.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {})
  await paste(png(30, 110, 200)); await wait(1200)
  const pictured = (await item(front.id)).body
  check('⌘V puts the picture in the card\'s answer', JSON.stringify(pictured).includes('haligtree://assets/'))
  check('and it shows under the answer at once', await shown.locator('img[src^="haligtree://assets/"]').count() >= 1)
  check('the context shows after the answer', /Kept context/.test(await h.locator('[data-card-context]').textContent().catch(() => '')))
  await h.keyboard.press('Meta+z'); await wait(900)
  check('⌘Z takes the picture off', !JSON.stringify((await item(front.id)).body).includes('haligtree://assets/'), JSON.stringify(was).slice(0, 60))
  await paste(png(30, 110, 200)); await wait(1200)
  if (shots) await both(`${shots}/picture-on-answer`)

  // --- Blanks
  const text = 'Body water: intracellular 25 L, interstitial 13 L, plasma 3 L, about 41 L in all.'
  const gem = await v('nugget:from', text, {})
  await h.evaluate((id) => window.api.openInHome('nugget', id), gem); await wait(1500)
  for (const words of ['25 L', '13 L', '3 L']) check(`blanks "${words}"`, await blankIt(words))
  const blanked = (await item(gem)).prompt
  check('three blanks, each unit kept outside', blanked === 'Body water: intracellular _____ L, interstitial _____ L, plasma _____ L, about 41 L in all.', blanked)
  check('numbers that add up: asked together, with the reason', /41 minus 25 minus 13 is 3/.test(await h.locator('[data-blank-reason]:visible').textContent().catch(() => '')))
  check('the unit note says the unit is the cue', /kept “L” showing/.test(await h.locator('[data-blank-panel]:visible').textContent()))
  await h.locator('[data-blank-hint]:visible').first().fill('how many L inside cells'); await h.locator('[data-blank-hint]:visible').first().press('Enter'); await wait(700)
  check('a hint goes inside its blank', (await item(gem)).prompt.startsWith('Body water: intracellular _____ (how many L inside cells) L'), (await item(gem)).prompt)
  if (shots) await both(`${shots}/blanks-together`)

  const list = await v('nugget:from', 'The plasma proteins are albumin, fibrinogen and globulins. The heart is an organ.', {})
  await h.evaluate((id) => window.api.openInHome('nugget', id), list); await wait(1500)
  await blankIt('fibrinogen')
  check('an item of a list is warned about', /one item of a list of 3/.test(await h.locator('[data-blank-panel]:visible').textContent()))
  await blankIt('organ')
  check('"an" goes inside the blank', /The heart is _____\.$/.test((await item(list)).prompt), (await item(list)).prompt)
  const count = (await v('items', 'nugget')).length
  await details()
  if (shots) await h.screenshot({ path: `${shots}/before-apart.png` })
  await h.locator('[data-blank-panel]:visible button[aria-label="Ask apart"]').click({ timeout: 5000 }); await wait(1200)
  check('asked apart: a card for each blank', (await v('items', 'nugget')).length === count + 1)
  check('this card keeps the first blank, the second filled in', /fibrinogen/.test((await item(list)).prompt) === false && /an organ/.test((await item(list)).prompt), (await item(list)).prompt)
  if (shots) await both(`${shots}/blanks-apart`)
} finally {
  await c.close()
}
done()
