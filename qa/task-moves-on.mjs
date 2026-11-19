// "Make it a task" on the capture open in the Inbox moves on to the next one, every way in (the user, 17 Nov: "i
// converted to task, why am i still seeing open"; ⌘K's left it open as "Resolved"). The notice says it is a task,
// with Undo; Undo brings it back open. Ways in: ⌘K, and the row's right-click menu.
//   QA_ARGS=--sandbox QA_DATA=<copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOTS=/abs/dir] node qa/task-moves-on.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 800 })
const { h, go, errors } = c
const wait = (ms = 900) => h.waitForTimeout(ms)
const ROWS = '[class*="@container/page"] button[data-row][data-id]'
const paneWords = () => h.evaluate(() => (document.querySelector('[class*="@container/page"] .note-pane .ProseMirror')?.firstElementChild?.textContent ?? '').trim())
const rowWords = (n) => h.evaluate(([s, i]) => (document.querySelectorAll(s)[i]?.innerText ?? '').split('\n')[0].trim(), [ROWS, n])
const toast = () => h.evaluate(() => [...document.querySelectorAll('[data-sonner-toast], [role=status]')].map((one) => one.innerText.replace(/\s+/g, ' ')).join(' | '))
const cases = [
  ['⌘K', async () => {
    await h.keyboard.press('Meta+k'); await h.keyboard.type('Make it a task', { delay: 30 })
    await h.waitForFunction(() => [...document.querySelectorAll('[role="dialog"][aria-label="Search"] [data-action-label]')].some((one) => /^Make it a task/.test(one.textContent ?? '')), null, { timeout: 8000 })
    await h.keyboard.press('Enter')
  }],
  ['the row’s right-click menu', async () => {
    // The open one's own row, the second.
    await h.locator(ROWS).nth(1).click({ button: 'right' })
    // "Make it a task" is under "Turn it into", as a person finds it.
    await h.locator('[role^="menuitem"]:has-text("Turn it into")').first().hover()
    await h.locator('[role^="menuitem"]:has-text("Make it a task")').first().click()
  }]
]
try {
  await go('inbox')
  for (const [way, act] of cases) {
    await h.locator(ROWS).nth(1).click(); await wait(1200)
    const was = await paneWords()
    const next = await rowWords(2)
    await act(); await wait(1600)
    const now = await paneWords()
    check(`${way}: the pane moves on from "${was.slice(0, 30)}" to the next capture`, now && now !== was && now === next, `now "${now.slice(0, 40)}", next row "${next.slice(0, 40)}"`)
    const said = await toast()
    check(`${way}: a notice says it is a task, with Undo`, /task/i.test(said) && /Undo/.test(said), said)
    if (process.env.SHOTS) await h.screenshot({ path: `${process.env.SHOTS}/q1-task-${cases.findIndex((one) => one[0] === way)}.png` })
    await h.keyboard.press('Escape')
    await h.keyboard.press('Meta+z'); await wait(1500)
  }
  check('no page errors', !errors.length, errors.slice(0, 3).join(' | '))
} catch (error) {
  check('the probe ran to its end', false, error.message)
} finally {
  await c.close()
  done()
}
