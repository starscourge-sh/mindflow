// Anything moved to the Bin sounds once, and the sound is the shredder's
// tear: from Writing's right-click, from ⌘⌫ with the note open (the next
// note then opens with no page turn on top), and from the Inbox.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/bin-one-sound.mjs
// It reads what played (window.haligtreeHeard), so it runs muted like every probe.
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, go } = c
const wait = (ms) => h.waitForTimeout(ms)
const since = async (run) => {
  const from = await h.evaluate(() => (window.haligtreeHeard ?? []).length)
  await run(); await wait(1600)
  return h.evaluate((n) => (window.haligtreeHeard ?? []).slice(n), from)
}
try {
  for (const [page, how] of [['articles', 'menu'], ['articles', 'key'], ['nuggets', 'menu'], ['inbox', 'menu']]) {
    await go(page); await wait(1500)
    const row = h.locator('[data-id]').first()
    if (how === 'key') { await row.click(); await wait(1200) }
    const heard = await since(async () => {
      if (how === 'menu') { await row.click({ button: 'right' }); await wait(500); await h.getByRole('menuitem', { name: /^Move to the Bin/ }).first().click() }
      else await h.keyboard.press('Meta+Backspace')
    })
    const after = heard.slice(heard.indexOf('tear'))
    check(`${page}, ${how}: one tear, and nothing after it`, heard.filter((one) => one === 'tear').length === 1 && after.length === 1, heard.join(', '))
  }
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally { await c.close() }
done()
