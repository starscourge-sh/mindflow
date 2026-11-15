// A notice under a menu holds still and fades; it comes back where it was when the menu goes (the user, 15 Nov 2026: a
// toast at the bottom "shot up above the context menu then disappeard" when a right-click menu opened over it). A dialog
// still moves it clear, as before: a notice must stay readable beside a dialog that stays up.
// The menu and the dialog are stood in for (a `[role=menu]` and a `[role=dialog]` laid over the notice's place, at the
// app's menus' z 50, under the notices' 60), the way the notice's own place-finder reads them (ui.tsx useClearSpot).
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/toast-holds-still.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 800 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const notice = () => h.evaluate(() => {
  const words = [...document.querySelectorAll('body *')].find((one) => one.childElementCount === 0 && one.textContent === 'A notice to read')
  const lane = words?.closest('.pointer-events-none.fixed')
  const at = words?.getBoundingClientRect()
  return at ? { top: Math.round(at.top), left: Math.round(at.left), opacity: lane ? getComputedStyle(lane).opacity : '?', style: lane?.getAttribute('style') ?? '', moves: lane ? getComputedStyle(lane).transitionProperty + ' ' + getComputedStyle(lane).transitionDuration : '' } : null
})
// Read until it has stopped changing (a window kept off the screen paints and runs its fades late), up to 1.5s; with
// how long it took, so a notice that never comes back, or crawls back, still fails.
const settled = async () => {
  const from = Date.now()
  let one = await notice()
  while (Date.now() - from < 1500 && (!one || Number(one.opacity) < 0.99)) (await wait(50), (one = await notice()))
  return one && { ...one, after: Date.now() - from }
}
const cover = (role) => h.evaluate(({ role }) => {
  const words = [...document.querySelectorAll('body *')].find((one) => one.childElementCount === 0 && one.textContent === 'A notice to read')
  const at = words.getBoundingClientRect()
  const panel = document.createElement('div')
  panel.setAttribute('role', role)
  panel.dataset.qaStandIn = ''
  Object.assign(panel.style, { position: 'fixed', left: `${at.left - 40}px`, width: `${at.width + 80}px`, top: `${at.top - 120}px`, height: '220px', background: 'rgba(0,0,0,0.01)', zIndex: '50' })
  document.body.append(panel)
}, { role })
const uncover = () => h.evaluate(() => document.querySelectorAll('[data-qa-stand-in]').forEach((one) => one.remove()))
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await wait(800)
  // A notice that stays up for the whole check (hovered notices stay; this one is said again if it goes).
  const say = () => h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:toast', { detail: { text: 'A notice to read', tone: 'success' } })))
  await say()
  await wait(700)
  const before = await notice()
  check('a notice shows at the bottom', !!before && before.opacity === '1', JSON.stringify(before))
  await cover('menu')
  await wait(500)
  const under = await notice()
  check('a menu opened over it: the notice holds still', !!under && Math.abs(under.top - before.top) <= 1 && Math.abs(under.left - before.left) <= 1, `${JSON.stringify(before)} → ${JSON.stringify(under)}`)
  check('and fades where it stands', !!under && Number(under.opacity) < 0.05, JSON.stringify(under))
  // The notices sit over menus: faded, it must not take a click meant for the menu's line under it.
  const takes = await h.evaluate(() => {
    const words = [...document.querySelectorAll('body *')].find((one) => one.childElementCount === 0 && one.textContent === 'A notice to read')
    const at = words.getBoundingClientRect()
    const hit = document.elementFromPoint(at.left + at.width / 2, at.top + at.height / 2)
    return hit?.closest('[data-qa-stand-in]') ? 'the menu' : hit ? `${hit.tagName.toLowerCase()} ${hit.className}`.slice(0, 90) : 'nothing'
  })
  check('a click where it faded goes to the menu, not to the notice', takes === 'the menu', takes)
  await uncover()
  const back = (await settled()) ?? (await say(), await wait(700), await settled())
  check('the menu gone: it is back, in the same place', !!back && Number(back.opacity) >= 0.99 && Math.abs(back.top - before.top) <= 1, JSON.stringify(back))
  // As quickly as it went (the day's page fades the notices in 800ms, a beat late: that is for writing).
  check('and back within 600ms', !!back && back.after <= 600, `${back?.after}ms`)
  await cover('dialog')
  await wait(500)
  const beside = (await settled()) ?? (await say(), await wait(700), await settled())
  check('a dialog over it still moves it clear, readable', !!beside && Number(beside.opacity) >= 0.99 && Math.abs(beside.top - before.top) > 20, `${JSON.stringify(before)} → ${JSON.stringify(beside)}`)
  await uncover()
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
