// A person Wikipedia knows under another title: "Napoleon Bonaparte" is sent on to the page
// "Napoleon". Its line about them is kept, as its picture is, because Wikipedia itself redirected
// that very name. A page of another name with no redirect ("Napoleon III" for "Boney") never counts.
//
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_SHOTS=<dir> node qa/wiki-redirect.mjs
import { createServer } from 'node:http'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const napoleon = { type: 'standard', title: 'Napoleon', description: 'French emperor (1769–1821)', extract: 'Napoleon Bonaparte was a French military officer and statesman. He led France through a run of wars. He died on Saint Helena.', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Napoleon' } } }
const server = createServer((req, res) => {
  res.setHeader('content-type', 'application/json')
  // Wikipedia's REST summary answers a redirect title with a 302 to the page it names.
  if (req.url.startsWith('/wiki/Napoleon_Bonaparte')) return (res.statusCode = 302, res.setHeader('location', '/wiki/Napoleon?redirect=true'), res.end())
  if (req.url.startsWith('/wiki/Napoleon?') || req.url === '/wiki/Napoleon') return res.end(JSON.stringify(napoleon))
  // Asked "Boney", answered with a page of another name and no redirect: not theirs.
  if (req.url.startsWith('/wiki/Boney')) return res.end(JSON.stringify({ ...napoleon, title: 'Napoleon III' }))
  res.statusCode = 404
  res.end('{}')
})
await new Promise((done) => server.listen(0, '127.0.0.1', done))
process.env.HALIGTREE_QA_WIKI = `http://127.0.0.1:${server.address().port}/wiki/`

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, errors } = c
const shots = process.env.QA_SHOTS
const shot = (name) => shots && h.screenshot({ path: `${shots}/${name}.png` }).catch(() => {})
const wait = (ms) => h.waitForTimeout(ms)
const doc = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const make = (patch) => h.evaluate((p) => window.api.captures.create(p), patch)
const openPage = async (field, name) => { await h.evaluate((d) => window.dispatchEvent(new CustomEvent('haligtree:source', { detail: d })), `${field}:${name}`); await wait(1500) }

try {
  await make({ kind: 'quote', body: doc('Impossible is a word found only in the dictionary of fools.'), attribution: 'Napoleon Bonaparte' })
  await make({ kind: 'quote', body: doc('A made-up line.'), attribution: 'Boney' })
  await openPage('attribution', 'Napoleon Bonaparte')
  await h.locator('[data-bio-text]').first().waitFor({ timeout: 4000 }).catch(() => {})
  await shot('napoleon')
  const line = await h.locator('[data-bio-text]').inputValue().catch(() => 'none')
  check('1. "Napoleon Bonaparte", redirected to "Napoleon", keeps its line', line.startsWith('Napoleon Bonaparte was a French military officer'), line)
  check('2. credited with the page it landed on', (await h.locator('[data-bio-credit]').getAttribute('href').catch(() => '')) === 'https://en.wikipedia.org/wiki/Napoleon')
  await openPage('attribution', 'Boney')
  await wait(800)
  check('3. a page of another name, not a redirect, is not theirs: no line', await h.locator('[data-bio-text]').count() === 0, await h.locator('[data-bio-text]').inputValue().catch(() => ''))
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await c.close()
  server.closeAllConnections?.()
  server.close()
}
done()
