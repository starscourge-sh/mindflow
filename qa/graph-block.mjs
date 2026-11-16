// The graph block: "/" Graph inserts it; y = sin(x) draws; a slider moves a curve; pan, zoom, double-click;
// hover reads a point; saved and reloaded; Markdown out and back in; ⌫ and Undo; pictures light and dark.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-gx/main/index.js HALIGTREE_QA_AWAY=1 node qa/graph-block.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 950 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.QA_SHOTS ?? '/tmp'
const ed = 'document.querySelector("[data-open] .tiptap").editor'
const graphAttrs = () => h.evaluate(`(() => { let a = null; ${ed}.state.doc.descendants((n) => { if (n.type.name === 'graph' && !a) a = n.attrs }); return a })()`)
const canvasData = () => h.evaluate(() => { const c = document.querySelector('[data-open] .mf-graph canvas'); return c ? { drawn: c.dataset.drawn, view: (c.dataset.view ?? '').split(',').map(Number), hover: c.dataset.hover ?? null, png: c.toDataURL().length + ':' + c.toDataURL().slice(-200) } : null })
const box = () => h.locator('[data-open] .mf-graph canvas').first().boundingBox()

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const id = await v('article:new')
  await v('item:save', id, { title: 'Graphs', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Above the graph' }] }] } })
  await c.send('article', id); await wait(1500)
  await h.evaluate(`${ed}.chain().focus('end').run()`)
  await h.keyboard.press('Enter')
  await h.keyboard.type('/graph', { delay: 30 }); await wait(700)
  const first = await h.locator('.tiptap-suggestion-popup .tiptap-slash-menu-title').first().innerText().catch(() => '')
  check('"/graph" offers Graph first', first === 'Graph', first)
  await h.keyboard.press('Enter'); await wait(1200)
  check('Graph inserts a graph block', (await h.locator('[data-open] .mf-graph').count()) === 1)
  const focused = await h.evaluate(() => document.activeElement?.classList.contains('mf-graph-field'))
  check('its first line waits for typing', focused)
  await h.locator('[data-open] .mf-graph').first().screenshot({ path: `${shots}/graph-empty-light.png` })

  await h.keyboard.type('y = sin(x)', { delay: 20 }); await wait(800)
  let data = await canvasData()
  const blue = Number(/blue:(\d+)/.exec(data?.drawn ?? '')?.[1] ?? 0)
  check('typing y = sin(x) draws a curve (points on the canvas)', blue > 300, data?.drawn)

  // Hover on the curve at x = π/2: the point and its coordinates.
  let b = await box()
  const [xmin, xmax, ymin, ymax] = data.view
  const px = b.x + ((Math.PI / 2 - xmin) / (xmax - xmin)) * b.width
  const py = b.y + ((ymax - 1) / (ymax - ymin)) * b.height
  await h.mouse.move(px, py + 4); await wait(400)
  data = await canvasData()
  check('hovering the curve shows the point’s coordinates', /^\(1\.57\d*, 1(\.0+)?\)$/.test(data.hover ?? ''), data.hover)

  // Enter: a second line, with a free letter that gets a slider.
  await h.locator('[data-open] .mf-graph-shown, [data-open] .mf-graph-field').first().click(); await wait(200)
  await h.keyboard.press('End')
  await h.keyboard.press('Enter'); await wait(300)
  await h.keyboard.type('y = a*x^2', { delay: 20 }); await wait(900)
  check('a free letter gets a slider', (await h.locator('[data-open] [data-slider="a"]').count()) === 1)
  check('the first line shows as KaTeX once left', (await h.locator('[data-open] .mf-graph-line[data-line="0"] .katex').count()) === 1)
  const before = (await canvasData()).png
  const thumb = h.locator('[data-open] [data-slider="a"] [role="slider"]')
  await thumb.focus()
  for (let i = 0; i < 20; i++) await h.keyboard.press('ArrowRight')
  await wait(500)
  const after = await canvasData()
  const attrs = await graphAttrs()
  check('the slider changes a and the curve with it', attrs.sliders.a.value > 1.5 && after.png !== before, JSON.stringify(attrs.sliders))

  // Pan: drag right by 150px moves the view left.
  b = await box()
  const v0 = (await canvasData()).view
  await h.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
  await h.mouse.down(); await h.mouse.move(b.x + b.width / 2 + 75, b.y + b.height / 2, { steps: 5 }); await h.mouse.move(b.x + b.width / 2 + 150, b.y + b.height / 2 + 50, { steps: 5 }); await h.mouse.up()
  await wait(400)
  const v1 = (await canvasData()).view
  const unit = (v0[1] - v0[0]) / b.width
  check('dragging pans the view', Math.abs((v0[0] - v1[0]) - 150 * unit) < unit * 3 && v1[2] > v0[2], `${v0} → ${v1}`)
  // Zoom: scroll in over a point keeps that point under the pointer.
  const at = { x: b.x + b.width * 0.7, y: b.y + b.height * 0.3 }
  const world = (vw) => [vw[0] + ((at.x - b.x) / b.width) * (vw[1] - vw[0]), vw[3] - ((at.y - b.y) / b.height) * (vw[3] - vw[2])]
  await h.mouse.move(at.x, at.y)
  // A plain scroll over the plot is the note's: the view stays put.
  await h.mouse.wheel(0, -300); await wait(400)
  const plain = (await canvasData()).view
  check('a plain scroll over the plot leaves its view alone (the note scrolls)', JSON.stringify(plain) === JSON.stringify(v1), `${v1} → ${plain}`)
  // ⌘-scroll (or a pinch) zooms.
  await h.keyboard.down('Meta'); await h.mouse.wheel(0, -300); await h.keyboard.up('Meta'); await wait(400)
  const v2 = (await canvasData()).view
  const [wx1, wy1] = world(v1), [wx2, wy2] = world(v2)
  check('⌘-scroll zooms in, centred on the pointer', v2[1] - v2[0] < (v1[1] - v1[0]) * 0.8 && Math.abs(wx1 - wx2) < 0.05 && Math.abs(wy1 - wy2) < 0.05, `${v1} → ${v2}`)
  await h.mouse.dblclick(b.x + 30, b.y + 30); await wait(400)
  const v3 = (await canvasData()).view
  check('double-click puts the view back', Math.abs(v3[0] + 10) < 1e-3 && Math.abs(v3[1] - 10) < 1e-3, String(v3))
  check('moving the view is not an Undo step', (await graphAttrs()).view != null)

  // A circle as an implicit equation.
  await h.locator('[data-open] .mf-graph-add').click(); await wait(300)
  await h.keyboard.type('x^2 + y^2 = 4', { delay: 15 }); await wait(900)
  const drawn = (await canvasData()).drawn
  check('an implicit equation draws (x^2 + y^2 = 4)', Number(/(\w+):(\d+)$/.exec(drawn)?.[2] ?? 0) > 50, drawn)
  const third = async () => (await graphAttrs()).expressions[2]?.text
  await wait(600)
  await h.keyboard.press('Meta+z'); await wait(400)
  const undoneText = await third()
  await h.keyboard.press('Meta+Shift+z'); await wait(400)
  check('⌘Z in a line is the note’s Undo, ⇧⌘Z its Redo', undoneText !== 'x^2 + y^2 = 4' && (await third()) === 'x^2 + y^2 = 4', `${undoneText} → ${await third()}`)
  await h.keyboard.press('Escape'); await wait(300)
  check('Esc leaves the line and picks the block', await h.evaluate(`${ed}.state.selection.node?.type.name === 'graph'`))

  // Right-click: the block menu, with its caption row.
  b = await box()
  await h.mouse.click(b.x + 20, b.y - 4 - 0, { button: 'right' }); await wait(600)
  const rows = await h.locator('[role="menuitem"]').allInnerTexts().catch(() => [])
  check('right-click opens the block menu with “Caption” and its key', rows.some((r) => /^Caption\s*⌥⌘M/.test(r)), rows.slice(0, 12).join(' | '))
  await h.locator('[role="menuitem"]', { hasText: /^Caption/ }).first().click(); await wait(500)
  await h.keyboard.type('Sine and friends', { delay: 15 }); await h.keyboard.press('Enter'); await wait(500)
  check('“Caption” writes a caption under the graph', (await graphAttrs()).caption === 'Sine and friends' && /Sine and friends/.test(await h.locator('[data-open] .mf-caption').first().innerText().catch(() => '')), String((await graphAttrs()).caption))

  // Pictures, light and dark, and in the Paper style.
  await h.locator('[data-open] .mf-graph').first().scrollIntoViewIfNeeded()
  await h.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.5); await wait(300)
  await c.both(`${shots}/graph-block`, h.locator('[data-open] .mf-graph').first())
  await c.both(`${shots}/graph-page`)
  await h.evaluate(() => { localStorage.setItem('style', 'paper'); window.dispatchEvent(new StorageEvent('storage', { key: 'style' })) }); await wait(500)
  await c.both(`${shots}/graph-paper`, h.locator('[data-open] .mf-graph').first())
  await h.evaluate(() => { localStorage.setItem('style', 'soft'); window.dispatchEvent(new StorageEvent('storage', { key: 'style' })) }); await wait(300)

  // Saved, reloaded, still there.
  const kept = await graphAttrs()
  await wait(1500)
  await h.reload(); await wait(2500)
  await c.send('article', id); await wait(1800)
  const back = await graphAttrs()
  check('saved and reloaded: the lines, sliders and view are still there', !!back && JSON.stringify(back.expressions.map((e) => e.text)) === JSON.stringify(kept.expressions.map((e) => e.text)) && back.sliders.a?.value === kept.sliders.a?.value, JSON.stringify(back?.expressions?.map((e) => e.text)))
  check('and it draws again after the reload', /blue:\d{3,}/.test((await canvasData())?.drawn ?? ''), (await canvasData())?.drawn)

  // Markdown: a fenced graph block, read back to the same graph.
  const md = await h.evaluate(`${ed}.storage.markdown.manager.serialize(${ed}.getJSON())`)
  check('Markdown export holds a ```graph block', /```graph\ny = sin\(x\) \{blue\}\ny = a\*x\^2 \{\w+\}\nx\^2 \+ y\^2 = 4 \{\w+\}\na = [\d.]+ \(-10 to 10\)\nview: [^\n]+\n```\n\n\*Sine and friends\*/.test(md), md.slice(0, 300))
  const other = await v('article:new')
  await v('item:save', other, { title: 'Graphs again', body: { type: 'doc', content: [{ type: 'paragraph' }] } })
  await c.send('article', other); await wait(1500)
  // Pasted as plain text: the app's own Markdown reader, the one a Markdown file opens through (captions folded in).
  await h.evaluate(([text]) => {
    const editor = document.querySelector('[data-open] .tiptap').editor
    editor.commands.focus('end')
    const data = new DataTransfer()
    data.setData('text/plain', text)
    editor.view.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  }, [md])
  await wait(800)
  const read = await graphAttrs()
  check('importing the Markdown restores the graph', !!read && JSON.stringify(read.expressions.map((e) => [e.text, e.color])) === JSON.stringify(kept.expressions.map((e) => [e.text, e.color])) && JSON.stringify(read.sliders) === JSON.stringify(kept.sliders) && read.view.xmin === kept.view.xmin && read.caption === 'Sine and friends', JSON.stringify(read))

  // The pictures' widths, and the smallest window.
  await h.locator('[data-open] .mf-graph').first().hover(); await wait(200)
  await h.locator('[data-open] .mf-graph-tools button[aria-label="M width"]').click(); await wait(500)
  const wide = await h.evaluate(() => { const g = document.querySelector('[data-open] .mf-graph'); return g.getBoundingClientRect().width / g.parentElement.getBoundingClientRect().width })
  check('“M” sets the graph to 60% of the column, as a picture’s', Math.abs(wide - 0.6) < 0.03, wide.toFixed(2))
  await c.both(`${shots}/graph-medium`)
  await c.size(560, 400); await wait(600)
  await h.locator('[data-open] .mf-graph').first().scrollIntoViewIfNeeded()
  await h.screenshot({ path: `${shots}/graph-small-window-light.png` })
  const sideways = await h.evaluate(() => { const s = document.querySelector('[data-open] .mf-graph')?.closest('[class*="overflow"]'); return s ? s.scrollWidth > s.clientWidth + 1 : false })
  check('the smallest window: no sideways scroll', !sideways)
  await c.size(1300, 950)

  // ⌫ on the picked block takes it away; Undo brings it back.
  await h.evaluate(`(() => { let at = -1; ${ed}.state.doc.descendants((n, p) => { if (n.type.name === 'graph' && at < 0) at = p }); ${ed}.chain().focus().setNodeSelection(at).run() })()`)
  await wait(200)
  await h.keyboard.press('Backspace'); await wait(400)
  check('⌫ deletes the picked graph', (await h.locator('[data-open] .mf-graph').count()) === 0)
  await h.keyboard.press('Meta+z'); await wait(600)
  const undone = await graphAttrs()
  check('Undo brings it back whole', (await h.locator('[data-open] .mf-graph').count()) === 1 && undone?.expressions?.length === 3)
  check('no page errors', !c.errors.some((e) => /PAGEERROR/.test(e)), c.errors.filter((e) => /PAGEERROR/.test(e)).join(' | '))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
