// The keeping-and-coming-back walk's gaps, closed: a grade in Review can be
// taken back (⌘Z or its button), a saved Why is changed where it is read, a
// card opens beside to be edited, a gem's menu offers a link and a pin in
// plain words, one set aside says why it is dimmed, and an Undo is one sound.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/keep-gaps.mjs [shots-folder]
import { sandbox } from './sandbox-lib.mjs'

const c = await sandbox({ width: 1200, height: 800 })
const { h, go, v } = c
const shots = process.argv[2]
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const heard = () => h.evaluate(() => (window.vigilHeard ?? []).splice(0))
try {
  await v('settings:set', { sounds: true, hintRate: 0, rotCount: 0 })

  // Review: grade one, then take it back.
  await go('review')
  await h.waitForTimeout(800)
  const first = (await h.locator('h2').first().textContent())?.trim()
  await h.keyboard.press('Space')
  await h.waitForTimeout(400)
  await h.keyboard.press('3')
  await h.waitForTimeout(700)
  const second = (await h.locator('h2').first().textContent())?.trim()
  check('a grade moves on to the next card', second && second !== first, `${first} -> ${second}`)
  check('an Undo for that grade is offered, named', (await h.locator('[data-undo-grade]').textContent())?.includes('Undo “Good”'))
  if (shots) await h.screenshot({ path: `${shots}/review-undo.png` })
  await heard()
  await h.keyboard.press('Meta+z')
  await h.waitForTimeout(700)
  check('⌘Z brings the graded card back in front', (await h.locator('h2').first().textContent())?.trim() === first)
  const cues = (await heard()).filter((one) => one.startsWith('cue:'))
  check('taking it back is one sound', cues.length === 1 && cues[0] === 'cue:undo', cues.join(', '))
  check('the button goes once used', (await h.locator('[data-undo-grade]').count()) === 0)

  // A saved Why is changed where it is read.
  await h.keyboard.press('Space')
  await h.waitForTimeout(400)
  const why = h.locator('[data-why] input')
  if (await why.count()) {
    await why.fill('Because the light cannot get out')
    await why.press('Enter')
    await h.waitForTimeout(500)
  }
  const saved = h.locator('[data-why-saved]')
  check('a saved Why can be clicked to change', (await saved.count()) === 1)
  await saved.click()
  await h.waitForTimeout(300)
  check('clicking it puts it back in the field', (await h.locator('[data-why] input').inputValue().catch(() => '')).length > 0)
  await h.keyboard.press('Escape')
  await h.waitForTimeout(300)
  check('left as it was, it is shown again', (await h.locator('[data-why-saved]').count()) === 1)
  check('the card can be opened beside to edit', (await h.locator('[data-edit-card]').count()) === 1)

  // Gems: the row menu, in plain words.
  await go('nuggets')
  await h.waitForTimeout(700)
  await h.locator('[data-id]').first().click({ button: 'right' })
  await h.waitForTimeout(400)
  const menu = await h.$$eval('[role="menuitem"]', (all) => all.map((one) => one.textContent?.trim()))
  await h.locator('[role="menuitem"]', { hasText: /^Copy$/ }).hover()
  await h.waitForTimeout(400)
  const copies = await h.$$eval('[role="menuitem"]', (all) => all.map((one) => one.textContent?.trim()))
  check('a gem\'s menu offers Pin to the sidebar and Copy link to this note', menu.some((m) => m?.startsWith('Pin to the sidebar')) && copies.some((m) => m?.startsWith('Copy link')), JSON.stringify(copies))
  check('and Make it private in words that say what happens', menu.some((m) => m?.startsWith('Make it private')), JSON.stringify(menu))
  await h.keyboard.press('Escape')
  await h.keyboard.press('Escape')

  // One set aside says so where it is dimmed.
  const items = await v('items', 'nugget')
  const one = items.find((item) => item.prompt)
  await v('item:save', one.id, { suspended: true })
  await go('home'); await go('nuggets')
  await h.waitForTimeout(800)
  const line = await h.locator(`[data-id="${one.id}"]`).first().textContent().catch(() => '')
  check('a set-aside gem says why it is dimmed', line.includes('Set aside'), line.slice(0, 120))

  // Archive a gem, then Undo: one sound for the Undo.
  await h.locator('[data-id]').nth(1).click({ button: 'right' })
  await h.waitForTimeout(300)
  await h.locator('[role="menuitem"]', { hasText: /^Archive$/ }).click()
  await h.waitForTimeout(700)
  await heard()
  await h.getByRole('button', { name: /Undo/ }).first().click()
  await h.waitForTimeout(900)
  const undoCues = (await heard()).filter((one) => one.startsWith('cue:'))
  check('Undo of an archive is one sound', undoCues.length === 1 && undoCues[0] === 'cue:undo', undoCues.join(', '))

  // Questions: a clue can be changed or deleted, not only copied.
  await go('questions')
  await h.waitForTimeout(700)
  await h.locator('[data-id]').first().click()
  await h.waitForTimeout(900)
  const clue = h.locator('section ol li').first()
  if (await clue.count()) {
    await clue.click({ button: 'right' })
    await h.waitForTimeout(400)
    const clueMenu = await h.$$eval('[role="menuitem"]', (all) => all.map((one) => one.textContent?.trim()))
    check('a clue can be changed and deleted', clueMenu.includes('Change the words…') && clueMenu.includes('Delete the clue'), JSON.stringify(clueMenu))
    await h.keyboard.press('Escape')
  } else check('a clue is there to right-click', false)

  // The Bin says what each capture was; Settings says why a control is greyed.
  await go('discarded')
  await h.waitForTimeout(700)
  const kinds = await h.$$eval('[data-bin-row="capture"] span:first-child', (all) => all.map((one) => one.textContent))
  check('a capture in the Bin says its kind, not “Capture”', kinds.length > 0 && !kinds.includes('Capture'), JSON.stringify(kinds))
  await v('settings:set', { sounds: false })
  await go('settings')
  await h.waitForTimeout(500)
  await h.locator('input[placeholder="Search..."], input[placeholder="Search…"]').first().fill('volume')
  await h.waitForTimeout(500)
  const off = await h.$$eval('[data-setting-off]', (all) => all.map((one) => one.textContent))
  check('with Sounds off, Volume says how to change it', off.some((one) => one?.includes('Turn “Sounds” on')), JSON.stringify(off))
  if (shots) await h.screenshot({ path: `${shots}/settings-off.png` })
  await v('settings:set', { sounds: true })

  // Sidebar counts say what they count.
  await h.mouse.move(600, 600)
  await h.waitForTimeout(300)
  await h.locator('[data-side-count="review"]').hover()
  let tip = ''
  for (let i = 0; i < 10 && !/to review/.test(tip); i++) {
    await h.waitForTimeout(250)
    tip = (await h.$$eval('[role="tooltip"], [data-slot="tooltip-content"]', (all) => all.map((one) => one.textContent).join(' | ')).catch(() => '')) ?? ''
  }
  check('a sidebar count says what it counts', /cards? to review now/.test(tip ?? ''), tip)

  // A gem keeps where it came from, and it can be changed on its page.
  const quoteId = await h.evaluate(() => window.api.captures.create({ kind: 'quote', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Know thyself.' }] }] }, attribution: 'Socrates', medium: 'Delphi' }))
  await v('promote', quoteId, 'Look inward before outward.')
  const gems = await v('items', 'nugget')
  const kept = gems.find((one) => one.captureId === quoteId)
  if (!kept) console.log('capture after promote:', JSON.stringify(await h.evaluate((one) => window.api.captures.get(one), quoteId).then((c) => c && { s: c.status, m: c.medium, a: c.attribution })))
  check('a capture kept as a gem carries its “Where from”', kept?.medium === 'Delphi', JSON.stringify(kept && { a: kept.attribution, m: kept.medium }))
  if (kept) {
    await v('item:save', kept.id, { medium: 'The temple at Delphi' })
    check('a gem\'s “Where from” is saved', (await v('items', 'nugget')).find((one) => one.id === kept.id)?.medium === 'The temple at Delphi')
    // A correction, taken back.
    const fixed = await v('supersede', kept.id, 'Know thyself, said the temple.')
    await v('unsupersede', kept.id, fixed, false)
    const after = await v('items', 'nugget')
    check('“This turned out wrong” can be undone', !after.some((one) => one.id === fixed) && !after.find((one) => one.id === kept.id)?.supersededBy)
  }

  // The Bin: one thing deleted for good, after a plain yes.
  await go('discarded')
  await h.waitForTimeout(700)
  const before = await h.locator('[data-bin-row]').count()
  await h.locator('[data-bin-row]').first().click({ button: 'right' })
  await h.waitForTimeout(300)
  await h.locator('[role="menuitem"]', { hasText: 'Delete for good…' }).click()
  await h.waitForTimeout(300)
  check('deleting for good asks first, in plain words', (await h.locator('[data-bin-ask]').textContent())?.includes('It cannot come back'))
  if (shots) await h.screenshot({ path: `${shots}/bin-ask.png` })
  await h.locator('[data-bin-ask] button', { hasText: 'Delete for good' }).click()
  await h.waitForTimeout(800)
  check('a yes lets just that one go', (await h.locator('[data-bin-row]').count()) === before - 1, `${before} -> ${await h.locator('[data-bin-row]').count()}`)

  // Tags: what Learning, Maintaining and Paused do, pointed at.
  await go('tags')
  await h.waitForTimeout(600)
  await h.getByText('astrophysics', { exact: true }).first().click().catch(() => {})
  await h.waitForTimeout(600)
  await h.locator('button', { hasText: /^Manage$/ }).first().click().catch(() => {})
  await h.waitForTimeout(600)
  const chip = h.locator('[data-tag-priority] button[aria-label="Maintaining"]')
  await chip.first().waitFor({ timeout: 3000 }).catch(() => {})
  if (await chip.count()) {
    await chip.hover()
    let said = ''
    for (let i = 0; i < 8 && !said.includes('no new ones'); i++) { await h.waitForTimeout(250); said = (await h.$$eval('[role="tooltip"], [data-slot="tooltip-content"]', (all) => all.map((one) => one.textContent).join(' '))) ?? '' }
    check('“Maintaining” says what it does', said.includes('no new ones start'), said)
  } else { if (shots) await h.screenshot({ path: `${shots}/tags-fail.png` }); check('the tag\'s Review choices are there', false) }
} finally {
  const passed = results.filter(Boolean).length
  console.log(`${passed}/${results.length} passed`)
  console.log(c.errors.length ? 'errors: ' + c.errors.slice(0, 3).join(' | ') : 'no page errors')
  await c.close()
  process.exit(passed === results.length ? 0 : 1)
}
