// Every place in the sidebar says what it is the first time you reach it
// (the user found the Feed had no line): its hint shows under the title, or,
// on an empty page, its example card, which says it there instead.
//   npx electron-vite build --outDir out-ph
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-ph/main/index.js HALIGTREE_QA_AWAY=1 node qa/page-hints-all.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 860 })
const { h, go, v } = c
const WORDS = { feed: 'Your own notes, coming back as a feed.', calendar: 'Your days, with your tasks on them.', sources: 'The people and books your notes cite.', discarded: 'What you moved to the Bin.', archived: 'Notes kept out of sight, never deleted.', lookups: 'Words you looked up.' }
try {
  await v('settings:set', { sounds: false })
  for (const [page, line] of Object.entries(WORDS)) {
    await go(page)
    let seen = false
    for (let i = 0; i < 30 && !seen; i++) (seen = (await h.getByText(line, { exact: false }).count()) > 0 || (await h.evaluate(() => document.documentElement.hasAttribute('data-example-on')))) || (await h.waitForTimeout(200))
    check(`${page} says what it is`, seen)
  }
  check('no page errors', !c.errors.some((one) => one.includes('PAGEERROR')), c.errors.join(' | '))
} catch (error) {
  check('ran', false, error.stack)
} finally {
  await c.close()
}
done()
