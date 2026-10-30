// Opening a note from a list plays one sound: its page turn, never a click on top (counted as sounds started, the
// test run itself is muted). Gems, Writing and the Inbox, a row clicked as a person would. Every sound counted by name
// (window.haligtreeHeard), the drawn ones too. Run it on the built app and on a development build, where StrictMode
// makes every editor and effect twice as `npm run dev` does:
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/one-sound-open.mjs
//   npx electron-vite build --config electron.vite.dev-qa.config.ts --outDir out-dev
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-dev/main/index.js HALIGTREE_QA_AWAY=1 node qa/one-sound-open.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, v } = c
try {
  await v('settings:set', { sounds: true, hintRate: 0 })
  await h.evaluate(() => {
    window.__sounds = []
    const start = AudioBufferSourceNode.prototype.start
    AudioBufferSourceNode.prototype.start = function (...args) { window.__sounds.push(Math.round(performance.now())); return start.apply(this, args) }
    const play = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function (...args) { window.__sounds.push(Math.round(performance.now())); return play.apply(this, args) }
  })
  for (const page of ['nuggets', 'articles', 'inbox']) {
    await c.go(page); await h.waitForTimeout(1500)
    for (const n of [1, 3]) {
      const row = h.locator('[data-row]').nth(n)
      await row.scrollIntoViewIfNeeded(); await h.waitForTimeout(300)
      await h.evaluate(() => { window.__sounds = []; window.haligtreeHeard.length = 0 })
      await row.click({ delay: 70 })
      await h.waitForTimeout(900)
      const heard = await h.evaluate(() => [...window.haligtreeHeard])
      check(`${page} row ${n}: one sound on open`, heard.length === 1, JSON.stringify(heard))
    }
  }
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
done()
