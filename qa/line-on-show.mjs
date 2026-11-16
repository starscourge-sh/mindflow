/**
 * A line of a note's words that is on show, to press as a person presses what they see: the first letter of a line
 * of words in a block of the kind asked for (`only`, read against the block's tag), whole or not, since one long list
 * can fill the screen by itself (a long note opens where it was last left, lib/note-place.ts), the letter well inside
 * the note's scroller (60px from its top and bottom) and nothing lying over it. `min`: the fewest letters the block
 * holds. `skip`: how many such lines to pass over first, one a block.
 *
 * Runs in the page: hand it to a probe's `page(target, lineOnShow, options)` with the note's editor element. Returns
 * { x, y, index, words } (`index`: the block, as its place in the note), or { none } saying what was on the screen.
 * Used by qa/long-note-safe.mjs and qa/whole-note-paste.mjs.
 */
export function lineOnShow(ed, { min = 3, only = '^(P|H[1-6]|UL|OL|BLOCKQUOTE)$', skip = 0 } = {}) {
  let box = ed.parentElement
  while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement
  const view = box.getBoundingClientRect()
  const wanted = new RegExp(only)
  let seen = 0
  const said = { blocks: ed.children.length, kind: 0, onShow: 0, clear: 0, under: '', seen: [] }
  // What is on the screen, of any kind: for the line that says why no line was pressed.
  for (const el of ed.children) {
    const r = el.getBoundingClientRect()
    if (r.height && r.bottom > view.top && r.top < view.bottom && said.seen.length < 6) said.seen.push(`${el.tagName}${el.hasAttribute('data-off') ? ' off' : ''} ${Math.round(r.top - view.top)}..${Math.round(r.bottom - view.top)} "${el.textContent.trim().slice(0, 16)}"`)
  }
  said.scroller = `${box.tagName}.${String(box.className).slice(0, 40)} at ${Math.round(box.scrollTop)} of ${box.scrollHeight - box.clientHeight}, ${Math.round(view.height)} tall`
  for (const el of ed.children) {
    if (!wanted.test(el.tagName) || el.hasAttribute('data-off') || el.textContent.trim().length < min) continue
    said.kind++
    const r = el.getBoundingClientRect()
    if (!r.height || r.bottom < view.top + 60 || r.top > view.bottom - 60) continue
    said.onShow++
    // Its own words: not what is drawn beside them (a heading's "H2" mark, a button), which takes no caret.
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (node) => (node.textContent.trim().length >= Math.min(min, 3) && !node.parentElement.closest('[contenteditable="false"], button, summary') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP) })
    for (let text = walk.nextNode(); text; text = walk.nextNode()) {
      const range = document.createRange()
      const start = text.textContent.search(/\S/)
      range.setStart(text, start)
      range.setEnd(text, start + 1)
      const letter = range.getBoundingClientRect()
      if (!letter.height || letter.top < view.top + 60 || letter.bottom > view.bottom - 60) continue
      const [x, y] = [Math.round(letter.left + Math.min(2, letter.width / 3)), Math.round(letter.top + letter.height / 2)]
      const hit = document.elementFromPoint(x, y)
      if (!hit || !el.contains(hit)) { said.under ||= hit ? `${hit.tagName}.${String(hit.className).slice(0, 60)}` : 'nothing'; continue }
      said.clear++
      if (seen++ < skip) break
      return { x, y, index: ed.editor.state.doc.resolve(ed.editor.view.posAtDOM(el, 0)).index(0), words: text.textContent.trim().slice(0, 40) }
    }
  }
  return { none: said }
}
