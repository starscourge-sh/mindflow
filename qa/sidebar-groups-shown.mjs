// Pinned and Recent switch on and off in Settings > Sidebar like the pages do: off, the whole group
// (heading and notes) is gone from the sidebar; on, it is back. They sit under the first run with no
// grip, have no G key, are not in ⌘K, and the Pinned heading's right click hides it.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-p/main/index.js HALIGTREE_QA_AWAY=1 [SHOTS=<dir>] node qa/sidebar-groups-shown.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1500, height: 1000 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const shot = async (name) => process.env.SHOTS && h.screenshot({ path: `${process.env.SHOTS}/${name}.png` })
const side = () => h.evaluate(() => ({
  pinned: !!document.querySelector('aside nav [data-side-heading="pinned"]'),
  pinRows: document.querySelectorAll('aside nav [data-side-drop="pinned"] [data-drag-open]').length,
  recent: !!document.querySelector('aside nav [data-side-heading="recent"]'),
  recentRows: document.querySelectorAll('aside nav [data-side-recent-row]').length
}))
const flip = async (id) => { await h.locator(`[data-show-row="${id}"] [role="switch"]`).first().click(); await wait(700) }
const isOn = (id) => h.evaluate((one) => document.querySelector(`[data-show-row="${one}"] button[role="switch"]`)?.getAttribute('aria-checked') === 'true', id)
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  // Something pinned, and a few notes opened, so both groups have rows to draw.
  await c.go('inbox'); await wait(1200)
  const list = h.locator('[data-capture-row], [data-row]')
  for (let i = 1; i < 5; i++) { await list.nth(i).click(); await wait(400) }
  const gems = await v('items', 'nugget')
  await v('pin', 'nuggets', gems[0].id, true)
  await c.go('settings'); await wait(800)
  await h.locator('[data-section="Appearance"]').click(); await wait(900)
  await h.locator('[data-show-row="pinned"]').scrollIntoViewIfNeeded(); await wait(300)

  const start = await v('settings')
  check('every book starts with both on: none saved off, and neither is among the pages', !(start.sidebarGroupsOff ?? []).length && !start.sidebarShown.some((id) => id === 'pinned' || id === 'recent'), JSON.stringify({ off: start.sidebarGroupsOff, shown: start.sidebarShown }))
  check('Settings lists Pinned and Recent, switched on', (await isOn('pinned')) && (await isOn('recent')))
  const before = await side()
  check('the sidebar draws both, with rows', before.pinned && before.pinRows > 0 && before.recent && before.recentRows > 0, JSON.stringify(before))
  const look = await h.evaluate(() => {
    const ids = [...document.querySelectorAll('[data-show-row]')].map((one) => one.getAttribute('data-show-row'))
    const row = (id) => document.querySelector(`[data-show-row="${id}"]`)
    return {
      ids,
      grips: ['pinned', 'recent'].map((id) => !!row(id).querySelector('svg.cursor-grab')),
      keys: ['pinned', 'recent'].map((id) => row(id).textContent.includes('G '))
    }
  })
  const at = look.ids.indexOf('pinned')
  check('listed right after the first run (Calendar), Pinned then Recent', look.ids[at - 1] === 'calendar' && look.ids[at + 1] === 'recent', look.ids.join(', '))
  check('no drag grip and no G key on either', !look.grips.some(Boolean) && !look.keys.some(Boolean), JSON.stringify(look))

  await flip('pinned'); await flip('recent')
  const off = await side()
  check('both off: neither heading nor its notes is drawn', !off.pinned && !off.pinRows && !off.recent && !off.recentRows, JSON.stringify(off))
  const offNow = (await v('settings')).sidebarGroupsOff
  check('saved off, apart from the pages', ['pinned', 'recent'].every((id) => (offNow ?? []).includes(id)), JSON.stringify(offNow))
  await shot('groups-off')

  await flip('pinned'); await flip('recent')
  const back = await side()
  check('both on again: drawn with their rows', back.pinned && back.pinRows > 0 && back.recent && back.recentRows > 0, JSON.stringify(back))

  // Not pages: no ⌘K line goes to them.
  await h.keyboard.press('Meta+k'); await wait(600)
  await h.keyboard.type('Go to Pinned'); await wait(600)
  const goes = await h.evaluate(() => document.body.innerText.includes('Go to Pinned') || document.body.innerText.includes('Go to Recent'))
  await h.keyboard.press('Escape'); await wait(400)
  check('⌘K offers no "Go to Pinned" or "Go to Recent"', !goes)

  // The Pinned heading's right click hides the whole group.
  await h.locator('aside nav [data-side-heading="pinned"] button').click({ button: 'right' }); await wait(500)
  const menu = await h.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].map((one) => one.textContent.trim()))
  check('the heading offers "Hide from the sidebar"', menu.some((one) => one.startsWith('Hide from the sidebar')), menu.join(' / '))
  await h.locator('[role="menuitem"]', { hasText: 'Hide from the sidebar' }).click(); await wait(800)
  check('and hides Pinned', !(await side()).pinned && (await v('settings')).sidebarGroupsOff.includes('pinned'))
  check('said with the way back', await h.evaluate(() => document.body.innerText.includes('“Pinned” hidden. “Customize sidebar…” shows it again')))
  check('Settings shows it off', !(await isOn('pinned')))
  await h.locator('[data-show-every]').first().click(); await wait(800)
  check('"Show everything" brings it back', (await side()).pinned && !(await v('settings')).sidebarGroupsOff.length)
  check('no page errors', !c.errors?.some((one) => /PAGEERROR/.test(one)), (c.errors ?? []).slice(0, 2).join(' | '))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
