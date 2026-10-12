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
  check('a gem\'s menu offers Pin to the sidebar and Copy link to this note', menu.some((m) => m?.startsWith('Pin to the sidebar')) && copies.some((m) => m?.startsWith('Copy link to this note')), JSON.stringify(copies))
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
} finally {
  const passed = results.filter(Boolean).length
  console.log(`${passed}/${results.length} passed`)
  console.log(c.errors.length ? 'errors: ' + c.errors.slice(0, 3).join(' | ') : 'no page errors')
  await c.close()
  process.exit(passed === results.length ? 0 : 1)
}
