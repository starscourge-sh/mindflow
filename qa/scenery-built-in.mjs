// Haligtree's own paintings are never lost: their folder is named for them,
// its × takes them out with Undo, and "Add Haligtree's paintings" puts them back.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/scenery-built-in.mjs
import { readdirSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const s = await sandbox({ width: 1300, height: 900 })
const { h, v, go, close } = s
try {
  await go('settings')
  await h.waitForTimeout(1200)
  await h.click('[data-section="Scenery"]')
  await h.waitForTimeout(2500)
  const row = h.locator('[data-scenery-folder]').filter({ hasText: 'Haligtree’s paintings' })
  await row.first().scrollIntoViewIfNeeded()
  const shipped = readdirSync((await v('settings')).sceneryFolders[0]).filter((one) => one.endsWith('.webp'))
  check(`Haligtree ships 20 paintings (${shipped.length})`, shipped.length === 20)
  check('the built-in folder is named "Haligtree’s paintings"', (await row.count()) === 1)
  await h.getByRole('button', { name: 'Remove Haligtree’s paintings' }).click()
  await h.waitForTimeout(800)
  check('its × takes them out', (await v('settings')).sceneryFolders.length === 0)
  const back = h.getByRole('button', { name: 'Add Haligtree’s paintings' })
  check('"Add Haligtree’s paintings" is offered once they are out', (await back.count()) === 1)
  await back.click()
  await h.waitForTimeout(1500)
  const folders = (await v('settings')).sceneryFolders
  check('one press puts them back', folders.length === 1 && /Sandbox scenery$|Scenery$/.test(folders[0]), JSON.stringify(folders))
  check('and the button goes', (await back.count()) === 0)
  check('no page errors', !s.errors.length, s.errors.join(' | '))
} finally {
  await close()
}
done()
