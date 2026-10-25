// A note saved as a gem shows once, as the gem, where both would be listed:
// the tag's count and page, and Search. The gem's row says it came from a note.
//   QA_DATA=$(mktemp -d) QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/bit-once.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const c = await sandbox({ width: 1300, height: 900 })
const { h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const doc = (...lines) => ({ type: 'doc', content: lines.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })) })
const create = (body, title) => h.evaluate(([b, t]) => window.api.captures.create({ kind: 'note', body: b, ...(t ? { title: t } : {}) }), [body, title])
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await v('onboarding:set', { pageHints: false })
  const kept = await create(doc('Entry-level onceword job: five years asked', '#oncez #otherz'))
  await create(doc('a plain onceword note #oncez'))
  check('before: the two notes counted', (await v('tags')).find((one) => one.tag === 'oncez')?.count === 2)
  await v('promote', kept)
  const row = (await v('tags')).find((one) => one.tag === 'oncez')
  check('the tag counts the kept note once', row?.count === 2, `${row?.count} / 2`)
  const read = await v('tag:read', 'oncez')
  check('the tag page lists the gem and not its note', read.length === 2 && !read.some((one) => one.id === kept) && read.some((one) => one.type === 'nugget' && one.fromNote === kept), read.map((one) => one.type).join(','))
  const found = await h.evaluate(() => window.api.captures.find('onceword'))
  check('Search lists the gem and not its note', found.length === 2 && !found.some((one) => one.id === kept) && found.some((one) => one.type === 'nugget'), found.map((one) => one.type).join(','))

  await go('tags'); await wait(800)
  await h.evaluate(() => [...document.querySelectorAll('[data-row]')].find((one) => one.textContent.trim().startsWith('oncez'))?.click()); await wait(1500)
  const rows = await h.evaluate(() => [...document.querySelectorAll('article.group\\/entry')].map((one) => one.innerText))
  check('the page shows two rows', rows.length === 2, String(rows.length))
  check('the gem row says it came from a note', rows.some((one) => one.includes('from a note')))
  {
    const gem = rows.find((one) => one.includes('from a note')) ?? ''
    check('its title is shown once', gem.split('Entry-level onceword job').length === 2, JSON.stringify(gem))
    check('its tags are shown once, on the right', gem.split('#otherz').length === 2 && gem.split('otherz').length === 2, JSON.stringify(gem))
  }

  // Home: in "What you opened lately" and the rest, the note stands for its gem, once.
  const gem = read.find((one) => one.fromNote === kept)?.id
  await h.evaluate((id) => window.api.openInHome('capture', id), kept); await wait(1000)
  await h.evaluate((id) => window.api.openInHome('nugget', id), gem); await wait(1000)
  const home = await h.evaluate(() => window.api.haligtree('home'))
  const ids = (list) => list.map((one) => one.id)
  check('Home: the note is in no list', !Object.values(home).some((list) => Array.isArray(list) && ids(list).includes(kept)))
  check('Home: opened lately shows the gem once', ids(home.opened).filter((id) => id === gem).length === 1, JSON.stringify(ids(home.opened).slice(0, 3)))
  check('Home: no list shows the gem twice', Object.values(home).every((list) => !Array.isArray(list) || ids(list).filter((id) => id === gem).length <= 1))
} finally {
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
