// Quick capture kept calm under a note: no empty Where from under a saved
// note, no row of goals to log to, and at most one offer, only when the words
// are plainly about it ("Helps answer “…” · Add", Tab or a click adds it).
// A new quote still asks who and where; the gear menu still has
// “Add to a question or goal…” and “Add where it’s from”.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/box-calm.mjs
// QA_SHOTS=dir saves light and dark pictures.
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const c = await sandbox({ width: 1100, height: 760 })
const { page, v } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const shots = process.env.QA_SHOTS
await v('settings:set', { hintRate: 0, rotCount: 0, boxHideButtons: false })

const fresh = async () => {
  await page.evaluate(() => window.api.showPrompt())
  await page.waitForTimeout(500)
  await page.click(EDITOR)
  await page.keyboard.press('Meta+a')
  await page.keyboard.press('Backspace')
  await page.waitForTimeout(300)
}
/** What sits under the writing: the source fields, the offer lines, their words. */
const under = () => page.evaluate(() => ({
  fields: [...document.querySelectorAll('input')].filter((one) => one.offsetParent && /Where|Who|Site/.test(one.placeholder)).map((one) => `${one.placeholder}=${one.value}`),
  offers: [...document.querySelectorAll('[data-box-offers]')].map((one) => one.innerText.replace(/\s+/g, ' ').trim()),
  buttons: document.querySelectorAll('[data-box-offers] button').length,
  logRow: [...document.querySelectorAll('[data-box-offers]')].some((one) => one.innerText.includes('Log to'))
}))
const gear = async () => {
  await page.getByRole('button', { name: 'Actions', exact: true }).click()
  await page.waitForTimeout(400)
  return page.evaluate(() => [...document.querySelectorAll('[role=menu] [role^=menuitem]')].map((i) => i.innerText.split('\n')[0].trim()))
}
const shoot = async (name) => {
  if (!shots) return
  // The theme is the window's own (localStorage), changed as Settings changes it.
  const look = (name) => page.evaluate((n) => (localStorage.setItem('theme', n), window.dispatchEvent(new StorageEvent('storage', { key: 'theme' }))), name)
  for (const theme of ['paper', 'dark']) {
    await look(theme)
    // Past the theme's cross-fade.
    await page.waitForTimeout(1600)
    await page.screenshot({ path: `${shots}/${name}-${theme}.png` }).catch(() => {})
  }
  await look('paper')
}
/** A saved note opened in the box, from its side panel, trying each tab for it. */
const openFromPanel = async (title) => {
  for (let i = 0; i < 6; i++) {
    const row = page.locator('aside, [data-panel]').getByText(title, { exact: true }).first()
    if (await row.count()) {
      await row.click()
      await page.waitForTimeout(1200)
      return true
    }
    await page.keyboard.press(`Control+${i + 1}`)
    await page.waitForTimeout(500)
  }
  return false
}

try {
  // --- “Start here”, opened in the box ---
  await fresh()
  check('“Start here” found in the side panel', await openFromPanel('Start here'))
  const row = await page.evaluate(() => document.querySelector('[data-zen-row]')?.textContent ?? '')
  // Rolling words draw each letter twice in the text: read with the doubles taken out.
  check('“Start here” is open in the box', /C+l+o+s+e+\s+n+o+t+e+/.test(row), row.slice(0, 80))
  await page.mouse.move(400, 400)
  await page.waitForTimeout(600)
  const s = await under()
  await shoot('start-here')
  check('no empty Where from under it', !s.fields.some((one) => one.endsWith('=')), JSON.stringify(s.fields))
  check('no Log to row', !s.logRow, JSON.stringify(s.offers))
  check('at most one offer line, with one button', s.offers.length <= 1 && s.buttons <= 1, JSON.stringify(s.offers))
  const items = await gear()
  // “Add who and where it’s from” while the note has neither (a note can take Who and Where).
  const source = items.find((one) => /^Add (who and )?where it’s from$/.test(one))
  check('the gear menu has “Add where it’s from”', !!source, JSON.stringify(items))
  check('the gear menu has “Add to a question or goal…”', items.includes('Add to a question or goal…'), JSON.stringify(items))
  await page.getByRole('menuitem', { name: source ?? 'Add where it’s from' }).click()
  await page.waitForTimeout(500)
  const asked = await under()
  const focused = await page.evaluate(() => document.activeElement?.hasAttribute('data-box-where'))
  check('“Add where it’s from” brings out the field, ready to type', asked.fields.some((one) => one.startsWith('Where from=')) && focused, JSON.stringify(asked.fields))
  await page.keyboard.type('x')
  await page.keyboard.press('Backspace')
  await page.waitForTimeout(300)
  check('cleared while typing, the field stays', (await under()).fields.some((one) => one.startsWith('Where from=')))
  // “Add to a question or goal…” lays them all out.
  await gear()
  await page.getByRole('menuitem', { name: 'Add to a question or goal…' }).click()
  await page.waitForTimeout(500)
  const every = await under()
  check('“Add to a question or goal…” shows them all', every.offers.length === 1 && /Helps answer/.test(every.offers[0]) && /Log to/.test(every.offers[0]), JSON.stringify(every.offers))
  await page.keyboard.press('Meta+Enter')
  await page.waitForTimeout(800)

  // --- a new quote still asks who and where ---
  await fresh()
  await page.keyboard.type('“The obstacle is the way.” ', { delay: 10 })
  await page.waitForTimeout(400)
  await page.locator('[data-zen-row] button').first().click()
  await page.waitForTimeout(300)
  await page.getByRole('menuitemradio', { name: /Quote/ }).or(page.getByRole('option', { name: /Quote/ })).or(page.getByRole('menuitem', { name: /Quote/ })).first().click().catch(() => {})
  await page.waitForTimeout(500)
  const q = await under()
  check('a new quote shows Who and Where', q.fields.some((one) => /^Who/.test(one)) && q.fields.some((one) => /^Where/.test(one)), JSON.stringify(q.fields))
  await page.keyboard.press('Meta+Enter')
  await page.waitForTimeout(800)

  // --- a plain new note asks for nothing ---
  await fresh()
  await page.keyboard.type('Bread rises faster in a warm kitchen', { delay: 8 })
  await page.waitForTimeout(600)
  const plain = await under()
  check('a plain new note shows no Where from and no offer', plain.fields.length === 0 && plain.offers.length === 0, JSON.stringify(plain))

  // --- words about a question: that one offer, Tab adds it ---
  const before = (await v('questions:pinned')).find((one) => /spinning/.test(one.title))
  await fresh()
  await page.keyboard.type('In the last scene the top keeps spinning and wobbles', { delay: 8 })
  await page.waitForTimeout(800)
  const m = await under()
  await shoot('offer')
  check('words about a question show that one offer', m.offers.length === 1 && /Helps answer “Is the top still spinning\?”/.test(m.offers[0]), JSON.stringify(m.offers))
  await page.keyboard.press('Tab')
  await page.waitForTimeout(1000)
  const after = (await v('questions:pinned')).find((one) => /spinning/.test(one.title))
  check('Tab adds it as a clue', before && after && after.clues === before.clues + 1, `${before?.clues} → ${after?.clues}`)
  // And a click does too.
  await fresh()
  await page.keyboard.type('Does the spinning top ever fall over?', { delay: 8 })
  await page.waitForTimeout(800)
  await page.locator('[data-box-offers] button', { hasText: 'Add' }).click()
  await page.waitForTimeout(1000)
  const clicked = (await v('questions:pinned')).find((one) => /spinning/.test(one.title))
  check('a click on Add adds it too', clicked && after && clicked.clues === after.clues + 1, `${after?.clues} → ${clicked?.clues}`)
} catch (error) {
  console.log('ERROR', error.message)
  results.push(false)
} finally {
  const passed = results.filter(Boolean).length
  console.log(`\n${passed}/${results.length} passed${c.errors?.length ? `  errors: ${c.errors.slice(0, 3).join(' | ')}` : ''}`)
  await c.close()
  process.exit(passed === results.length ? 0 : 1)
}
