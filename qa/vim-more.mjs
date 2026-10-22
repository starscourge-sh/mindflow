/**
 * The vim keys added after the text objects: is as (sentences), * and # (the
 * word under the cursor, whole, so n and N carry on), % (the matching
 * bracket, as a motion too), X, ge and gE, dgg, gv after an edit, and zz. Then
 * the older keys once over, so nothing they share broke.
 *
 *   npx electron-vite build --outDir out-vim
 *   QA_DATA=$(mktemp -d) QA_ENTRY=out-vim/main/index.js HALIGTREE_QA_AWAY=1 node qa/vim-more.mjs
 */
import { open } from './harness.mjs'

const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const qa = await open()
const { page } = qa
const results = []
const check = (ok, what) => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`))

await page.evaluate(() => {
  localStorage.setItem('vim', 'on')
  window.dispatchEvent(new StorageEvent('storage', { key: 'vim', newValue: 'on' }))
})
await page.waitForTimeout(300)

const text = () => page.$eval(EDITOR, (el) => el.editor.getText({ blockSeparator: '|' }))
/** The cursor, as an offset into the first block's text. */
const at = () => page.$eval(EDITOR, (el) => el.editor.state.selection.head - 1)
const keys = async (list) => {
  for (const key of list) await page.keyboard.press(key)
  await page.waitForTimeout(150)
}
/** Some HTML, the cursor on the nth character of its first block, in normal mode. */
async function load(html, offset) {
  await qa.reset()
  await page.$eval(EDITOR, (el, html) => el.editor.commands.setContent(html), html)
  await page.$eval(EDITOR, (el) => el.focus())
  await page.keyboard.press('Escape')
  await page.$eval(EDITOR, (el, offset) => el.editor.commands.setTextSelection(1 + offset), offset)
  await page.waitForTimeout(80)
}
async function run(line, offset, list) {
  await load(line.startsWith('<') ? line : `<p>${line}</p>`, offset)
  await keys(list)
  return text()
}
const expect = async (line, offset, list, want) => {
  const got = await run(line, offset, list)
  check(got === want, `${list.join('')} on ${JSON.stringify(line)} at ${offset} → ${JSON.stringify(got)}`)
}

// --- sentences ---
const S = 'One here. Two there! Three?'
await expect(S, 12, ['d', 'i', 's'], 'One here.  Three?')
await expect(S, 12, ['d', 'a', 's'], 'One here. Three?')
await expect(S, 0, ['d', 'a', 's'], 'Two there! Three?')
await expect(S, 23, ['d', 'a', 's'], 'One here. Two there!')
await expect('He said "go." Then left.', 3, ['d', 'a', 's'], 'Then left.')
await expect(S, 12, ['g', 'U', 'i', 's'], 'One here. TWO THERE! Three?')
await expect(S, 12, ['v', 'i', 's', 'd'], 'One here.  Three?')
await expect(S, 12, ['c', 'i', 's', 'N', 'o', 'w', '.'], 'One here. Now. Three?')
await expect(S, 12, ['y', 'a', 's', '$', 'p'], 'One here. Two there! Three?Two there! ')
await expect('<p>First one. Still first</p><p>Second block.</p>', 14, ['d', 'a', 's'], 'First one.|Second block.')

// --- * and # ---
const W = 'cat dog cat category cat'
await load(`<p>${W}</p>`, 0)
const hasSearch = await page.$eval(EDITOR, (el) => !!el.editor.storage.findAndReplace)
check(hasSearch, 'the note has the search * uses')
await keys(['*'])
check((await at()) === 8, `* lands on the next whole "cat" (8) → ${await at()}`)
check(await page.$eval(EDITOR, (el) => el.editor.storage.findAndReplace.searchTerm === 'cat' && el.editor.storage.findAndReplace.wholeWord), '* searches "cat", whole word')
check(await page.$eval(EDITOR, (el) => el.editor.state.selection.empty), '* leaves a cursor, not a selection')
await keys(['n'])
check((await at()) === 21, `n carries on past "category" (21) → ${await at()}`)
await keys(['n'])
check((await at()) === 0, `n wraps to the top (0) → ${await at()}`)
await keys(['N'])
check((await at()) === 21, `N goes back round (21) → ${await at()}`)
await keys(['Escape'])
check(await page.$eval(EDITOR, (el) => el.editor.storage.findAndReplace.searchTerm === '' && !el.editor.storage.findAndReplace.wholeWord), 'Escape clears what * lit, and whole word with it')
await load(`<p>${W}</p>`, 0)
await keys(['#'])
check((await at()) === 21, `# from the first goes round to the last (21) → ${await at()}`)
await load(`<p>${W}</p>`, 0)
await keys(['2', '*'])
check((await at()) === 21, `2* skips one (21) → ${await at()}`)
await load(`<p>${W}</p>`, 22)
await keys(['#'])
check((await at()) === 8, `# from the last finds the one before (8) → ${await at()}`)

// --- % ---
await load('<p>call(a, [b]) end</p>', 0)
await keys(['%'])
check((await at()) === 11, `% from before the bracket lands on its match (11) → ${await at()}`)
await keys(['%'])
check((await at()) === 4, `% again goes back (4) → ${await at()}`)
await load('<p>call(a, [b]) end</p>', 8)
await keys(['%'])
check((await at()) === 10, `% on [ → ] (10) → ${await at()}`)
await expect('call(a, [b]) end', 4, ['d', '%'], 'call end')
await expect('call(a, [b]) end', 11, ['d', '%'], 'call end')
await expect('no brackets here', 3, ['d', '%'], 'no brackets here')

// --- X ---
await expect('abcdef', 4, ['X'], 'abcef')
await expect('abcdef', 4, ['3', 'X'], 'aef')
await expect('abcdef', 2, ['9', 'X'], 'cdef')
await expect('abcdef', 0, ['X'], 'abcdef')
await expect('abcdef', 3, ['X', 'p'], 'abdcef')

// --- ge, gE, dgg ---
await load('<p>one two three</p>', 8)
await keys(['g', 'e'])
check((await at()) === 6, `ge to the end of "two" (6) → ${await at()}`)
await load('<p>one two three</p>', 8)
await keys(['2', 'g', 'e'])
check((await at()) === 2, `2ge to the end of "one" (2) → ${await at()}`)
await load('<p>a.b c.d</p>', 6)
await keys(['g', 'E'])
check((await at()) === 2, `gE treats a.b as one (2) → ${await at()}`)
await expect('one two three', 8, ['d', 'g', 'e'], 'one twhree')
await expect('<p>a</p><p>b</p><p>c</p>', 0, ['j', 'd', 'g', 'g'], 'c')

// --- gv ---
await load('<p>hello world</p>', 6)
await keys(['v', 'e', 'Escape', '0', 'i', 'A', 'B', 'Escape', 'g', 'v', 'd'])
check((await text()) === 'ABhello ', `gv reselects "world" after typing before it → ${JSON.stringify(await text())}`)
await load('<p>hello world</p>', 6)
await keys(['v', 'e', 'y', '0', 'g', 'v', 'U'])
check((await text()) === 'hello WORLD', `gv after a visual yank → ${JSON.stringify(await text())}`)
await load('<p>hello world</p>', 6)
await keys(['v', 'e', 'd', 'g', 'v'])
check(await page.$eval(EDITOR, (el) => el.getAttribute('data-vim-mode') === 'normal'), 'gv after the words are deleted stays in normal mode')

// --- zz ---
await load(Array.from({ length: 200 }, (_, i) => `<p>Line ${i + 1} of a long note.</p>`).join(''), 0)
await keys(['1', '2', '0', 'G'])
// The line up at the top edge, well away from the middle.
await page.$eval(EDITOR, (el) => {
  let box = el
  while (box && !(/(auto|scroll)/.test(getComputedStyle(box).overflowY) && box.scrollHeight > box.clientHeight)) box = box.parentElement
  const caret = el.editor.view.coordsAtPos(el.editor.state.selection.head)
  box.scrollTop += caret.top - box.getBoundingClientRect().top - 8
})
const middle = () =>
  page.$eval(EDITOR, (el) => {
    let box = el
    while (box && !(/(auto|scroll)/.test(getComputedStyle(box).overflowY) && box.scrollHeight > box.clientHeight)) box = box.parentElement
    if (!box) return null
    const frame = box.getBoundingClientRect()
    const caret = el.editor.view.coordsAtPos(el.editor.state.selection.head)
    return { off: Math.abs((caret.top + caret.bottom) / 2 - (frame.top + frame.height / 2)) }
  })
const before = await middle()
check(before && before.off > 40, `the cursor starts away from the middle (${before?.off?.toFixed(0)}px)`)
await keys(['z', 'z'])
const after = await middle()
check(after && after.off < 20, `zz puts it in the middle (${after?.off?.toFixed(0)}px off)`)
check((await page.$eval(EDITOR, (el) => el.getAttribute('data-vim-mode'))) === 'normal', 'zz leaves normal mode as it was')

// --- the older keys, once over ---
await expect('one two three', 4, ['d', 'w'], 'one three')
await expect('one two three', 4, ['c', 'w', 'X', 'Escape'], 'one X three')
await expect('one two three', 4, ['d', 'e'], 'one  three')
await expect('one two three', 4, ['d', 'E'], 'one  three')
await expect('one two three', 4, ['d', 'b'], 'two three')
await expect('one two three', 4, ['d', '$'], 'one ')
await expect('one two three', 4, ['x'], 'one wo three')
await expect('one two three', 4, ['d', 't', 'h'], 'one hree')
await expect('one two three', 4, ['g', 'U', 'i', 'w'], 'one TWO three')
await expect('one two three', 4, ['d', 'i', 'w'], 'one  three')
await expect('<p>a</p><p>b</p><p>c</p>', 0, ['d', 'd'], 'b|c')
await expect('<p>a</p><p>b</p><p>c</p>', 0, ['y', 'y', 'p'], 'a|a|b|c')
await expect('<p>a</p><p>b</p><p>c</p>', 0, ['J'], 'a b|c')
await expect('<p>a</p><p>b</p><p>c</p>', 0, ['G', 'd', 'd', 'g', 'g', 'd', 'd'], 'b')
// A moment after loading, or undo takes the loading back with the x.
await load('<p>one two three</p>', 4)
await page.waitForTimeout(700)
await keys(['x', 'u'])
check((await text()) === 'one two three', `xu puts the letter back → ${JSON.stringify(await text())}`)
await expect('one two three', 4, ['v', 'e', 'd'], 'one  three')
await expect('(a) b', 1, ['d', 'i', '('], '() b')

console.log(`${results.filter(Boolean).length}/${results.length} passed`)
await qa.close?.()
process.exit(results.every(Boolean) ? 0 : 1)
