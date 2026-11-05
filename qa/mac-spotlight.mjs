// Your notes in Spotlight (Core Spotlight, every Mac): a note is put in the Mac's own index and found
// there by a word in it; a private note never is; Settings' switch off takes every note out. Indexes
// only with HALIGTREE_QA_SPOTLIGHT=1 (this probe sets it), and takes every item out at the end.
// Opening a note chosen in Spotlight (continue-activity) needs the installed app: not driven here.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/mac-spotlight.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

process.env.HALIGTREE_QA_SPOTLIGHT = '1'
const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 800 })
const { h, electron, v } = c
const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const find = async (word, want, tries = 40) => {
  let ids = []
  for (let i = 0; i < tries; i++) {
    ids = await electron.evaluate((_, word) => globalThis.spotlight.find(word), word)
    if (want(ids)) return ids
    await h.waitForTimeout(500)
  }
  return ids
}
try {
  const open = await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), { type: 'doc', content: [para('A quokkaharbour walk along the cliffs')] })
  const hidden = await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), { type: 'doc', content: [para('My quokkaharbour diary #bit')] })
  const sent = await electron.evaluate(() => globalThis.spotlight.sync())
  check('every note is handed to Spotlight', sent > 10, sent)
  const ids = await find('quokkaharbour', (ids) => ids.includes(`capture:${open}`))
  check('Spotlight finds the note by a word in it', ids.includes(`capture:${open}`), ids.join(', '))
  check('a #bit note is never in Spotlight', !ids.includes(`capture:${hidden}`))
  await v('settings:set', { spotlight: false })
  const after = await find('quokkaharbour', (ids) => !ids.length, 30)
  check('Settings’ switch off takes every note out', after.length === 0, after.join(', '))
  await c.go('settings')
  await h.evaluate(() => document.querySelector('[data-section="What comes back to you"]')?.click())
  await h.waitForTimeout(600)
  const row = await h.evaluate(() => [...document.querySelectorAll('[data-setting]')].find((one) => /Your notes in Spotlight/.test(one.textContent))?.textContent ?? '')
  check('Settings has “Your notes in Spotlight”, saying what it does', /⌘Space finds your notes/.test(row), row.slice(0, 120))
  if (process.env.SHOT) {
    await h.evaluate(() => [...document.querySelectorAll('[data-setting]')].find((one) => /Your notes in Spotlight/.test(one.textContent))?.scrollIntoView({ block: 'center' }))
    await c.both(`${process.env.SHOT}/spotlight-setting`)
  }
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally {
  await electron.evaluate(() => globalThis.spotlight?.clear()).catch(() => {})
  await c.close()
}
done()
