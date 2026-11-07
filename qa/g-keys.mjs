// Every “G and a key” the shortcut list names opens the page it says: G W is Feed (the list said Tasks, Upcoming), G , is Media (not listed).
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-aud/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/g-keys.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 860 })
const { h, errors, close, go, v } = c
const heads = () => h.evaluate(() => [...document.querySelectorAll('h1')].map((one) => one.innerText.trim()).join(' | '))
try {
  await v('settings:set', { sounds: false, hintRate: 0, motion: false })
  for (const [key, page] of [['w', 'Feed'], [',', 'Files']]) {
    await go('home'); await h.evaluate(() => document.activeElement?.blur?.())
    await h.keyboard.press('g'); await h.keyboard.press(key); await h.waitForTimeout(1200)
    check(`G ${key.toUpperCase()} opens ${page}`, (await heads()).includes(page), await heads())
  }
  // The ? sheet lists both, as they are.
  await go('home'); await h.evaluate(() => document.activeElement?.blur?.())
  await h.keyboard.press('Shift+?'); await h.waitForTimeout(900)
  const sheet = await h.evaluate(() => document.body.innerText)
  check('the ? sheet says G W goes to Feed', /Go to Feed/.test(sheet) && !/Go to Tasks, Upcoming\n/.test(sheet))
  check('the ? sheet lists G , for Files', /Go to Files/.test(sheet))
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()
