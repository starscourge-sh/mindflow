// A sidebar set up before every page showed gets them all, once: its order
// kept, and a page hidden after that stays hidden. Needs QA_DATA (a temp folder).
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { open } from './harness.mjs'

const DATA = process.env.QA_DATA
let fails = 0
let n = 0
const check = (what, ok, more = '') => (n++, ok || fails++, console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${more ? `  (${more})` : ''}`))
const run = async (fn) => {
  const qa = await open()
  try {
    await qa.page.waitForTimeout(2500)
    return await fn((channel, ...args) => qa.page.evaluate(([c, a]) => window.api.vigil(c, ...a), [channel, args]))
  } finally { await qa.close() }
}
const file = () => join(DATA, 'mindflow.db')

// A fresh start is a new book, whose sidebar grows with it (sidebar-first); an older book shows every page (24 and up, as pages are added).
await run(async (v) => { const s = await v('settings'); check('a fresh start is a new book, its sidebar growing', s.sidebarGrows === true && s.sidebarShown.length < 24, String(s.sidebarShown.length)) })
const db = new DatabaseSync(file())
db.exec(`insert or replace into settings (key, value) values ('sidebarShown', '["inbox","today"]'), ('sidebarOrder', '["today","inbox"]'), ('sidebarGrows', 'false'); delete from settings where key = 'sidebarAllOnce'`)
const every = 24
db.close()
await run(async (v) => {
  const s = await v('settings')
  check('an older sidebar gets every page, once', s.sidebarShown.length >= every, `${s.sidebarShown.length} of ${every}`)
  check('its order is kept', JSON.stringify(s.sidebarOrder) === '["today","inbox"]', JSON.stringify(s.sidebarOrder))
  await v('settings:set', { sidebarShown: ['inbox'] })
})
await run(async (v) => check('hidden after that, it stays hidden', JSON.stringify((await v('settings')).sidebarShown) === '["inbox"]'))
console.log(`${n - fails}/${n} passed`)
process.exit(fails ? 1 : 0)
