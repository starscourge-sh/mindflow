// ⌘K says what it found (the user, 15 Nov 2026, of "faustian": "why is it lying about occurence?"): a word no note has
// lists nothing as a match: a line says so, and the notes found by a close spelling stand under "Close spellings"; a
// word a note has lists that note among the matches, and its preview lights the word where it stands.
//   QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/search-honest.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 860 })
const { h, v } = c
const doc = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
/** ⌘K opened, the words typed, what it shows once it has looked: each island's name and rows, the line above them, the preview's lit words. */
const ask = async (words) => {
  await h.keyboard.press('Escape')
  await h.keyboard.press('Meta+k')
  await h.waitForSelector('[role="dialog"] input', { timeout: 5000 })
  await h.keyboard.type(words, { delay: 25 })
  await h.waitForTimeout(1500)
  return h.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]')
    return {
      none: dialog?.querySelector('[data-search-none]')?.textContent?.trim() ?? '',
      text: dialog?.textContent ?? '',
      lit: [...(dialog?.querySelectorAll('[data-cmdk-panel] .find-and-replace-result') ?? [])].map((one) => one.textContent),
      litNow: dialog?.querySelector('[data-cmdk-panel] .find-and-replace-result-current')?.getBoundingClientRect().top ?? null,
      panel: dialog?.querySelector('[data-cmdk-panel]')?.getBoundingClientRect().bottom ?? null,
      // What the preview holds and its find: to tell a wrong row from a find that never ran.
      seen: ((ed) => ({ row: document.querySelector('[data-search-at]')?.textContent?.slice(0, 60) ?? null, words: ed?.state.doc.textContent.slice(0, 60) ?? null, term: ed?.storage.findAndReplace?.searchTerm ?? null, results: ed?.storage.findAndReplace?.results?.length ?? null }))(dialog?.querySelector('[data-cmdk-panel] .tiptap')?.editor)
    }
  })
}
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  // A note with the word far down, so the preview has to bring it into view.
  const lines = Array.from({ length: 40 }, (_, i) => `Line ${i + 1} of a long note about Goethe and the old legend.`)
  await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), { type: 'doc', content: [...lines.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })), { type: 'paragraph', content: [{ type: 'text', text: 'Faust sells his soul here, at the end.' }] }] })
  await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), doc('A Gaussian curve of the marks this term'))
  await h.waitForTimeout(800)

  const missing = await ask('faustian')
  console.log(`(“faustian”: ${missing.none || 'no line'})`)
  check('a word no note has: a line says so before anything else', /Nothing has “faustian” as you typed it/.test(missing.none), missing.none)
  check('and what a close spelling found stands under "Close spellings", none under a kind of note', /Close spellings/.test(missing.text), missing.text.slice(0, 300))

  const found = await ask('faust')
  console.log(`(“faust”: lit ${JSON.stringify(found.lit)}, the current one at ${found.litNow}, the panel's foot at ${found.panel}; the preview: ${JSON.stringify(found.seen)})`)
  check('a word a note has: no "nothing has" line', !found.none, found.none)
  check('its preview lights the word where it stands', found.lit.some((one) => /faust/i.test(one)), JSON.stringify(found.lit))
  check('and brings it into view, far down a long note', found.litNow !== null && found.panel !== null && found.litNow < found.panel, `${found.litNow} < ${found.panel}`)
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
