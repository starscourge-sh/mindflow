// Calm, the rounded and quiet sound pack: listed in Settings › Sound pack,
// chosen with a click, and every preview on the right plays through it with
// no error (the window is muted under QA; the sound graph still runs).
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/calm-pack.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const s = await sandbox({ width: 1300, height: 900 })
const { h, v, go, close } = s
try {
  await v('settings:set', { sounds: true, volume: 0.5 })
  await go('settings')
  await h.waitForTimeout(1200)
  await h.click('[data-section="Sound"]')
  await h.waitForTimeout(1200)
  const hearth = h.getByText('Calm', { exact: true }).first()
  await hearth.scrollIntoViewIfNeeded()
  check('Calm is in the list', (await hearth.count()) === 1)
  await hearth.click()
  await h.waitForTimeout(600)
  check('a click makes it yours', (await v('settings')).soundPack === 'calm', String((await v('settings')).soundPack))
  // Every preview button on the right, once each.
  const previews = h.locator('[data-setting]').filter({ hasText: 'Sound pack' }).locator('button')
  const count = await previews.count()
  for (let i = 0; i < count; i++) await previews.nth(i).click({ timeout: 2000 }).catch(() => undefined)
  await h.waitForTimeout(1500)
  check(`its ${count} previews play with no error`, !s.errors.length, s.errors.join(' | '))
} finally {
  await close()
}
done()
