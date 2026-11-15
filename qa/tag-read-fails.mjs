// A read that fails is said, never waited on without end (the user, 15 Nov 2026: "why is this hanging?", a tag's page
// left on "Gathering #one-liner…"). A tag whose notes cannot be read says why where its notes would be, with "Try
// again", which brings them; a page's list that cannot be read (useLive) says so in a notice with "Try again".
//   QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/tag-read-fails.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 860 })
const { h, v, send, go, electron } = c
// The next `times` asks of a channel fail as a busy book would; then it answers as ever.
const failNext = (channel, times) => electron.evaluate(({ ipcMain }, [channel, times]) => {
  const all = ipcMain._invokeHandlers
  const real = all?.get(`haligtree:${channel}`)
  if (!real) return false
  let left = times
  all.set(`haligtree:${channel}`, async (...args) => {
    if (left-- > 0) throw new Error('database is locked')
    return real(...args)
  })
  return true
}, [channel, times])
const gathering = () => h.evaluate(() => [...document.querySelectorAll('[aria-busy]')].some((one) => /Gathering #/.test(one.textContent ?? '')))
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const tag = (await v('tags')).find((one) => one.count > 0)?.tag
  check('the sandbox has a tag with notes', !!tag)
  check('a read can be made to fail', await failNext('tag:read', 1))
  await send('tag', tag)
  const said = await h.waitForFunction((tag) => [...document.querySelectorAll('[data-empty]')].some((one) => one.textContent.includes(`#${tag} could not be read`)), tag, { timeout: 8000 }).then(() => true, () => false)
  const words = await h.evaluate(() => document.querySelector('[data-empty]')?.textContent ?? '')
  check('a tag that cannot be read says so and why, where its notes would be', said && /busy for a moment/.test(words), words.slice(0, 160))
  check('and no "Gathering" left waiting', !(await gathering()))
  check('its words never say "Try again" beside a "Try again" button', !/try again/i.test(words.replace(/Try again$/, '')), words.slice(0, 160))
  await h.locator('[data-read-again]').first().click()
  const back = await h.waitForSelector('[data-tag-page]', { timeout: 8000 }).then(() => true, () => false)
  check('"Try again" brings the tag\'s notes', back && !(await gathering()))

  // A page's list (useLive) whose first read fails: the window read afresh, its first ask for the tasks failing.
  check('a list read can be made to fail', await failNext('tasks', 1))
  await h.reload()
  const notice = await h.waitForFunction(() => /could not be read/.test(document.body.innerText), null, { timeout: 15000 }).then(() => true, () => false)
  const line = await h.evaluate(() => document.body.innerText.split('\n').find((one) => /could not be read/.test(one)) ?? '')
  check('a list that cannot be read says so, and why, in a notice', notice && /busy for a moment/.test(line), line.slice(0, 160))
  const again = h.getByRole('button', { name: 'Try again' }).first()
  check('the notice has "Try again"', (await again.count()) > 0)
  if (await again.count()) await again.click()
  await h.waitForTimeout(1500)
  check('"Try again" reads it: the notice goes', !(await h.evaluate(() => /could not be read/.test(document.body.innerText))))
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
