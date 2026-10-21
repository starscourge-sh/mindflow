// A group's "Change icon…" opens the emoji panel and it stays open, by the
// pointer and by the keys, until an icon is picked or Esc is pressed.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 SHOTS=<dir> node qa/icon-picker-stays.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
const dir = process.env.SHOTS ?? `${process.env.QA_DATA}/shots`
mkdirSync(dir, { recursive: true })
const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const c = await sandbox({ width: 1100, height: 760 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const panel = () => h.evaluate(() => !!document.querySelector('[data-slot="popover-content"] .tiptap-icon-picker, [data-slot="popover-content"] input'))
// As if the window were in front (without taking the focus from anyone): focus moving
// out of the panel closes it only in a focused window, which is how a person sees it.
const cdp = await h.context().newCDPSession(h)
await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true })
try {
  await v('settings:set', { motion: true, sounds: false, hintRate: 0 })
  // Writing, or Gems with PAGE=nuggets.
  const [page, tier] = process.env.PAGE === 'nuggets' ? ['nuggets', 'nugget'] : ['articles', 'article']
  await h.evaluate((tier) => localStorage.setItem(`view:${tier}`, JSON.stringify({ sort: 'manual', group: 'none', filter: {}, density: 'list' })), tier)
  await c.go(page); await wait(800)
  const rows = h.locator('button[data-row][data-id]')
  await rows.nth(0).click({ modifiers: ['Meta'] })
  await rows.nth(2).click({ modifiers: ['Meta'] })
  await h.keyboard.press('Control+Meta+n'); await wait(500)
  await h.keyboard.press('Enter'); await wait(600)
  const group = h.locator('[data-group-row]').first()
  check('a group to change', await group.count() === 1)

  const opened = async (how) => {
    await group.click({ button: 'right' }); await wait(350)
    const item = h.locator('[role="menuitem"]', { hasText: 'Change icon' }).first()
    // Every time the panel comes or goes, with when: a flash is a come, a go and maybe a come again.
    await h.evaluate(() => {
      window.__panel = []
      const t0 = performance.now()
      let was = false
      const look = () => { const now = !!document.querySelector('[data-slot="popover-content"]'); if (now !== was) (window.__panel.push(`${now ? 'in' : 'out'}@${Math.round(performance.now() - t0)}`), was = now) }
      window.__look?.disconnect()
      window.__look = new MutationObserver(look); window.__look.observe(document.body, { childList: true, subtree: true })
    })
    if (how === 'keys') { await item.hover(); await h.keyboard.press('Enter') }
    // As a hand does it: onto the line, held a moment, let go, and the pointer drifts on.
    else { const box = await item.boundingBox(); await h.mouse.move(box.x + 20, box.y + box.height / 2, { steps: 6 }); await wait(120); await h.mouse.down(); await wait(110); await h.mouse.up(); await h.mouse.move(box.x + 60, box.y + box.height / 2 + 30, { steps: 8 }) }
    const seen = []
    for (const at of [150, 400, 1200]) { await wait(at - (seen.length ? [150, 400, 1200][seen.length - 1] : 0)); seen.push(await panel()) }
    console.log(`   ${how}: ${await h.evaluate(() => window.__panel.join(' '))}`)
    return seen
  }
  for (const how of ['pointer', 'keys', 'pointer']) {
    const seen = await opened(how)
    await h.screenshot({ path: `${dir}/icon-panel-${how}.png` })
    check(`by the ${how}: the panel opens and stays open`, seen.every(Boolean), seen.join(' '))
    // The focus taken elsewhere (as a menu shutting, or the list, can do): still open.
    await h.evaluate(() => document.querySelector('[data-group-row]')?.focus()); await wait(300)
    check(`by the ${how}: the focus going back to the list leaves it open`, await panel())
    await h.keyboard.press('Escape'); await wait(400)
    check(`by the ${how}: Esc puts it away`, !(await panel()))
  }
  // Picked: the icon is the group's, and the panel goes.
  await opened('pointer')
  await h.locator('[data-slot="popover-content"] input').first().fill('rocket'); await wait(300)
  await h.locator('[data-slot="popover-content"] .tiptap-icon-picker-grid button').first().click(); await wait(500)
  const icon = (await v('groups', tier))[0]?.icon
  check('picked: the icon is the group’s', icon && icon.includes('🚀'), icon)
  check('picked: the panel goes', !(await panel()))
} finally { await c.close() }
const failed = results.filter((ok) => !ok).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
