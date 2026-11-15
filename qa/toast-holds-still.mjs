// A notice under a menu holds still and fades; it comes back where it was when the menu goes (the user, 15 Nov 2026: a
// toast at the bottom "shot up above the context menu then disappeard" when a right-click menu opened over it). A dialog
// still moves it clear, as before: a notice must stay readable beside a dialog that stays up.
// The menu and the dialog are stood in for (a `[role=menu]` and a `[role=dialog]` laid over the notice's place), the
// way the notice's own place-finder reads them (ui.tsx useClearSpot).
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
  return at ? { top: Math.round(at.top), left: Math.round(at.left), opacity: lane ? getComputedStyle(lane).opacity : '?' } : null
})
const cover = (role) => h.evaluate(({ role }) => {
  const words = [...document.querySelectorAll('body *')].find((one) => one.childElementCount === 0 && one.textContent === 'A notice to read')
  const at = words.getBoundingClientRect()
  const panel = document.createElement('div')
  panel.setAttribute('role', role)
  panel.dataset.qaStandIn = ''
  Object.assign(panel.style, { position: 'fixed', left: `${at.left - 40}px`, width: `${at.width + 80}px`, top: `${at.top - 120}px`, height: '220px', background: 'rgba(0,0,0,0.01)', zIndex: '80' })
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
  await uncover()
  await wait(500)
  const back = (await notice()) ?? (await say(), await wait(700), await notice())
  check('the menu gone: it is back, in the same place', !!back && back.opacity === '1' && Math.abs(back.top - before.top) <= 1, JSON.stringify(back))
  await cover('dialog')
  await wait(500)
  const beside = (await notice()) ?? (await say(), await wait(700), await notice())
  check('a dialog over it still moves it clear, readable', !!beside && beside.opacity === '1' && Math.abs(beside.top - before.top) > 20, `${JSON.stringify(before)} → ${JSON.stringify(beside)}`)
  await uncover()
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
