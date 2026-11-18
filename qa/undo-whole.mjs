// Undo puts a note back exactly as it was, and Redo exactly as it was after: the note's JSON compared block by
// block, character for character and mark for mark, after ⌘Z, ⇧⌘Z and ⌘Z again.
//   big    the 3,100-block note (qa/long-note-doc.mjs): words typed, then the whole note deleted (⌘A, ⌫) straight
//          after, after a copy, and after a pause.
//   every  a note with every kind of block (emoji, links, dates, code, a table, a callout, a picture, columns): a cut,
//          a paste over a selection, a block deleted from its menu, a block carried, “Replace all”, the whole deleted.
// Real keys and the pointer; a cut, a copy and a paste are clipboard events carrying their own data, never the Mac's
// clipboard. QA_ONLY=big or every runs one part.
//   QA_ARGS=--sandbox QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/undo-whole.mjs
// QA_TRACE=1 also prints every change each step set off: who made it (the key's own change, or the plugin that added
// one), its steps, and how many Undo steps the note then had.
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
import { bigDoc, card, code, link, p, pic, t, table } from './long-note-doc.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1440, height: 900 })
const { h, v } = c
const ED = '[data-open] .tiptap'
const TRACE = !!process.env.QA_TRACE

/** In the page: a log of every change, with who made it, and the note as JSON to compare. */
const install = () => h.evaluate((ED) => {
  const editor = document.querySelector(ED).editor
  const view = editor.view
  window.__u2 = window.__u2 ?? { log: [] }
  for (const plugin of view.state.plugins) {
    const append = plugin.spec.appendTransaction
    if (!append || append.__u2) continue
    // A plugin with no key of its own is named by the start of its code, to find its file by.
    const by = plugin.key.startsWith('plugin$') ? `${plugin.key} ${String(append).replace(/\s+/g, ' ').slice(0, 160)}` : plugin.key
    const wrapped = function (trs, before, after) {
      const tr = append.call(this, trs, before, after)
      if (tr) tr.__by = by
      return tr
    }
    wrapped.__u2 = true
    plugin.spec.appendTransaction = wrapped
  }
  const proto = Object.getPrototypeOf(view.state)
  if (!proto.__u2) {
    proto.__u2 = true
    const apply = proto.applyTransaction
    proto.applyTransaction = function (root) {
      const out = apply.call(this, root)
      const history = out.state.plugins.find((one) => one.key === 'history$')?.getState(out.state)
      window.__u2.log.push({
        changes: out.transactions.map((tr) => ({ by: tr.__by ?? 'key', steps: tr.steps.map((s) => s.jsonID + (s.from != null ? `@${s.from}-${s.to}` : '')).slice(0, 4).join(' ') + (tr.steps.length > 4 ? ` +${tr.steps.length - 4}` : ''), meta: Object.keys(tr.meta ?? {}).join(','), docChanged: tr.docChanged })),
        undoSteps: history?.done.eventCount, redoSteps: history?.undone.eventCount,
      })
      return out
    }
  }
  window.__u2.snap = () => JSON.stringify(document.querySelector(ED).editor.state.doc.toJSON())
  window.__u2.diff = (a, b) => {
    const A = JSON.parse(a).content ?? [], B = JSON.parse(b).content ?? []
    const out = { blocks: [A.length, B.length], differ: 0, first: [] }
    for (let i = 0; i < Math.max(A.length, B.length); i++) {
      const x = JSON.stringify(A[i] ?? null), y = JSON.stringify(B[i] ?? null)
      if (x === y) continue
      out.differ++
      if (out.first.length >= 4) continue
      let k = 0
      while (k < x.length && x[k] === y[k]) k++
      out.first.push({ block: i, was: x.slice(Math.max(0, k - 40), k + 80), now: y.slice(Math.max(0, k - 40), k + 80) })
    }
    return out
  }
  return { nodes: Object.keys(editor.schema.nodes), marks: Object.keys(editor.schema.marks) }
}, ED)
const snap = (name) => h.evaluate((name) => { window.__u2[name] = window.__u2.snap(); return window.__u2[name].length }, name)
const same = (name) => h.evaluate((name) => window.__u2.diff(window.__u2[name], window.__u2.snap()), name)
const trace = async (label) => {
  const log = await h.evaluate(() => window.__u2.log.splice(0))
  if (TRACE) for (const one of log) console.log(`  ${label}: undo steps ${one.undoSteps}, redo ${one.redoSteps} | ${one.changes.map((x) => `[${x.by}${x.docChanged ? ' changed' : ''}${x.steps ? ' ' + x.steps : ''}${x.meta ? ' meta ' + x.meta : ''}]`).join(' ')}`)
  return log
}
const frame = () => h.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())))
const press = async (key, label) => { await h.keyboard.press(key); await frame(); return trace(label) }

/** A note with every kind of block: emoji as text and as their own, links and addresses left as words, dates, marks, two lists side by side, code, a table, a callout, a picture, columns, a card. */
const li = (text) => ({ type: 'listItem', content: [p(text)] })
const everyKind = () => ({ type: 'doc', content: [
  { type: 'heading', attrs: { level: 1 }, content: [t('Every kind of block, kept whole')] },
  p('Emoji typed as text 🌌🔭👩🏽‍🔬🇿🇦 and one of its own ', { type: 'emoji', attrs: { name: 'smile' } }, ' and a code :smile: in words.'),
  p('A link to ', t('Kepler', [{ type: 'link', attrs: { href: 'https://en.wikipedia.org/wiki/Johannes_Kepler' } }]), ', an address left as words https://example.org/orbit and www.example.com, and ', link(1), '.'),
  p('Dates and other lit words: 15 November 2026 at 3pm, next Tuesday, tomorrow, R12.50 and $3, 1/2 -- (c) -> done...'),
  p(t('Bold', [{ type: 'bold' }]), ' ', t('italic', [{ type: 'italic' }]), ' ', t('code', [{ type: 'code' }]), ' ', t('struck', [{ type: 'strike' }]), ' orbit in marks.'),
  { type: 'bulletList', content: [li('First orbit'), li('Second')] },
  { type: 'bulletList', content: [li('A list straight after a list')] },
  { type: 'orderedList', content: [li('One'), li('Two')] },
  { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [p('Done orbit')] }, { type: 'taskItem', attrs: { checked: false }, content: [p('To do')] }] },
  code(1),
  table(3, 3),
  { type: 'callout', content: [p('A callout about an orbit, with 🌌 and https://example.org/in-callout')] },
  { type: 'image', attrs: { src: pic } },
  { type: 'columns', content: [{ type: 'column', content: [p('Left orbit')] }, { type: 'column', content: [p('Right 🔭 https://example.org/col')] }] },
  card(0),
  { type: 'blockquote', content: [p('A quote, orbit.')] },
  { type: 'horizontalRule' },
  p('https://example.org/a-link-on-its-own-line'),
  p('The last line, orbit.'),
] })

/** A note opened in the main window, with the change log put in. */
const openNote = async (title, body, min) => {
  const id = await v('article:new')
  await v('item:save', id, { title, body })
  await c.send('article', id)
  await h.waitForFunction(([ED, min, title]) => document.querySelector(ED)?.editor?.state.doc.childCount >= min && document.querySelector('[data-open]')?.textContent.includes(title.slice(0, 12)), [ED, min, title], { timeout: 60000 })
  await h.waitForTimeout(600)
  return install()
}
/** The middle of where `text` starts plus `offset`, on the screen: brought into view first (`scroll`), as a person scrolls to it. */
const spot = (text, offset = 0, scroll = true) => h.evaluate(([ED, text, offset, scroll]) => {
  const view = document.querySelector(ED).editor.view
  let at = null
  view.state.doc.descendants((node, pos) => { if (at == null && node.isText && node.text.includes(text)) at = pos + node.text.indexOf(text) + offset; return at == null })
  if (at == null) return null
  const { node } = view.domAtPos(at)
  // At once: the note scrolls smoothly, and a place read while it still moved was pressed somewhere else.
  if (scroll) (node.nodeType === 1 ? node : node.parentElement).scrollIntoView({ block: 'center', behavior: 'instant' })
  const box = view.coordsAtPos(at)
  return { x: box.left + 1, y: (box.top + box.bottom) / 2, at }
}, [ED, text, offset, scroll])
/** Words picked with the pointer, as a person picks them: a press at the start, ⇧ and a press at the end. */
const pick = async (from, to) => {
  const a = await spot(...from)
  // What the press lands on, and where the caret is after it: said when the pick goes wrong.
  const under = (x, y) => h.evaluate(([ED, x, y]) => {
    const one = document.elementFromPoint(x, y)
    const view = document.querySelector(ED).editor.view
    const s = view.state.selection
    const said = (el) => (el ? `${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 3).join('.')}` : 'nothing')
    const open = [...document.querySelectorAll('[role="menu"]:not([data-state="closed"]), [role="dialog"], [data-radix-popper-content-wrapper]')].map(said)
    return { under: `${said(one)}${one?.closest('.ProseMirror') ? ' in the note' : ''}`, at: view.posAtCoords({ left: x, top: y })?.pos, caret: [s.anchor, s.head], focus: said(document.activeElement), open, body: getComputedStyle(document.body).pointerEvents }
  }, [ED, x, y])
  const before = await under(a.x, a.y)
  await h.mouse.click(a.x, a.y); await frame()
  const pressed = await under(a.x, a.y)
  const b = await spot(...to)
  await h.keyboard.down('Shift'); await h.mouse.click(b.x, b.y); await h.keyboard.up('Shift'); await frame()
  const picked = await h.evaluate((ED) => { const s = document.querySelector(ED).editor.state.selection; return { from: s.from, to: s.to, focused: !!document.activeElement?.closest('.ProseMirror') } }, ED)
  // A press lands on a letter's near or far side: one place either way is the same pick.
  if (Math.abs(picked.from - a.at) > 1 || Math.abs(picked.to - b.at) > 1 || !picked.focused) throw new Error(`the words were not picked as asked: ${JSON.stringify({ picked, from: a.at, to: b.at, before, pressed })}`)
  return trace('pick')
}
/** A clipboard event on the note carrying its own data: never the Mac's clipboard. */
const clip = (type, words = '') => h.evaluate(([ED, type, words]) => {
  const data = new DataTransfer()
  if (words) data.setData('text/plain', words)
  document.querySelector(ED).dispatchEvent(new ClipboardEvent(type, { clipboardData: data, bubbles: true, cancelable: true }))
  return data.getData('text/plain').length
}, [ED, type, words])
/** Something done to the note, then ⌘Z, ⇧⌘Z and ⌘Z, each compared with the note before and after it. */
const both = async (note, how, act, keys = { undo: 'Meta+z', redo: 'Meta+Shift+z' }) => {
  await snap('before')
  await act(); await frame(); await trace(how)
  await snap('after')
  const moved = await h.evaluate(() => window.__u2.before !== window.__u2.after)
  check(`${note}, ${how}: it changed the note`, moved)
  await press(keys.undo, '⌘Z')
  let d = await same('before')
  check(`${note}, ${how}: ⌘Z puts back every block as it was`, d.differ === 0, JSON.stringify(d))
  await press(keys.redo, '⇧⌘Z')
  d = await same('after')
  check(`${note}, ${how}: ⇧⌘Z makes it again, exactly`, d.differ === 0, JSON.stringify(d))
  await press(keys.undo, '⌘Z again')
  d = await same('before')
  check(`${note}, ${how}: ⌘Z once more puts it back again`, d.differ === 0, JSON.stringify(d))
}

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const ONLY = process.env.QA_ONLY ?? 'big,every'
  // A copy, a cut or a paste can reach the clipboard through the app's own handlers: they run only on a build whose
  // clipboard in a test run is a stand-in (src/main/pasteboard.ts), never the Mac's own, which is the person's.
  const standIn = await c.electron.evaluate(() => !!globalThis.qaPasteboard)
  if (!standIn) console.log("(this build has no stand-in clipboard: the copy, cut and paste steps are left out, as the Mac's clipboard is the person's)")
  /** Words typed at the end, the whole note deleted (⌘A, then whatever `between` does, then ⌫), then ⌘Z, ⇧⌘Z, ⌘Z. */
  const whole = async (note, how, between = async () => {}, { paced = false } = {}) => {
    await h.evaluate((ED) => document.querySelector(ED).editor.commands.focus('end'), ED)
    await frame(); await trace('focus')
    const words = 'the quick brown fox jumps over the lazy'
    // At long-note.mjs's pace: half a second after the caret is put, then a key, a frame and a turn each.
    if (paced) { await h.waitForTimeout(500); for (const k of words) { await h.keyboard.press(k === ' ' ? 'Space' : k); await h.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r)))) } }
    else await h.keyboard.type(words, { delay: 25 })
    await frame(); await trace('typing')
    await snap('typed')
    await press('Meta+a', '⌘A')
    await between(); await trace('between')
    await press('Backspace', '⌫')
    await snap('deleted')
    await press('Meta+z', '⌘Z')
    let d = await same('typed')
    check(`${note}, ${how}: ⌘Z puts back every block as it was`, d.differ === 0, JSON.stringify(d))
    await press('Meta+Shift+z', '⇧⌘Z')
    d = await same('deleted')
    check(`${note}, ${how}: ⇧⌘Z deletes it all again, exactly`, d.differ === 0, JSON.stringify(d))
    await press('Meta+z', '⌘Z again')
    d = await same('typed')
    check(`${note}, ${how}: ⌘Z once more puts it all back again`, d.differ === 0, JSON.stringify(d))
  }
  // A copy, as long-note.mjs makes one between ⌘A and ⌫: the copy event's own data, never the Mac's clipboard.
  const copy = () => h.evaluate((ED) => { const data = new DataTransfer(); document.querySelector(ED).dispatchEvent(new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true })); return data.getData('text/plain').length }, ED)
  if (ONLY.includes('big')) {
    const schema = await openNote('Undo whole', bigDoc(), 3000)
    if (TRACE) console.log('schema', JSON.stringify(schema))
    await whole('the 3,100-block note', 'deleted straight after typing')
    if (standIn) await whole('the 3,100-block note', 'copied, then deleted', copy)
    await whole('the 3,100-block note', 'deleted after a pause', () => h.waitForTimeout(800))
    // With the stand-in, ⌘C itself, as long-note.mjs presses it: the stand-in takes the copy, never the Mac's clipboard.
    await whole('the 3,100-block note', `typed${standIn ? ', copied with ⌘C' : ''} and counted at long-note.mjs's pace, then deleted`, async () => {
      if (standIn) await h.keyboard.press('Meta+c')
      await h.evaluate((ED) => document.querySelector(ED).editor.state.doc.textContent.length, ED)
    }, { paced: true })
  }
  /** Words with an address dropped in, as a drag from another app brings them: a drag carries its own data, never the clipboard. */
  const dropIn = async () => {
    const at = await spot('The last line')
    await h.evaluate(([ED, x, y]) => {
      const data = new DataTransfer()
      data.setData('text/plain', 'dropped https://example.org/dropped words ')
      document.querySelector(ED).dispatchEvent(new DragEvent('drop', { dataTransfer: data, clientX: x, clientY: y, bubbles: true, cancelable: true }))
    }, [ED, at.x, at.y])
  }
  // The address is linked by the drop's own rule: ⌘Z takes back the whole drop, not that link alone.
  if (ONLY === 'drop') {
    await openNote('Every kind', everyKind(), 18)
    await both('the every-kind note', 'words with an address dropped in', dropIn)
  }
  if (ONLY.includes('every')) {
    const NOTE = 'the every-kind note'
    await openNote('Every kind', everyKind(), 18)
    await both(NOTE, 'words with an address dropped in', dropIn)
    const kinds = await h.evaluate((ED) => { const seen = new Set(); document.querySelector(ED).editor.state.doc.descendants((n) => void seen.add(n.type.name)); return [...seen] }, ED)
    const want = ['heading', 'emoji', 'noteLink', 'bulletList', 'orderedList', 'taskList', 'codeBlock', 'table', 'callout', 'image', 'columns', 'bookmark', 'blockquote', 'horizontalRule']
    check(`${NOTE} holds every kind it was given`, want.every((k) => kinds.includes(k)), `missing: ${want.filter((k) => !kinds.includes(k)).join(', ') || 'none'}`)
    if (standIn) {
      await both(NOTE, 'a cut across the blocks', async () => { await pick(['typed as text', 6], ['A quote', 2]); await clip('cut') })
      await both(NOTE, 'a paste over a selection', async () => { await pick(['an address', 3], ['The last', 4]); await clip('paste', 'pasted 🌌 and https://example.org/pasted :smile: -- (c)\n\nanother orbit line') })
    }
    // The same two lists brought back side by side without the clipboard: words picked across them and ⌫.
    await both(NOTE, 'words deleted across the blocks', async () => { await pick(['typed as text', 6], ['A quote', 2]); await h.keyboard.press('Backspace') })
    /** Until the words `text` stand still for three frames: the note scrolls to a caret after a press, and the pointer then lies over another block. */
    const still = (text) => h.waitForFunction(([ED, text]) => {
      const view = document.querySelector(ED).editor.view
      let at = null
      view.state.doc.descendants((node, pos) => { if (at == null && node.isText && node.text.includes(text)) at = pos + node.text.indexOf(text); return at == null })
      const seen = (window.__u2.still = [...(window.__u2.still ?? []), Math.round(view.coordsAtPos(at).top)].slice(-3))
      return seen.length === 3 && seen.every((one) => one === seen[0])
    }, [ED, text], { polling: 'raf', timeout: 5000 })
    /** The block under `text` pressed into and hovered, as a person does, until its grip stands beside it, the note at rest. */
    const gripOf = async (text) => {
      const first = await spot(text)
      // The press leaves only a caret: Undo gave back the lines picked before, and a pick keeps the grip on its own lines.
      await h.mouse.click(first.x, first.y)
      await h.evaluate(() => void (window.__u2.still = []))
      await still(text)
      const at = await spot(text, 0, false)
      await h.mouse.move(at.x + 30, at.y)
      await h.waitForFunction((y) => { const g = document.querySelector('[data-open] .tiptap-drag-handle-grip')?.getBoundingClientRect(); return !!g?.height && Math.abs((g.top + g.bottom) / 2 - y) < 24 }, at.y, { timeout: 5000 })
      return h.locator('[data-open] .tiptap-drag-handle-grip').boundingBox()
    }
    /** Until the note is no longer what it was before this step. */
    const changed = () => h.waitForFunction(() => window.__u2.snap() !== window.__u2.before, null, { timeout: 5000 }).catch(() => {})
    await both(NOTE, 'a block deleted from its menu', async () => {
      // Pressed where it stands: a locator's own click scrolls first, and the grip follows the pointer to the next block.
      const grip = await gripOf('A callout about')
      await h.mouse.click(grip.x + grip.width / 2, grip.y + grip.height / 2)
      if (process.env.QA_SHOTS) await h.screenshot({ path: `${process.env.QA_SHOTS}/undo-whole-block-menu.png` })
      // By its title: the line also shows its key (Delete ⌫) since blocks can be picked.
      await h.locator('.tiptap-block-menu[data-state="open"] button', { has: h.locator('.tiptap-slash-menu-title', { hasText: /^Delete$/ }) }).click()
    })
    await both(NOTE, 'a block carried to another place', async () => {
      // The last line carried up over the quote: both on the screen at once.
      const grip = await gripOf('The last line')
      const target = await spot('A quote', 0, false)
      await h.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2); await h.mouse.down()
      for (let i = 1; i <= 14; i++) { await h.mouse.move(grip.x + (target.x + 40 - grip.x) * i / 14, grip.y + (target.y - 6 - grip.y) * i / 14); await frame() }
      await h.mouse.up(); await changed()
    })
    await both(NOTE, '“Replace all”', async () => {
      await h.evaluate((ED) => document.querySelector(ED).editor.commands.focus('start'), ED)
      await h.keyboard.press('Meta+Alt+f')
      const bar = h.locator('.tiptap-find-bar')
      await bar.locator('input[placeholder="Find"]').fill('orbit')
      // Once the bar shows what it found, as a person waits to see it.
      await h.waitForFunction(() => /[1-9]/.test(document.querySelector('.tiptap-find-bar-count')?.textContent.split('/')[1] ?? ''), null, { timeout: 5000 })
      await bar.locator('input[placeholder="Replace with"]').click(); await h.keyboard.type('path 🌌 https://example.org/replaced')
      await h.keyboard.press('Alt+Enter'); await changed()
    })
    await h.keyboard.press('Escape'); await frame()
    await whole(NOTE, 'deleted straight after typing')
  }
} catch (e) {
  check('ran to the end', false, e.message.split('\n').slice(0, 4).join(' | '))
  // The whole reason, and the window as it stood (QA_SHOTS), to see what stopped it.
  console.log(e.message.split('\n').slice(0, 30).join('\n'))
  if (process.env.QA_SHOTS) await h.screenshot({ path: `${process.env.QA_SHOTS}/undo-whole-stopped.png` }).catch(() => {})
} finally {
  await c.close()
}
done()
