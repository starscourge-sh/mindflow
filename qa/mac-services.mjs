// "Send to Haligtree" from any app's Services menu (every Mac): words sent through the app's
// own services provider (native/services.mm, the path macOS calls) land in the Inbox as a
// quote, the page's address kept as a link, the app it came from beside it, nothing copied.
// The menu line itself is listed by macOS only for the app in /Applications: not driven here.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/mac-services.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
import { copiedText, putOnBoard } from './pasteboard.mjs'

const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 800 })
const { h, electron } = c
try {
  const kept = 'Words copied before the Services menu was used'
  await putOnBoard(electron, kept)
  const ready = await electron.evaluate(() => typeof globalThis.servicesSend === 'function')
  check('the app answers the Services menu', ready)
  await electron.evaluate(() => globalThis.servicesSend('The obstacle is the way.\n\nWhat stands in the way becomes the way.', 'https://example.org/meditations'))
  let found = null
  for (let i = 0; i < 20 && !found; i++) {
    await h.waitForTimeout(250)
    found = await h.evaluate(async () => (await window.api.captures.list()).find((one) => /obstacle is the way/.test(JSON.stringify(one))) ?? null)
  }
  check('the words land in the Inbox as a quote', found?.kind === 'quote' && found.status === 'open', JSON.stringify(found)?.slice(0, 160))
  const body = found ? await h.evaluate((id) => window.api.captures.get?.(id).then((one) => JSON.stringify(one?.body ?? one)) ?? '', found.id) : ''
  check('both paragraphs are kept, and the page as a link', /What stands in the way/.test(body) && /https:\/\/example.org\/meditations/.test(body), body.slice(0, 200))
  const clip = await copiedText(electron)
  check('nothing was copied: the clipboard is as it was', clip === kept)
  const count = () => h.evaluate(async () => (await window.api.captures.list()).length)
  const before = await count()
  await electron.evaluate(() => globalThis.servicesSend('   '))
  await h.waitForTimeout(800)
  const after = await count()
  check('empty words make nothing', after === before, `${before} → ${after}`)
  await c.go('inbox')
  await h.waitForTimeout(900)
  const row = await h.evaluate(() => [...document.querySelectorAll('[data-row]')].find((one) => /obstacle is the way/.test(one.textContent))?.textContent ?? '')
  check('it is at the top of the Inbox', !!row, row.slice(0, 120))
  if (process.env.SHOT) await c.both(`${process.env.SHOT}/services-inbox`)
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
