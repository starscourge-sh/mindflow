// Notes' structure (b23 wave 2), in the sandbox: the Properties block sits
// under the title and before the words (an article's too, whose title is kept
// apart), rows carry an icon, the name and the value, tags are one row of
// chips whose x takes the tag out of the words, created and updated show
// read-only, the block folds shut, and an empty note shows only "Add property".
//
//   npx electron-vite build --outDir out-w2
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-w2/main/index.js HALIGTREE_QA_AWAY=1 node qa/b23-wave2.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const c = await sandbox({ width: 1200, height: 820 })
const { h, v, send, go } = c
const { check, done } = checks()
const wait = (ms = 400) => h.waitForTimeout(ms)
const strip = '[data-property-strip]'
const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })

try {
  await v('settings:set', { safeMode: false, hintRate: 0, rotCount: 0, motion: false })
  for (let i = 0; i < 60 && (await h.evaluate(() => document.body.innerText.includes('Setting out the examples'))); i++) await wait(500)

  // A note with a #book tag: the block, under its title.
  const made = await h.evaluate((doc) => window.api.captures.create({ kind: 'note', body: doc }), { type: 'doc', content: [para('The Dispossessed'), para('An ambiguous utopia #book #zqtag')] })
  await go('captures')
  await send('capture', made)
  await wait(1500)
  const shape = () => h.evaluate((sel) => {
    const box = document.querySelector(sel)
    const page = box?.closest('.tiptap.ProseMirror')
    if (!box || !page) return null
    const lines = [...page.children].filter((one) => !one.classList.contains('mf-property-holder'))
    return { top: box.getBoundingClientRect().top, bottom: box.getBoundingClientRect().bottom, first: lines[0]?.getBoundingClientRect().top, second: lines[1]?.getBoundingClientRect().top, text: box.textContent, head: !!box.querySelector('[data-properties-head]'), tags: [...box.querySelectorAll('[data-tag-chip]')].map((one) => one.getAttribute('data-tag-chip')), icons: box.querySelectorAll('[data-property] svg, .lucide').length }
  }, strip)
  const one = await shape()
  check('note: a "Properties" block between its title and its words', !!one && one.head && one.top >= one.first && one.bottom <= one.second + 1, JSON.stringify(one))
  check('note: tags are one row of chips', !!one && one.tags.includes('book') && one.tags.includes('zqtag'), one?.tags)
  check('note: created and updated show', /created/.test(one?.text ?? '') && /updated/.test(one?.text ?? ''), one?.text)
  check('note: rows carry icons', (one?.icons ?? 0) >= 3, one?.icons)

  // The chip's x takes the tag out of the words.
  await h.locator('[aria-label="Remove #zqtag"]').click()
  await wait(900)
  const words = await h.evaluate((sel) => document.querySelector(sel)?.closest('.tiptap.ProseMirror')?.textContent ?? '', strip)
  check('x on a tag takes it out of the words', !words.includes('#zqtag') && words.includes('#book'), words.slice(0, 80))
  const chips = await h.evaluate(() => [...document.querySelectorAll('[data-tag-chip]')].map((one) => one.getAttribute('data-tag-chip')))
  check('and its chip goes', !chips.includes('zqtag'), chips)

  // Folded shut and open again.
  await h.locator('[data-properties-head]').click()
  await wait(300)
  check('the block folds shut', (await h.locator(`${strip} [data-property="created"]`).count()) === 0)
  await h.locator('[data-properties-head]').click()
  await wait(300)
  check('and opens again', (await h.locator(`${strip} [data-property="created"]`).count()) === 1)

  // Name:: value moves into the block.
  await h.evaluate((sel) => {
    const page = document.querySelector(sel).closest('.tiptap.ProseMirror')
    const last = [...page.children].filter((el) => el.tagName === 'P').at(-1)
    page.focus()
    const range = document.createRange()
    range.selectNodeContents(last)
    range.collapse(false)
    getSelection().removeAllRanges()
    getSelection().addRange(range)
  }, strip)
  await h.keyboard.press('Enter')
  await h.keyboard.type('Author:: Ursula Le Guin', { delay: 10 })
  await h.keyboard.press('Enter')
  await wait(900)
  check('Name:: value becomes a row in the block', /Author\s*Ursula Le Guin/.test((await h.locator(strip).textContent()) ?? ''))

  // An empty note: just "Add property".
  const bare = await h.evaluate((doc) => window.api.captures.create({ kind: 'note', body: doc }), { type: 'doc', content: [para('Bare title'), para('Nothing else here')] })
  await send('capture', bare)
  await wait(1500)
  const quiet = await h.evaluate((sel) => { const box = document.querySelector(sel); return box ? { head: !!box.querySelector('[data-properties-head]'), add: !!box.querySelector('[data-add-property]') } : null }, strip)
  check('empty note: only "Add property", no heading', !!quiet && !quiet.head && quiet.add, JSON.stringify(quiet))

  // An article: its title is its own box, so the block opens the words.
  const article = await v('article:new')
  await v('item:save', article, { title: 'An article with a title', body: { type: 'doc', content: [para('The first line of the body #book'), para('The second line')] } })
  await go('articles')
  await send('article', article)
  await wait(1800)
  const art = await shape()
  check('article: the block sits before the first line of the words', !!art && art.bottom <= art.first + 1, JSON.stringify(art))
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error))
} finally {
  await c.close()
}
done()
