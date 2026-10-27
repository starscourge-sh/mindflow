// The Mac's own dialogs (Save, Open) and menus follow the Mac's light or dark while the theme is solid (Paper,
// Light, Midnight, or any theme in a flat style): the frosting is hidden then. A see-through theme keeps them in its
// own look, and so do glass stickies, whose frosting must match the theme.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/dialogs-follow-mac.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760 })
const source = () => c.electron.evaluate(({ nativeTheme }) => nativeTheme.themeSource)
const solid = () => c.h.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--mf-window-tint').trim() === '100%')
try {
  await c.v('settings:set', { sounds: false, hintRate: 0, stickiesGlass: false })
  await c.theme('paper'); await c.h.waitForTimeout(500)
  check('Paper (solid): the Mac\'s own look', await solid() && (await source()) === 'system', await source())
  await c.theme('dracula'); await c.h.waitForTimeout(500)
  const seeThrough = !(await solid())
  check('Dracula (see-through): its own dark', !seeThrough || (await source()) === 'dark', `${await source()}, see-through ${seeThrough}`)
  await c.theme('paper'); await c.h.waitForTimeout(300)
  await c.v('settings:set', { stickiesFrosted: true, stickiesGlass: true }); await c.h.waitForTimeout(500)
  check('Paper with glass stickies: the theme\'s light, so their frost matches', (await source()) === 'light', await source())
  await c.v('settings:set', { stickiesGlass: false }); await c.h.waitForTimeout(500)
  check('glass stickies off again: the Mac\'s own look', (await source()) === 'system', await source())
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
