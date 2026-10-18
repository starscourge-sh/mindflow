// The composer under an open note, idea and question, and read mode as a
// focus mode, in the sandbox: a thought kept from the composer on an idea, its
// history opened and one reworded; a clue kept on a question with ; to reach
// the field; read mode over the whole window (no sidebar, no panes) and the
// layout back as it was after Esc; Today's page with its date and time line.
// SHOTS=dir keeps pictures in light and dark.
//
//   npx electron-vite build --outDir out-reading
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-reading/main/index.js MINDFLOW_QA_AWAY=1 node qa/composer.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const c = await sandbox({ width: 1280, height: 840 })
const { h, v } = c
const results = []
const check = (name, ok, detail = '') => (results.push({ name, ok: !!ok }), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const wait = (ms = 400) => h.waitForTimeout(ms)
const shot = async (name) => SHOTS && h.screenshot({ path: `${SHOTS}/${name}.png` })
await v('settings:set', { safeMode: false, hintRate: 0, rotCount: 0, motion: false })

const openFirst = async (view) => {
  await c.go(view)
  await wait(700)
  const row = h.locator('[data-pane] [data-row][data-id]').first()
  const id = await row.getAttribute('data-id')
  await row.click()
  await wait(900)
  return id
}
const composer = () => h.locator('[data-pane] [data-composer]').first()

try {
  for (const theme of ['light', 'dark']) {
    await c.theme(theme)
    await v('settings:set', { safeMode: false, hintRate: 0, rotCount: 0, motion: false })

    // --- an idea: a thought from the composer, its history, a rewording
    const idea = await openFirst('nuggets')
    const field = composer().locator('textarea')
    check(`${theme}: an open idea has the composer, "Add a thought…"`, (await field.getAttribute('placeholder')) === 'Add a thought…')
    const bg = await composer().locator('> div').evaluate((el) => getComputedStyle(el).backgroundColor)
    check(`${theme}: its surface is opaque`, !/rgba\(.*, 0(\.\d+)?\)$/.test(bg) && bg !== 'transparent', bg)
    const glossFieldsInPanel = await h.locator('[data-pane] [data-gloss]:not([data-composer]) textarea, [data-pane] [data-gloss]:not([data-composer]) button:has-text("Add a thought")').count()
    check(`${theme}: the details panel drops its own Add a thought field`, glossFieldsInPanel === 0, String(glossFieldsInPanel))
    const said = `Composer thought ${theme} ${Date.now()}`
    await field.click()
    await field.fill(said)
    await h.keyboard.press('Enter')
    await wait(800)
    let glosses = await v('glosses', idea)
    check(`${theme}: Enter keeps it as a gloss`, glosses.some((one) => one.body === said))
    // The toast that says so never covers the composer.
    await wait(400)
    const overlap = async () => {
      const toast = await h.locator('[role="status"]').filter({ hasText: /kept/ }).last().boundingBox().catch(() => null)
      const bar = await h.locator('[data-composer]').last().boundingBox()
      return toast && bar ? !(toast.y + toast.height <= bar.y || toast.y >= bar.y + bar.height || toast.x + toast.width <= bar.x || toast.x >= bar.x + bar.width) : null
    }
    const covered = await overlap()
    check(`${theme}: the "kept" toast does not cover the composer`, covered === false, String(covered))
    // The composer sits under the editor, never over its words.
    const editorBox = await h.locator('[data-pane] .mindflow-editor-wrapper').first().boundingBox()
    const barBox = await composer().boundingBox()
    check(`${theme}: the composer sits below the words, not over them`, editorBox && barBox && barBox.y >= editorBox.y + editorBox.height - 1, `${editorBox?.y + editorBox?.height} <= ${barBox?.y}`)
    // ↑ in the empty field opens the history, newest at the foot.
    await field.click()
    await h.keyboard.press('ArrowUp')
    await wait(400)
    const history = composer().locator('ol li')
    const last = (await history.last().innerText()).split('\n')[0]
    check(`${theme}: ↑ opens the history, newest at the foot`, last === said, last)
    await shot(`composer-history-${theme}`)
    await history.last().locator('button').click()
    await wait(300)
    check(`${theme}: clicking one puts its words in the field to reword`, (await field.inputValue()) === said)
    await field.fill(`${said} (reworded)`)
    await h.keyboard.press('Enter')
    await wait(800)
    glosses = await v('glosses', idea)
    check(`${theme}: Enter keeps the rewording`, glosses.some((one) => one.body === `${said} (reworded)`) && !glosses.some((one) => one.body === said))
    await h.keyboard.press('Escape')

    // --- a question: ; reaches the composer, which keeps a clue
    const question = await openFirst('questions')
    const clueField = composer().locator('textarea')
    check(`${theme}: an open question's composer says "Add a clue…"`, (await clueField.getAttribute('placeholder')) === 'Add a clue…')
    check(`${theme}: the question's own add-clue field is gone`, (await h.locator('[data-clue-field]').count()) === 0)
    await h.locator('[data-pane] h3:has-text("Clues")').first().click().catch(() => {})
    await h.evaluate(() => document.activeElement?.blur())
    await h.keyboard.press(';')
    await wait(300)
    check(`${theme}: ; puts the caret in the composer`, await clueField.evaluate((el) => document.activeElement === el))
    const clue = `Composer clue ${theme} ${Date.now()}`
    await h.keyboard.type(clue)
    await h.keyboard.press('Enter')
    await wait(800)
    check(`${theme}: Enter keeps it as a clue`, (await v('glosses', question)).some((one) => one.body === clue))
    await wait(300)
    const clueCovered = await overlap()
    check(`${theme}: the clue toast does not cover the composer`, clueCovered === false, String(clueCovered))
    const numbers = await h.locator('[data-pane] li.group\\/track > span:first-child').evaluateAll((spans) => spans.map((one) => `${one.textContent}|${one.querySelectorAll('svg').length}`))
    check(`${theme}: every clue row shows its number, no play mark`, numbers.length > 0 && numbers.every((one) => /^\d+\|0$/.test(one)), numbers.join(' '))

    // --- read mode: the whole window, then the layout back
    // A point on the sidebar: left of every pane.
    const sidebar = await h.evaluate(() => {
      const left = Math.min(...[...document.querySelectorAll('[data-pane]')].map((el) => el.getBoundingClientRect().x))
      return left > 80 ? { x: left / 2, y: innerHeight / 2 } : null
    })
    // Past the first few reads, the way out is unseen until the pointer nears the top.
    await h.evaluate(() => localStorage.setItem('readExitTold', '9'))
    const panesBefore = await h.locator('[data-pane]').count()
    const layoutBefore = await h.evaluate(() => [...document.querySelectorAll('[data-pane]')].map((el) => JSON.stringify(el.getBoundingClientRect())).join('|'))
    await h.locator('[data-pane] button[aria-label="Read"]').first().click()
    await wait(900)
    const reading = h.locator('[role="dialog"][aria-label="Reading"]')
    const box = await reading.boundingBox()
    const size = await h.evaluate(() => ({ w: innerWidth, h: innerHeight }))
    check(`${theme}: read mode covers the whole window`, box && box.x === 0 && box.y === 0 && Math.abs(box.width - size.w) < 1 && Math.abs(box.height - size.h) < 1, JSON.stringify(box))
    const sidebarHidden = sidebar && (await h.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('[aria-label="Reading"]'), sidebar))
    check(`${theme}: the sidebar is covered while reading`, sidebarHidden)
    const paneHidden = await h.evaluate(() => [...document.querySelectorAll('[data-pane]')].every((pane) => {
      const r = pane.getBoundingClientRect()
      return !!document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('[aria-label="Reading"]')
    }))
    check(`${theme}: every pane is covered while reading`, paneHidden)
    const heading = (await reading.locator('article h1').first().innerText().catch(() => '')).trim()
    check(`${theme}: read mode heads the page with the question's title`, heading.length > 0, heading.slice(0, 50))
    const readComposer = reading.locator('[data-composer] textarea')
    check(`${theme}: read mode has the composer, "Add a clue…" on a question`, (await readComposer.getAttribute('placeholder')) === 'Add a clue…')
    await h.mouse.move(size.w / 2, size.h / 2)
    await wait(500)
    const doneOpacity = await reading.locator('button:has-text("Done reading")').evaluate((el) => getComputedStyle(el).opacity)
    await h.mouse.move(size.w / 2, 30)
    await wait(400)
    const doneNear = await reading.locator('button:has-text("Done reading")').evaluate((el) => getComputedStyle(el).opacity)
    check(`${theme}: Done reading is unseen while reading, there when the pointer nears the top`, Number(doneOpacity) === 0 && Number(doneNear) === 1, `${doneOpacity} -> ${doneNear}`)
    await h.mouse.move(size.w / 2, size.h / 2)
    await wait(300)
    await shot(`read-mode-${theme}`)
    await h.keyboard.press('Escape')
    await wait(700)
    check(`${theme}: Esc leaves read mode`, (await reading.count()) === 0)
    const layoutAfter = await h.evaluate(() => [...document.querySelectorAll('[data-pane]')].map((el) => JSON.stringify(el.getBoundingClientRect())).join('|'))
    check(`${theme}: the layout is back exactly as it was`, (await h.locator('[data-pane]').count()) === panesBefore && layoutAfter === layoutBefore)

    // --- Today's page: date and time under the title
    await c.go('day')
    await wait(1200)
    const line = (await h.locator('[data-today-line]').first().innerText().catch(() => '')).trim()
    check(`${theme}: Today's page shows the date and time under its title`, /^\d{1,2} [A-Z][a-z]+ · \d{1,2}:\d{2}/.test(line), line)
    await shot(`today-${theme}`)
  }
  check('no page errors', c.errors.length === 0, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
const failed = results.filter((one) => !one.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
