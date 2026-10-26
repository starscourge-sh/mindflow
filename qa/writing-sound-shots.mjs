// Screens of the "Sound" control beside what it should match: the day page's
// writer's line, the writing room's foot (beside Focus and Aim), and the
// Settings rows, in light and dark; with the type, ink and spacing measured.
//   QA_SHOTS=dir QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-s/main/index.js HALIGTREE_QA_AWAY=1 node qa/writing-sound-shots.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 860 })
const { h, go, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.QA_SHOTS ?? '/tmp'
const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const theme = async (name) => {
  await h.evaluate((t) => localStorage.setItem('theme', t), name)
  await h.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })))
  await wait(500)
}
/** The control's type and ink against its neighbour's, and the gaps either side. */
const measure = (line, sibling) => h.evaluate(([line, sibling]) => {
  const box = document.querySelector(line)
  const me = box?.querySelector('[data-writing-sound]')
  const them = box?.querySelector(sibling)
  if (!me || !them) return null
  const a = getComputedStyle(me)
  const b = getComputedStyle(them)
  const r = me.getBoundingClientRect()
  const prev = me.previousElementSibling?.getBoundingClientRect()
  return { size: [a.fontSize, b.fontSize], weight: [a.fontWeight, b.fontWeight], ink: [a.color, b.color], font: a.fontFamily === b.fontFamily, middle: [Math.round(r.top + r.height / 2), Math.round(them.getBoundingClientRect().top + them.getBoundingClientRect().height / 2)], gapBefore: prev ? Math.round(r.left - prev.right) : null, textInset: parseFloat(a.paddingLeft) }
}, [line, sibling])

try {
  await v('settings:set', { sounds: false, hintRate: 0, writingSound: 'rain', typingVoice: 'deep' })
  const today = new Date().toLocaleDateString('en-CA')
  await v('notes:day:save', today, { body: { type: 'doc', content: [para('The morning was grey and the sea was out. I walked down to the water and back before anyone was up.')] } })
  for (const name of ['light', 'dark']) {
    await theme(name)
    await go('day')
    await wait(1200)
    const line = await measure('[data-writer-line]', '[data-writer-time]')
    console.log(`  ${name} writer's line:`, JSON.stringify(line))
    check(`${name}: the writer's line control is set as its neighbours`, line && line.size[0] === line.size[1] && line.ink[0] === line.ink[1] && line.font && line.weight[0] === line.weight[1] && Math.abs(line.middle[0] - line.middle[1]) <= 1, JSON.stringify(line))
    const foot = await h.evaluate(() => document.querySelector('[data-writer-line]')?.getBoundingClientRect())
    if (foot) await h.screenshot({ path: `${shots}/writer-line-${name}.png`, clip: { x: foot.x - 60, y: foot.y - 30, width: foot.width + 120, height: foot.height + 30 } })
    await h.click('[data-room-open]')
    await wait(800)
    const room = await measure('[data-room-foot] [data-writer-tools]', '[data-aim-ask]')
    console.log(`  ${name} room foot:`, JSON.stringify(room))
    check(`${name}: the room's control is set as Aim beside it`, room && room.size[0] === room.size[1] && room.ink[0] === room.ink[1] && room.font && room.weight[0] === room.weight[1], JSON.stringify(room))
    const rf = await h.evaluate(() => document.querySelector('[data-room-foot]')?.getBoundingClientRect())
    if (rf) await h.screenshot({ path: `${shots}/room-foot-${name}.png`, clip: { x: rf.x - 40, y: rf.y - 20, width: rf.width + 80, height: rf.height + 30 } })
    await h.click('[data-room-foot] [data-writing-sound]')
    await wait(500)
    const menu = await h.evaluate(() => document.querySelector('[role="menu"]')?.getBoundingClientRect())
    if (menu && rf) await h.screenshot({ path: `${shots}/room-menu-${name}.png`, clip: { x: Math.min(menu.x, rf.x) - 30, y: menu.y - 20, width: Math.max(menu.right, rf.right) - Math.min(menu.x, rf.x) + 60, height: rf.bottom - menu.y + 40 } })
    await h.keyboard.press('Escape')
    await wait(300)
    await h.keyboard.press('Escape')
    await wait(500)
    await go('settings')
    await wait(800)
    await h.evaluate(() => document.querySelector('[data-section="Sound"]')?.click())
    await wait(800)
    const rows = await h.evaluate(() => {
      const one = document.querySelector('[data-setting-title="While you write"]')
      const two = document.querySelector('[data-setting-title="Typing voice"]')
      one?.scrollIntoView({ block: 'center' })
      const a = one?.getBoundingClientRect()
      const b = document.querySelector('[data-setting-title="Volume"]')?.getBoundingClientRect()
      const z = (document.querySelector('[data-setting-title="Session ticking"]') ?? two)?.getBoundingClientRect()
      return a && b && z && { x: a.x, y: Math.min(a.y, b.y), width: a.width, height: Math.max(z.bottom, two.getBoundingClientRect().bottom) - Math.min(a.y, b.y) }
    })
    await wait(300)
    const again = await h.evaluate(() => {
      const top = document.querySelector('[data-setting-title="Volume"]').getBoundingClientRect()
      const end = (document.querySelector('[data-setting-title="Session ticking"]') ?? document.querySelector('[data-setting-title="Typing voice"]')).getBoundingClientRect()
      return { x: top.x, y: top.y, width: top.width, height: end.bottom - top.y }
    })
    check(`${name}: Settings has both rows`, !!rows)
    await h.screenshot({ path: `${shots}/settings-${name}.png`, clip: again })
  }
} catch (error) {
  check('ran', false, error.stack)
} finally {
  await c.close()
}
done()
