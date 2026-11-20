// A quote's "- jonatha" in quick capture offers the people already in the book, with their portraits, best match
// first, in the one suggestion list (note-link-menu.tsx NoteList): ↑↓ move, Tab writes the whole name, the who chip
// then names the real person and opens their page; ", drac" offers the works and ↵ takes one; the gem kept is on his
// page. A name that fits no one stays as typed. The who field itself offers the same list (ui.tsx Remembered), as it
// does in a gem's page and a note's Properties.
//   QA_DATA=<copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox [QA_SHOTS=dir] node qa/said-by-names.mjs
import { CALM_HOUR, sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760, at: CALM_HOUR })
const { page, v } = c
const boxErrors = []
page.on('pageerror', (e) => boxErrors.push('PAGEERROR ' + e.message))
page.on('console', (m) => m.type() === 'error' && boxErrors.push(m.text().slice(0, 300)))
const wait = (ms) => page.waitForTimeout(ms)
const shots = process.env.QA_SHOTS
const EDITOR = '.tiptap.ProseMirror.haligtree-editor'
const POPUP = '.tiptap-suggestion-popup'
const rows = () => page.$$eval(`${POPUP} button`, (all) => all.map((one) => ({ text: one.textContent.trim(), selected: one.classList.contains('is-selected'), portrait: !!one.querySelector('img, [style*="background-image"]') })))
const line = () => page.evaluate((sel) => document.querySelector(sel)?.textContent ?? '', EDITOR)
const who = () => page.evaluate(() => document.querySelector('input[data-box-who]')?.value ?? null)
const where = () => page.evaluate(() => document.querySelector('input[data-box-where]')?.value ?? null)
const QUOTE = '“Listen to them.” - jonatha'

try {
  await v('settings:set', { hintRate: 0, rotCount: 0, sounds: false, boxOneLine: true, boxGlance: false })
  // Two Jonathans, Swift first and Harker since (so Harker is the one used last), Harker with a portrait; and a work.
  await v('source:set', 'attribution', 'Jonathan Swift', '')
  await wait(1100)
  await v('source:set', 'attribution', 'Jonathan Harker', '')
  // A portrait the book already keeps (the seed's people each have one), worn by him too.
  const portrait = Object.values(await v('people'))[0]?.avatar
  check('0. a portrait to give him', !!portrait && (await v('people:set', 'Jonathan Harker', portrait)))
  await v('source:set', 'medium', 'Dracula', '')

  await page.evaluate(() => window.api.showPrompt())
  await wait(1200)
  await page.click(EDITOR)
  await page.keyboard.type(QUOTE, { delay: 15 })
  await wait(500)
  let list = await rows()
  check('1. "- jonatha" offers the people in the book, Jonathan Harker first', list[0]?.text.endsWith('Jonathan Harker') && list.some((one) => one.text.endsWith('Jonathan Swift')), JSON.stringify(list))
  check('2. Jonathan Harker wears his portrait in the list', list[0]?.portrait, JSON.stringify(list[0]))
  if (shots) {
    for (const look of ['light', 'dark']) {
      await c.look(look)
      await page.evaluate((l) => { localStorage.setItem('theme', l === 'light' ? 'paper' : l); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }, look)
      await wait(400)
      await page.screenshot({ path: `${shots}/said-by-${look}.png` })
    }
  }
  await page.keyboard.press('ArrowDown')
  await wait(100)
  list = await rows()
  check('3. ↓ moves to the next name', list[1]?.selected && !list[0]?.selected, JSON.stringify(list.map((one) => one.selected)))
  await page.keyboard.press('ArrowUp')
  await wait(100)
  await page.keyboard.press('Tab')
  await wait(500)
  check('4. Tab writes the whole name in the words', (await line()).endsWith('- Jonathan Harker'), await line())
  check('5. the list closes', (await rows()).length === 0)
  check('6. the who chip reads Jonathan Harker', (await who()) === 'Jonathan Harker', await who())
  check('7. the who chip is linked to his page', await page.evaluate(() => !!document.querySelector('[data-who-linked]')))

  await page.keyboard.type(', drac', { delay: 15 })
  await wait(500)
  list = await rows()
  check('8. ", drac" offers the works in the book: Dracula', list[0]?.text === 'Dracula', JSON.stringify(list))
  await page.keyboard.press('Enter')
  await wait(500)
  check('9. ↵ writes the work, and Where from reads it', (await line()).endsWith('- Jonathan Harker, Dracula') && (await where()) === 'Dracula', `${await line()} | ${await where()}`)
  if (shots) await page.screenshot({ path: `${shots}/said-by-filled.png` })

  await page.keyboard.press('Meta+Enter')
  await wait(1200)
  const kept = await page.evaluate(async () => (await window.api.captures.list()).sort((a, b) => (b.capturedAt ?? '').localeCompare(a.capturedAt ?? ''))[0])
  check('10. the quote is kept said by Jonathan Harker, from Dracula', kept?.attribution === 'Jonathan Harker' && kept?.medium === 'Dracula', `${kept?.attribution} | ${kept?.medium}`)
  const his = await v('source', 'attribution', 'Jonathan Harker')
  check('11. it is on his page', !!his?.items?.some((one) => one.id === kept?.id), `${his?.items?.length} on his page`)

  // A name no one in the book has: nothing offered, kept as typed.
  await page.evaluate(() => window.api.showPrompt())
  await wait(1200)
  await page.click(EDITOR)
  await page.keyboard.type('“Words, only words.” - Zed Newname', { delay: 15 })
  await wait(500)
  check('12. a name that fits no one offers nothing', (await rows()).length === 0)
  check('13. and stays as typed, a new person', (await who()) === 'Zed Newname', await who())

  // The who field itself, drawn once the pill grows into the box (⌘\\): the same list, Tab takes the name.
  await page.keyboard.press('Meta+Backslash')
  await wait(900)
  await page.locator('input[data-box-who]').click({ force: true, timeout: 5000 }).catch((error) => console.log('click:', error.message.split('\n')[0]))
  console.log('focused:', await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80)))
  await page.keyboard.press('Meta+a')
  await page.keyboard.type('jona', { delay: 15 })
  await wait(500)
  const field = await page.$$eval('[data-source-offers] button', (all) => all.map((one) => ({ text: one.textContent.trim(), portrait: !!one.querySelector('img, [style*="background-image"]') })))
  check('14. typed in the who field: the same list, Jonathan Harker first with his portrait', field[0]?.text.endsWith('Jonathan Harker') && field[0]?.portrait, JSON.stringify(field))
  const side = await page.evaluate(() => {
    const list = document.querySelector('[data-source-offers]')?.getBoundingClientRect()
    const input = document.querySelector('input[data-box-who]')?.getBoundingClientRect()
    return list && input ? { listBottom: Math.round(list.bottom), inputTop: Math.round(input.top), high: innerHeight, cls: document.querySelector('[data-source-offers]').className } : null
  })
  check('14b. low in the box, the field\'s list opens above it, inside the window', side && side.listBottom <= side.inputTop, JSON.stringify(side))
  if (shots) await page.screenshot({ path: `${shots}/said-by-field.png` })
  await page.keyboard.press('Tab')
  await wait(300)
  check('15. Tab there takes the whole name', (await who()) === 'Jonathan Harker', await who())
  check('16. no page errors', !c.errors.length && !boxErrors.length, [...c.errors, ...boxErrors].join(' | '))
} catch (error) {
  check('ran to the end', false, error.message)
} finally {
  await c.close()
  done()
}
