// A vault note's front-matter tags come in once, as real #tags, and its
// aliases as other names for it: neither again as a plain property. A note
// imported before keeps a plain "tags" property only while one of its tags is
// not a real tag on it; 'properties:drop-duplicate-tags' takes the rest.
//
//   npx electron-vite build --outDir out-h
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-h/main/index.js HALIGTREE_QA_AWAY=1 node qa/vault-front-tags.mjs
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const vault = mkdtempSync(join(tmpdir(), 'haligtree-front-tags-'))
writeFileSync(join(vault, 'Phrase Patterns.md'), '---\ntags: [youtube, writing, patterns]\naliases:\n  - PP\nsource: a notebook\n---\n# Phrase Patterns\n\nSay it plainly.\n')
writeFileSync(join(vault, 'Other.md'), '# Other\n\nHello.\n')
process.env.QA_DATA ??= mkdtempSync(join(tmpdir(), 'haligtree-front-tags-data-'))
process.env.HALIGTREE_QA_VAULT = vault

const { open, checks } = await import('./harness.mjs')
const { check, done } = checks()
const qa = await open()
try {
  let h
  for (let i = 0; i < 100 && !h; i++) {
    h = qa.electron.windows().find((w) => w.url().includes('view=home'))
    if (!h) await qa.page.waitForTimeout(200)
  }
  const v = (channel, ...args) => h.evaluate(([c, a]) => window.api.haligtree(c, ...a), [channel, args])
  let id = null
  for (let i = 0; i < 120 && !id; i++) {
    await h.waitForTimeout(1000)
    id = await h.evaluate(async () => (await window.api.captures.list()).find((row) => /Phrase Patterns/.test(row.label ?? ''))?.id ?? null)
  }
  if (!id) throw new Error('the note never came in')
  const fields = await v('notes:fields', 'captures', id)
  const full = await h.evaluate((one) => window.api.captures.get(one), id)
  check('its tags are real #tags', ['youtube', 'writing', 'patterns'].every((tag) => JSON.stringify(full.body).includes(`#${tag}`)))
  check('no plain "tags" property', !('tags' in fields), JSON.stringify(fields))
  check('no plain "aliases" property', !('aliases' in fields), JSON.stringify(fields))
  check('its other properties stay', fields.source === 'a notebook', JSON.stringify(fields))
  check('its alias is another name for it', (await v('aliases', 'captures', id)).includes('PP'))

  // Its Properties' tag chip is a way to the tag's page.
  await qa.electron.evaluate(({ BrowserWindow }, one) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('view=home'))?.webContents.send('home:open', 'capture', one), id)
  await h.waitForTimeout(1500)
  if (!(await h.locator('[data-tag-open="youtube"]').count())) await h.locator('[data-properties-head]').first().click().catch(() => undefined)
  await h.waitForTimeout(300)
  const chip = h.locator('[data-tag-open="youtube"]').first()
  check('the Properties row shows the tag chip', await chip.count() === 1)
  await chip.click()
  await h.waitForTimeout(1200)
  check('a click on it opens the tag\'s page', await h.evaluate(() => !document.querySelector('[data-tag-open]') && /#youtube/.test(document.body.innerText)))

  // As imported before: a plain "tags" again, all of them real tags; and another note whose "tags" names one it does not carry.
  await v('notes:fields:set', 'captures', id, 'tags', 'youtube, writing, patterns')
  const other = await h.evaluate(async () => (await window.api.captures.list()).find((row) => /Other/.test(row.label ?? ''))?.id)
  await v('notes:fields:set', 'captures', other, 'tags', 'missing')
  check('set up: both have a plain "tags"', 'tags' in (await v('notes:fields', 'captures', id)) && 'tags' in (await v('notes:fields', 'captures', other)))
  const count = await v('properties:drop-duplicate-tags')
  check('the cleanup takes one', count === 1, `took ${count}`)
  check('gone where every tag is real', !('tags' in (await v('notes:fields', 'captures', id))))
  check('kept where one is not', (await v('notes:fields', 'captures', other)).tags === 'missing')
  check('run again, it takes none', (await v('properties:drop-duplicate-tags')) === 0)
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await qa.close().catch(() => undefined)
  try { qa.electron.process().kill('SIGKILL') } catch {}
}
done()
