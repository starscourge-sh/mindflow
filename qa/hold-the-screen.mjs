// What a person is looking at in a note stays put while a block above the screen changes height by itself: a link
// card filling in (its preview arriving, as the app keeps one) and a picture arriving at its own size. In the book's
// largest note (long: only the blocks near the screen are drawn, extensions/long-document.ts) and in a short one
// (all of it drawn). With the caret on the screen, its line moves by under 2 px in every frame painted through the
// growth; with the caret off the screen, the line at the screen's top does. A frame before and after each card
// growth, light and dark. Run on a COPY of a book (QA_DATA), never the book itself:
//
//   QA_DATA=<copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/hold-the-screen.mjs
//
// NOTES=long,short picks the notes (both by default); QA_SHOTS is where the frames go.
import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { loadavg } from 'os'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
import { lineOnShow } from './line-on-show.mjs'

const { check, done } = checks()
const ED = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const root = process.env.QA_DATA
if (!root) throw new Error('QA_DATA must be a copy of a book')
const shots = join(process.env.QA_SHOTS ?? '/tmp', 'hold-the-screen')
mkdirSync(shots, { recursive: true })
const shelf = existsSync(join(root, 'books.json')) ? JSON.parse(readFileSync(join(root, 'books.json'), 'utf8')) : null
const file = shelf?.last && shelf.last !== 'default' ? join(root, 'books', shelf.last, 'haligtree.db') : join(root, 'haligtree.db')
const db = new DatabaseSync(file, { readOnly: true })
// The largest note, and a short one that still scrolls a few screens: the one with the most blocks of those well
// under the 200,000 places a long note starts at.
const notes = {
  long: db.prepare("select id, title from captures where status = 'open' and kind = 'note' and body is not null order by length(body) desc limit 1").get(),
  short: db.prepare("select id, title, body from captures where status = 'open' and kind = 'note' and body is not null and length(body) between 20000 and 160000").all().map((one) => ({ id: one.id, title: one.title, blocks: JSON.parse(one.body).content?.length ?? 0 })).sort((a, b) => b.blocks - a.blocks)[0],
}
db.close()
const NOTES = (process.env.NOTES ?? 'long,short').split(',').filter((one) => notes[one])
const wait = (ms) => new Promise((next) => setTimeout(next, ms))
const load = () => `load ${loadavg()[0].toFixed(1)}`
const page = (target, run, arg) => target.evaluate(([body, arg]) => new Function('ed', 'arg', `return (${body})(ed, arg)`)(window.__hts, arg), [run.toString(), arg])

const c = await sandbox({ width: 1300, height: 900, seeded: false })
const h = c.h
try {
  await h.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))
  await h.evaluate(() => window.api.haligtree('settings:set', { sounds: false, hintRate: 0 }))
  await wait(1200)
  for (const which of NOTES) {
    const note = notes[which]
    await c.send('capture', note.id)
    const opened = await h.waitForFunction(([sel, which]) => {
      const ed = [...document.querySelectorAll(sel)].filter((one) => one.editor && one.isConnected && one.getClientRects().length).sort((a, b) => b.editor.state.doc.childCount - a.editor.state.doc.childCount)[0]
      if (!ed || ed.editor.state.doc.childCount < 20 || ed.hasAttribute('data-long') !== (which === 'long')) return false
      window.__hts = ed
      return true
    }, [ED, which], { timeout: 90000 }).then(() => true, () => false)
    if (!check(`${which}: the note opens (${note.title?.slice(0, 30) || note.id.slice(0, 8)})`, opened)) continue
    await wait(2500)
    // In the note's middle, by the wheel, as a person gets there; then a press on a line on show puts the caret there.
    const middle = await page(h, (ed) => {
      let box = ed.parentElement
      while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement
      window.__htsBox = box
      const r = box.getBoundingClientRect()
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), room: box.scrollHeight - box.clientHeight }
    })
    await h.mouse.move(middle.x, middle.y)
    const pushes = which === 'long' ? 8 : Math.max(1, Math.min(4, Math.round(middle.room / 2 / 1200)))
    for (let i = 0; i < pushes; i++) (await h.mouse.wheel(0, 1200), await wait(120))
    await wait(900)
    const spot = await page(h, lineOnShow, { min: 3 })
    if (!check(`${which}: a line of the note is on show to press in`, !spot.none, spot.none ? JSON.stringify(spot.none) : `block ${spot.index + 1}: "${spot.words}"`)) continue
    await h.mouse.click(spot.x, spot.y)
    await wait(700)

    // A growth above the screen, and every frame through it: where the caret's line (or the line at the screen's
    // top) stands each time the note's size changed, read as that frame will be painted (after the page's own size
    // watchers, made before this one: a reading taken between frames would count a change the page puts right
    // before painting it), and once more at the end.
    const grow = async (name, how, follow, { theme = '', anchor = 'caret' } = {}) => {
      const set = await page(h, (ed, { anchor }) => {
        const view = ed.editor.view
        const box = window.__htsBox.getBoundingClientRect()
        const top = Math.max(box.top, 0)
        // The block drawn some way above the screen that the growth goes before.
        const drawn = [...ed.children].filter((one) => !one.hasAttribute('data-off') && one.getClientRects().length && one.pmViewDesc?.node)
        const above = drawn.filter((one) => one.getBoundingClientRect().bottom < top - 40)
        const at = above[Math.max(0, above.length - 3)]
        if (!at) return { none: `no drawn block above the screen (${drawn.length} drawn)` }
        const where = at.pmViewDesc.posBefore
        const before = view.state.doc.resolve(where)
        // What is watched: the caret's line, or the first block reaching below the screen's top.
        const caret = () => view.coordsAtPos(view.state.selection.head)
        const first = drawn.find((one) => one.getBoundingClientRect().bottom > top + 1)
        const read = anchor === 'caret' ? () => caret().top : () => first.getBoundingClientRect().top
        const caretTop = caret().top
        const onScreen = caretTop >= box.top && caretTop <= box.bottom
        const frames = (window.__htsFrames = [])
        const was = read()
        const sample = () => frames.push(Math.round((read() - was) * 10) / 10)
        const watch = new ResizeObserver(sample)
        watch.observe(ed)
        window.__htsStop = () => (watch.disconnect(), sample(), frames)
        window.__htsWhere = where
        return { where, block: before.index(0), caretOnScreen: onScreen, watched: anchor, at: Math.round(was - box.top) }
      }, { anchor })
      if (set.none) return check(`${which}: ${name}`, false, set.none)
      if (theme) await h.screenshot({ path: join(shots, `${which}-${name.replace(/\W+/g, '-')}-${theme}-0-before.png`) })
      const did = await page(h, (ed, how) => {
        const view = ed.editor.view
        const where = window.__htsWhere
        const { schema } = view.state
        if (how === 'fold') {
          // A heading above the screen whose whole section is above it too, with blocks in it: folded shut (the
          // space above shrinks), then opened again (it grows), as its arrow or "Unfold all" does it: the caret
          // left where it is, nothing asked to be shown.
          const fold = view.state.plugins.find((one) => String(one.key).startsWith('headingFold'))
          window.__htsToggle = (pos) => view.dispatch(view.state.tr.setMeta(fold, { toggle: pos }))
          const top = Math.max(window.__htsBox.getBoundingClientRect().top, 0)
          const above = [...ed.children].filter((one) => !one.hasAttribute('data-off') && one.getClientRects().length && one.pmViewDesc?.node && one.getBoundingClientRect().bottom < top - 40)
          for (let i = above.length - 1; i >= 0 && window.__htsFold === undefined; i--) {
            const node = above[i].pmViewDesc.node
            if (node.type.name !== 'heading') continue
            for (let j = i + 1; j < above.length; j++) {
              const next = above[j].pmViewDesc.node
              if (next.type.name === 'heading' && next.attrs.level <= node.attrs.level) {
                if (j > i + 1) window.__htsFold = above[i].pmViewDesc.posBefore
                break
              }
            }
          }
          if (window.__htsFold === undefined) return { none: 'no heading above the screen with its whole section above it too' }
          window.__htsToggle(window.__htsFold)
        } else if (how === 'card') {
          view.dispatch(view.state.tr.insert(where, schema.nodes.bookmark.create({ href: 'https://haligtree.invalid/hold-the-screen', loading: true })))
          window.__htsCard = where
        } else if (how === 'picture') {
          // A picture with no size of its own kept: it takes its size when it has loaded (asked for at once, as one
          // far down a long note is when it comes near the screen).
          const canvas = document.createElement('canvas')
          canvas.width = 900
          canvas.height = 700
          const paint = canvas.getContext('2d')
          paint.fillStyle = '#7a5a2a'
          paint.fillRect(0, 0, 900, 700)
          paint.fillStyle = '#e8d8b0'
          paint.fillRect(60, 60, 780, 580)
          view.dispatch(view.state.tr.insert(where, schema.nodes.image.create({ src: canvas.toDataURL('image/png') })))
          const img = view.nodeDOM(where)
          if (img instanceof HTMLImageElement) img.loading = 'eager'
        }
      }, how)
      if (did?.none) {
        await page(h, () => window.__htsStop())
        // A note with no such heading has no section to fold there: said, not counted.
        if (how === 'fold') return console.log(`(${which}: ${name}: not run, ${did.none})`)
        return check(`${which}: ${name}`, false, did.none)
      }
      if (follow) {
        await wait(250)
        // The card's preview arrives: its words, a long description, the site. Or the folded section opens again.
        await page(h, (ed) => {
          if (window.__htsFold !== undefined) return void (window.__htsToggle(window.__htsFold), (window.__htsFold = undefined))
          const view = ed.editor.view
          const pos = window.__htsCard
          const node = view.state.doc.nodeAt(pos)
          if (node?.type.name !== 'bookmark') return
          view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, loading: false, title: 'A card filled in above the screen', site: 'haligtree.invalid', description: 'Its preview arrived after it was drawn: a title, a site and this description, long enough to take several lines of the card, so the card stands taller than it did while it was being fetched, as a link card does when its words come in from the network.' }))
        })
      }
      await wait(theme ? 150 : 900)
      if (theme) {
        await h.screenshot({ path: join(shots, `${which}-${name.replace(/\W+/g, '-')}-${theme}-1-after.png`) })
        await wait(600)
      }
      const frames = await page(h, () => window.__htsStop())
      const worst = frames.reduce((most, one) => (Math.abs(one) > Math.abs(most) ? one : most), 0)
      const grew = await page(h, (ed, where) => {
        const el = ed.editor.view.nodeDOM(where)
        return el instanceof Element ? Math.round(el.getBoundingClientRect().height) : -1
      }, set.where)
      return check(`${which}: ${name}`, set.watched !== 'caret' || set.caretOnScreen ? Math.abs(worst) < 2 && frames.length >= 2 : false, `${set.watched === 'caret' ? `the caret's line ${set.caretOnScreen ? 'on' : 'NOT on'} the screen` : "the line at the screen's top"} (${set.at} px down it) moved ${worst} px at most over ${frames.length} frames with a change of size; the block above the screen (block ${set.block + 1}) now ${grew} px tall (${load()})${Math.abs(worst) >= 2 ? `; each: ${frames.slice(0, 12).join(', ')}` : ''}`)
    }
    for (const theme of ['light', 'dark']) {
      await c.look(theme)
      await wait(300)
      await grow(`a card above the screen filling in holds the caret's line still (${theme})`, 'card', true, { theme })
    }
    await c.look('light')
    await grow("a picture above the screen arriving at its own size holds the caret's line still", 'picture', false)
    await grow("a section above the screen folded shut and opened again holds the caret's line still", 'fold', true)
    // The caret taken off the screen (the wheel moves on past it): the line at the screen's top is held instead.
    await h.mouse.move(middle.x, middle.y)
    for (let i = 0; i < 2; i++) (await h.mouse.wheel(0, 900), await wait(120))
    await wait(900)
    const off = await page(h, (ed) => {
      const box = window.__htsBox.getBoundingClientRect()
      const caret = ed.editor.view.coordsAtPos(ed.editor.state.selection.head)
      return caret.bottom < box.top || caret.top > box.bottom
    })
    if (check(`${which}: the wheel took the caret off the screen`, off)) await grow("a card above the screen filling in holds the line at the screen's top still, the caret off the screen", 'card', true, { anchor: 'top' })
  }
  check('no page errors', !c.errors.filter((line) => !/ERR_FILE_NOT_FOUND|status of 404|haligtree\.invalid|ERR_NAME_NOT_RESOLVED|ERR_BLOCKED/.test(line)).length, c.errors.slice(0, 3).join(' | '))
  console.log(`(frames in ${shots})`)
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error).slice(0, 600))
} finally {
  await c.close()
}
done()
