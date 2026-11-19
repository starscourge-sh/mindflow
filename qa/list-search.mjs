// Every list of things can be searched with the lists' own field, as the Bin can (the user, 19 Nov: "why isn't it
// searchable?"): Tasks' Today, Upcoming and All, Goals, the Queue and Sources. On each, a word from a row is typed
// into the page's search field; every row left holds it, and clearing the field brings the rest back.
//   QA_ARGS=--sandbox QA_DATA=<copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/list-search.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 800 })
const { h, go, errors } = c
const ROWS = '[class*="@container/page"] [data-row]'
const rows = () => h.evaluate((s) => [...document.querySelectorAll(s)].filter((one) => one.getClientRects().length).map((one) => one.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean), ROWS)
const FIELD = '[class*="@container/page"] input[type="search"], [class*="@container/page"] input[placeholder^="Find"]'
try {
  for (const [view, label] of [['today', 'Tasks, Today'], ['upcoming', 'Tasks, Upcoming'], ['alltasks', 'Tasks, All'], ['goals', 'Goals'], ['queue', 'Queue'], ['sources', 'Sources']]) {
    await go(view); await h.waitForTimeout(1500)
    const before = await rows()
    const field = await h.$(FIELD)
    if (!field) { check(`${label}: has the lists' search field`, false, `${before.length} rows`); continue }
    // A word from the last row (so the first ones go), four letters or more.
    const word = (before.at(-1)?.match(/[A-Za-z]{4,}/g) ?? []).find((one) => !/^(Today|Late|Tomorrow|open)$/i.test(one))
    if (!word) { check(`${label}: a row to find`, false, JSON.stringify(before.slice(0, 3))); continue }
    await field.click(); await h.keyboard.type(word, { delay: 20 }); await h.waitForTimeout(700)
    const after = await rows()
    check(`${label}: "${word}" typed, every row left holds it (${after.length} of ${before.length})`, after.length > 0 && after.every((one) => one.toLowerCase().includes(word.toLowerCase())), JSON.stringify(after.slice(0, 4)))
    await h.keyboard.press('Meta+a'); await h.keyboard.press('Backspace'); await h.waitForTimeout(600)
    check(`${label}: the field emptied, the rows come back`, (await rows()).length === before.length, `${(await rows()).length} of ${before.length}`)
    await h.keyboard.press('Escape')
  }
  check('no page errors', !errors.length, errors.slice(0, 3).join(' | '))
} catch (error) {
  check('the probe ran to its end', false, error.message)
} finally {
  await c.close()
  done()
}
