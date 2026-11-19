// A Markdown or text file previews as words (17 Nov item 40: "docs/mark down files are opened raw as images"): its
// Quick Look shows its headings, lists and code set as a note's, words that can be picked, never a picture of raw text,
// with "Open in its app" and "Import as a note", which brings it in and opens it as a note. QA_SHOTS=dir keeps it.
//   QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/file-words.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 860 })
const { h, v } = c
const shots = process.env.QA_SHOTS
const MD = '# Garden plan\n\nWhat goes in **this spring**:\n\n- tomatoes by the wall\n- beans on the north side\n\n```js\nconst rows = 4\n```\n'
try {
  await v('settings:set', { sounds: false, hintRate: 0, motion: false })
  const src = await h.evaluate((text) => window.api.saveFile('Garden plan.md', new TextEncoder().encode(text)), MD)
  const note = await v('article:new')
  await v('item:save', note, { title: 'Plans', body: { type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'The plan for the garden is in the file below.' }] },
    { type: 'attachment', attrs: { src, name: 'Garden plan.md', size: MD.length } },
    { type: 'paragraph' }
  ] } })
  await c.send('article', note); await h.waitForTimeout(1500)
  await h.locator('[data-attachment-face]').first().click(); await h.waitForTimeout(1500)
  const look = await h.evaluate(() => {
    const words = document.querySelector('[data-file-look-words]')
    return {
      words: !!words,
      picture: !!document.querySelector('[data-file-look-page]'),
      heading: words?.querySelector('h1')?.textContent ?? null,
      items: words?.querySelectorAll('li').length ?? 0,
      code: words?.querySelector('pre')?.textContent ?? null,
      buttons: [...document.querySelectorAll('[data-file-look] button[aria-label]')].map((one) => one.getAttribute('aria-label'))
    }
  })
  check('item 40: a Markdown file previews as words, not a picture', look.words && !look.picture, JSON.stringify(look))
  check('item 40: its heading, list and code set as a note\'s', /Garden plan$/.test(look.heading ?? '') && look.items === 2 && /const rows = 4/.test(look.code ?? ''), JSON.stringify(look))
  check('item 40: with "Import as a note" and "Open in its app"', look.buttons.includes('Import as a note') && look.buttons.includes('Open in its app'), look.buttons.join(', '))
  // Its words can be picked.
  const picked = await h.evaluate(() => { const one = document.querySelector('[data-file-look-words] li'); const range = document.createRange(); range.selectNodeContents(one); getSelection().removeAllRanges(); getSelection().addRange(range); return getSelection().toString() })
  check('item 40: its words can be picked', /tomatoes by the wall/.test(picked), picked)
  if (shots) await c.both(`${shots}/file-words`)
  await h.locator('[data-file-look-as-note]').click(); await h.waitForTimeout(2000)
  // Opened as a note of its own (not the note the file sits in): its own words in an editor, the preview gone.
  const shown = await h.evaluate(() => ({ look: !!document.querySelector('[data-file-look]'), open: [...document.querySelectorAll('[data-open] .ProseMirror, .ProseMirror')].some((one) => one.closest('[data-file-look]') === null && /tomatoes by the wall/.test(one.textContent ?? '')) }))
  check('item 40: "Import as a note" brings it in and opens it', !shown.look && shown.open, JSON.stringify(shown))
} finally {
  await c.close()
}
done()
