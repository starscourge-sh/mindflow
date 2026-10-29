// What the app says it can do, driven: the welcome's goodbye says it waits in the Haligtree menu, and
// What Haligtree can do says What's new does too; ? while reading shows the keys for reading, and L,
// which opens the notes it links to, is in that list.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-aud3/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/claims.mjs [shots folder]
import { mkdirSync } from 'fs'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.argv[2] ?? ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, errors, close, go, v, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
const appMenu = () => electron.evaluate(({ Menu }) => Menu.getApplicationMenu().items[0].submenu.items.filter((one) => one.type !== 'separator').map((one) => one.label))
const choose = (label) => electron.evaluate(({ Menu }, label) => Menu.getApplicationMenu().items[0].submenu.items.find((one) => one.label === label)?.click(), label)
try {
  await v('settings:set', { sounds: false, hintRate: 0, motion: false })
  const items = await appMenu()
  check('the Haligtree menu has “What\'s new” and “Show the welcome again”', items.includes("What's new") && items.includes('Show the welcome again'), items.join(' | '))
  await choose("What's new"); await wait(1200)
  check('“What\'s new” there opens its page', await h.locator('[data-page="whatsnew"]').count() === 1)
  await choose('Show the welcome again')
  check('“Show the welcome again” there opens the welcome', await h.waitForSelector('[data-thesis="line"], [data-skip-intro]', { timeout: 5000 }).then(() => true, () => false))
  if (SHOTS) await h.screenshot({ path: join(SHOTS, 'claims-welcome.png') })
  await h.locator('button', { hasText: 'Skip the welcome' }).first().click(); await wait(1500)
  check('its last page says so', (await h.locator('body').innerText()).includes('The welcome waits in the Haligtree menu and ⌘K'))
  await h.locator('button', { hasText: 'Start without the tour' }).first().click(); await wait(2000)

  // Reading: ? shows the keys for reading.
  await go('nuggets'); await wait(1200)
  await h.locator('[aria-label="Read through"]').first().click(); await wait(1200)
  check('“Read through” on Gems reads the list through', await h.locator('[role="dialog"][aria-label="Reading"]').count() === 1)
  await h.keyboard.press('Shift+Slash'); await wait(900)
  const sheet = h.locator('[role="dialog"][aria-label="Keyboard shortcuts"]')
  const words = await sheet.innerText().catch(() => '')
  check('? while reading opens the keys for reading', (await sheet.locator('input').inputValue().catch(() => '')) === 'Reading' && words.includes('Stop reading') && !words.includes('Go to Inbox'), words.slice(0, 200))
  check('and L, the notes it links to, is among them', words.includes('The notes it links to'))
  const onTop = await h.evaluate(() => { const box = document.querySelector('[role="dialog"][aria-label="Keyboard shortcuts"]')?.getBoundingClientRect(); return !!box && !!document.elementFromPoint(box.x + box.width / 2, box.y + 20)?.closest('[aria-label="Keyboard shortcuts"]') })
  check('the list is drawn over the page being read', onTop)
  if (SHOTS) await h.screenshot({ path: join(SHOTS, 'claims-reading-keys.png') })
  await h.keyboard.press('Escape'); await wait(500)
  await h.keyboard.press('Meta+Slash'); await wait(700)
  check('⌘/ is still the whole list', (await sheet.locator('input').inputValue().catch(() => 'x')) === '' && (await sheet.innerText()).includes('Go to Inbox'))
  await h.keyboard.press('Escape'); await wait(500)
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()
