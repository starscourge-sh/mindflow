// Questions is one-line rows in newspaper columns, as Notion lays out a page of links: as many columns as fit at
// 18rem, read down the first and on to the next, the date headings across them all. No grid, no way to pick one.
// ↓ walks down a column then on to the top of the next, → steps across, ↵ opens. The same on Answered, Looked up and Words.
//   cp -cR <c-tip> <dir>; QA_ARGS=--sandbox QA_DATA=<dir> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOTS=dir] node qa/questions-columns.mjs
process.env.QA_ARGS ??= '--sandbox'
const { sandbox } = await import('./sandbox-lib.mjs')
import { checks } from './harness.mjs'

const { check, done } = checks()
const shots = process.env.SHOTS
const c = await sandbox({ width: 1440, height: 900 })
const { h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)
// Every row on the page, where it stands; the heading over them and the list's own width.
const read = () => h.evaluate(() => {
  const main = document.querySelector('[role="main"]') ?? document
  const rows = [...main.querySelectorAll('[data-row]')].map((one) => { const at = one.getBoundingClientRect(); return { id: one.dataset.id, x: Math.round(at.left), y: Math.round(at.top), w: Math.round(at.width), h: Math.round(at.height), cursor: one.hasAttribute('data-cursor') } })
  const lines = [...main.querySelectorAll('[data-row-line]')]
  const head = main.querySelector('[data-row-line]')?.parentElement?.firstElementChild
  return { rows, line: lines[0] ? Math.round(lines[0].getBoundingClientRect().width) : 0, head: head && head !== lines[0] ? Math.round(head.getBoundingClientRect().width) : 0, tiles: main.querySelectorAll('[data-tile-title], [data-word-band]').length }
})
const columnsOf = (rows) => [...new Set(rows.map((one) => one.x))].sort((a, b) => a - b)
const cursorRow = async () => (await read()).rows.find((one) => one.cursor)
try {
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, pageHints: false })
  // Enough open questions to fill a few columns, all asked today, so they stand under one heading.
  for (let at = 1; at <= 22; at++) await v('question:new', `Question ${String(at).padStart(2, '0')}: why does the river bend where it does, and not further down?`)
  // A Display chosen before (a grid) is not a way back to one.
  await h.evaluate(() => localStorage.setItem('view:question', JSON.stringify({ sort: 'newest', group: 'date', filter: {}, density: 'small' })))
  await h.reload(); await wait(1500)
  for (const width of [1440, 1000]) {
    await c.size(width, 900); await go('questions'); await wait(700)
    const seen = await read()
    const columns = columnsOf(seen.rows)
    check(`${width}: Questions shows its rows in columns (${columns.length}), no tiles`, columns.length >= (width === 1440 ? 2 : 1) && seen.tiles === 0, JSON.stringify({ columns, tiles: seen.tiles }))
    check(`${width}: every row one line (under 40px) and each column at least 18rem`, seen.rows.every((one) => one.h < 40 && one.w >= 280), JSON.stringify(seen.rows.slice(0, 2)))
    check(`${width}: the date heading spans every column`, seen.head >= seen.line - 2, JSON.stringify({ head: seen.head, line: seen.line }))
    if (shots) await c.both(`${shots}/questions-${width}`)
  }
  await c.size(1440, 900); await go('questions'); await wait(700)
  // No grid, and no way to choose one: Display has no "View as".
  await h.locator('[data-display]').first().click(); await wait(500)
  const panel = await h.evaluate(() => document.querySelector('[data-slot="popover-content"]')?.innerText ?? '')
  check('Display offers no "View as", no grid', !/View as|Small grid|\bGrid\b/.test(panel), panel.replace(/\s+/g, ' ').slice(0, 160))
  await h.keyboard.press('Escape'); await wait(300)
  // ↓ walks down the first column, then on to the top of the next.
  const columns = columnsOf((await read()).rows)
  await h.keyboard.press('ArrowDown'); await wait(150)
  const path = [await cursorRow()]
  while (path.length < 40 && path.at(-1)?.x === columns[0]) { await h.keyboard.press('ArrowDown'); await wait(120); path.push(await cursorRow()) }
  const firstColumn = path.length - 1
  const downFirst = firstColumn > 1 && path.slice(1, firstColumn).every((one, at) => one.y > path[at].y)
  const next = path[firstColumn]
  check(`↓ walks down column 1 (${firstColumn} rows), then on to the top of column 2`, downFirst && next && next.x === columns[1] && next.y === path[0].y, JSON.stringify(path.map((one) => one && [one.x, one.y])))
  await h.keyboard.press('ArrowUp'); await wait(120)
  const back = await cursorRow()
  check('↑ from the top of column 2 goes back to the foot of column 1', back && back.x === columns[0] && back.y === path[firstColumn - 1].y, JSON.stringify(back))
  await h.keyboard.press('ArrowRight'); await wait(120)
  const across = await cursorRow()
  check('→ steps to the row level with it in the next column', across && across.x === columns[1] && across.y === back.y, JSON.stringify(across))
  await h.keyboard.press('Enter'); await wait(1200)
  const opened = await h.evaluate(() => ({ head: !!document.querySelector('[data-question-head]'), editors: document.querySelectorAll('.ProseMirror').length }))
  check('↵ opens the question under the cursor', opened.head && opened.editors > 0, JSON.stringify(opened))
  if (shots) await c.both(`${shots}/questions-open`)
  // The other lists of Questions: the same columns, no tiles, no View as.
  for (const [at, name] of [[1, 'Answered'], [2, 'Looked up'], [3, 'Words']]) {
    await go('questions'); await wait(500)
    await h.locator('[data-question-filter] button').nth(at).click(); await wait(900)
    const seen = await read()
    await h.locator('[data-display]').first().click(); await wait(400)
    const said = await h.evaluate(() => document.querySelector('[data-slot="popover-content"]')?.innerText ?? '')
    await h.keyboard.press('Escape'); await wait(200)
    check(`${name}: no tiles and no "View as" (${seen.rows.length} rows in ${columnsOf(seen.rows).length} columns)`, seen.tiles === 0 && !/View as/.test(said) && seen.rows.every((one) => one.h < 40), JSON.stringify({ tiles: seen.tiles, heights: [...new Set(seen.rows.map((one) => one.h))], said: /View as/.test(said) }))
    if (shots) await c.both(`${shots}/${name.toLowerCase().replace(' ', '-')}-1440`)
  }
  check('no page errors', !c.errors?.some((one) => /PAGEERROR/.test(one)), (c.errors ?? []).slice(0, 2).join(' | '))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
