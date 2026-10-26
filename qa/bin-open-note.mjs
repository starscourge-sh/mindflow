// The note open on a page goes to the Bin from its own ⋯ menu: the page opens
// the next row (or the one before, at the end), never leaves the binned one
// up, and ⌘Z brings it back open. In the Inbox and in Writing.
//   QA_DATA=$(mktemp -d) QA_ENTRY=out-b/main/index.js HALIGTREE_QA_AWAY=1 node qa/bin-open-note.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, go, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const read = (page) => h.evaluate((P) => {
  const scope = document.querySelector(P)
  const rows = [...scope.querySelectorAll('[data-row][data-id]')].filter((one) => one.getBoundingClientRect().height > 0 && !one.closest('[data-example]')).map((one) => one.dataset.id)
  return { rows: [...new Set(rows)], pane: scope.querySelector('.note-pane')?.dataset.open ?? null }
}, `[data-page="${page}"]`)
const until = async (page, test, ms = 4000) => { const t0 = Date.now(); let s; do { await wait(200); s = await read(page) } while (!test(s) && Date.now() - t0 < ms); return s }

try {
  await v('settings:set', { sounds: false, hintRate: 0, countIn: false })
  await v('onboarding:set', { pageHints: false })
  for (const [name, page, at] of [['Inbox', 'inbox', 1], ['Inbox, the last row', 'inbox', -1], ['Writing', 'articles', 0]]) {
    await go(page); await wait(800)
    let s = await read(page)
    if (s.rows.length < 2) { check(`${name}: has rows`, false, s.rows.length); continue }
    const id = s.rows.at(at)
    const i = s.rows.indexOf(id)
    const want = s.rows[i + 1] ?? s.rows[i - 1]
    await h.locator(`[data-page="${page}"] [data-row][data-id="${id}"]`).first().click({ position: { x: 30, y: 10 } })
    s = await until(page, (s) => s.pane === id)
    check(`${name}: the note opens`, s.pane === id, s.pane)
    await h.locator(`[data-page="${page}"] .note-pane button[aria-label="More"]`).first().click()
    await wait(400)
    await h.locator('[role=menu] [role=menuitem]').filter({ hasText: /^Move to the Bin/ }).first().click()
    s = await until(page, (s) => s.pane !== id && !s.rows.includes(id))
    check(`${name}: binned from its ⋯ menu, it leaves the page`, s.pane !== id && !s.rows.includes(id), `pane ${s.pane}`)
    // The last row drawn may not be the list's last (a long list draws a few at a time): then any one still there.
    check(`${name}: the next one opens in its place`, at === -1 ? !!s.pane && s.pane !== id : s.pane === want, `want ${want}, got ${s.pane}`)
    await h.evaluate(() => document.activeElement?.closest?.('[contenteditable=true], input, textarea') && document.activeElement.blur())
    await wait(300)
    await h.keyboard.press('Meta+z')
    s = await until(page, (s) => s.pane === id)
    check(`${name}: ⌘Z brings it back open`, s.pane === id && s.rows.includes(id), `pane ${s.pane}`)
  }
} finally {
  await c.close()
}
done()
