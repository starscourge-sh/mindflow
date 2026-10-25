// A link waiting for a note that comes later: a vault brought in in two runs,
// the first linking to pages only in the second ([[Beta]], and [[B side]], an
// alias of Beta's), links to them once the second is in. And a note made by
// hand under a name a link waits for (made named, or named after it is made)
// is what that link points at, without the link being touched.
//
//   npx electron-vite build --outDir out-k
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-k/main/index.js HALIGTREE_QA_AWAY=1 node qa/links-waiting.mjs
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const first = mkdtempSync(join(tmpdir(), 'haligtree-waiting-a-'))
const second = mkdtempSync(join(tmpdir(), 'haligtree-waiting-b-'))
writeFileSync(join(first, 'Alpha.md'), '# Alpha\n\nSee [[Beta]] and [[B side|the other side]].\n')
writeFileSync(join(second, 'Beta.md'), '---\naliases: [B side]\n---\n# Beta\n\nHello from the second run.\n')
process.env.QA_DATA ??= mkdtempSync(join(tmpdir(), 'haligtree-waiting-data-'))
process.env.HALIGTREE_QA_VAULT = first
process.env.HALIGTREE_QA_PICK = second

const { open, checks } = await import('./harness.mjs')
const { check, done } = checks()
const qa = await open()
const doc = (...lines) => ({ type: 'doc', content: lines.map((content) => ({ type: 'paragraph', content })) })
const text = (words) => ({ type: 'text', text: words })
const waiting = (label) => ({ type: 'noteLink', attrs: { id: '', label } })
try {
  let h
  for (let i = 0; i < 100 && !h; i++) {
    h = qa.electron.windows().find((w) => w.url().includes('view=home'))
    if (!h) await qa.page.waitForTimeout(200)
  }
  // Each run is in once its notes are documents.
  const linksOf = (name) => h.evaluate(async (name) => {
    const one = (await window.api.captures.list()).find((row) => row.label === name)
    if (!one || (await window.api.haligtree('imports:pending')).length) return null
    const body = (await window.api.captures.get(one.id))?.body
    if (!body || typeof body !== 'object') return null
    const links = []
    const walk = (node) => {
      if (node?.type === 'noteLink') links.push(node.attrs)
      for (const kid of node?.content ?? []) walk(kid)
    }
    walk(body)
    return links
  }, name)
  const idOf = (name) => h.evaluate(async (name) => (await window.api.captures.list()).find((row) => row.label === name)?.id ?? null, name)
  let before = null
  for (let i = 0; i < 60 && !before; i++) {
    await h.waitForTimeout(1000)
    before = await linksOf('Alpha')
  }
  if (!before) throw new Error('the first run never finished')
  check('after the first run, Alpha\'s two links wait (no id)', before.length === 2 && before.every((one) => !one.id), JSON.stringify(before))

  await h.evaluate(() => window.api.importFrom('vault', null))
  let beta = null
  for (let i = 0; i < 60 && !beta; i++) {
    await h.waitForTimeout(1000)
    beta = await idOf('Beta')
    if (beta && (await h.evaluate(async () => (await window.api.haligtree('imports:pending')).length))) beta = null
  }
  if (!beta) throw new Error('the second run never finished')
  const after = await linksOf('Alpha')
  check('after the second run, [[Beta]] in Alpha points at Beta', after?.find((one) => one.label === 'Beta')?.id === beta, JSON.stringify(after))
  check('and [[B side]], an alias of Beta\'s, does too', after?.find((one) => one.label === 'B side')?.id === beta, JSON.stringify(after))

  // By hand: a note waiting for Gamma and Epsilon; Gamma made named, Epsilon named after it is made.
  await h.evaluate((body) => window.api.captures.create({ body }), doc([text('Delta')], [text('See '), waiting('Gamma'), text(' and '), waiting('Epsilon')]))
  const gamma = await h.evaluate((body) => window.api.captures.create({ body }), doc([text('Gamma')], [text('Made with its name.')]))
  const epsilon = await h.evaluate(() => window.api.captures.create({}))
  await h.evaluate(([id, body]) => window.api.captures.save(id, { body }), [epsilon, doc([text('Epsilon')], [text('Named once made.')])])
  let hand = null
  for (let i = 0; i < 10; i++) {
    await h.waitForTimeout(1000)
    hand = await linksOf('Delta')
    if (hand?.find((one) => one.label === 'Epsilon')?.id) break
  }
  check('a page made with a waiting link\'s name answers it', hand?.find((one) => one.label === 'Gamma')?.id === gamma, JSON.stringify(hand))
  check('a page named after it was made answers its waiting link too', hand?.find((one) => one.label === 'Epsilon')?.id === epsilon, JSON.stringify(hand))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await qa.close().catch(() => undefined)
  try { qa.electron.process().kill('SIGKILL') } catch {}
}
done()
