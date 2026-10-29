// A popup a key asked for is simply there; one a click opened eases in on the app's own curve.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/keyed-popups.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const c = await sandbox({ width: 1800, height: 1000 })
const { h, errors, close, go, v } = c
const look = () => h.evaluate(() => {
  const el = [...document.querySelectorAll('[data-slot="popover-content"], [data-slot="sheet-content"]')].find((one) => /Sort by/.test(one.textContent ?? '') && one.getBoundingClientRect().width > 0)
  if (!el) return null
  const s = getComputedStyle(el)
  return { keyed: el.hasAttribute('data-keyed'), name: s.animationName, ease: s.animationTimingFunction }
})
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await go('inbox'); await h.waitForTimeout(1200)
  // A row under the keys, as a person moving through the list has.
  await h.evaluate(() => document.querySelector('[data-pane] [data-row]')?.focus()); await h.waitForTimeout(200)
  await h.keyboard.press('f'); await h.waitForTimeout(300)
  const byKey = await look()
  check('Display opened by F has no entrance', byKey && byKey.keyed && byKey.name === 'none', JSON.stringify(byKey))
  await h.keyboard.press('Escape'); await h.waitForTimeout(300)
  await h.locator('[data-display]:visible').first().click(); await h.waitForTimeout(40)
  const byClick = await look()
  check('Display opened by a click eases in on the app curve', byClick && !byClick.keyed && byClick.name !== 'none' && /0\.16, 1, 0\.3, 1/.test(byClick.ease), JSON.stringify(byClick))
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()
