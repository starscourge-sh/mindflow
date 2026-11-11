// With Vim on, the band on the caret's line keeps to the box its line is in. Inside a callout it lights the line
// from one edge of the callout to the other and stops there (it ran the whole width of the pane behind the callout
// and showed past both its sides); a code block carries none (it showed only as a band past both sides of the
// block, as tall as the block), as a table's cell carries none. Read from the pixels of a row across the pane at
// the caret's height, light and dark.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/band-in-box.mjs
//   SHOTS=dir keeps a picture of each, light and dark.
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 860 })
const { h, v, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
const sel = '[data-open] .tiptap'
const p = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
/** The colour at each of `xs` along the row of pixels at height `y`, as [red, green, blue]. */
const colours = async (y, xs) => {
  const png = await h.screenshot({ clip: { x: 0, y: Math.round(y), width: 1280, height: 1 } })
  return electron.evaluate(({ nativeImage }, [b64, xs]) => {
    const image = nativeImage.createFromBuffer(Buffer.from(b64, 'base64'))
    const bits = image.toBitmap()
    const scale = image.getSize().width / 1280
    // toBitmap is BGRA.
    return xs.map((x) => { const at = Math.round(x * scale) * 4; return [bits[at + 2], bits[at + 1], bits[at]] })
  }, [png.toString('base64'), xs])
}
const apart = (a, b) => Math.max(...a.map((one, k) => Math.abs(one - b[k])))
const box = (query) => h.evaluate(([sel, query]) => { const one = document.querySelector(`${sel} ${query}`)?.getBoundingClientRect(); return one ? { left: one.left, right: one.right, top: one.top, bottom: one.bottom, mid: (one.top + one.bottom) / 2 } : null }, [sel, query])
try {
  await v('settings:set', { sounds: false, hintRate: 0, safeMode: false })
  await h.evaluate(() => { localStorage.setItem('vim', 'on'); window.dispatchEvent(new StorageEvent('storage', { key: 'vim', newValue: 'on' })) })
  const id = await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), { type: 'doc', content: [p('Band in a box')] })
  await c.send('capture', id); await wait(2500)
  await h.locator(sel).first().click(); await wait(300)
  for (const theme of ['dark', 'light']) {
    await c.look(theme)
    // --- A callout between two plain lines, the caret in it.
    await h.evaluate(([sel, content]) => { const ed = document.querySelector(sel).editor; ed.commands.setContent({ type: 'doc', content }); let at = 0; ed.state.doc.descendants((node, pos) => void (node.isText && node.text === 'Inside the callout.' && (at = pos + 3))); ed.chain().focus().setTextSelection(at).toggleCallout().run() }, [sel, [p('A plain line above.'), p('Inside the callout.'), p('A plain line below.')]])
    await wait(500)
    const callout = await box('.tiptap-callout')
    const line = await box('.tiptap-callout .vim-cursor-line')
    const plain = await box('p')
    if (!callout || !line || !plain) { check(`${theme}: a callout holds the caret's line, Vim on`, false, JSON.stringify({ callout, line, plain })); continue }
    const xs = [callout.left - 14, callout.right + 14]
    const beside = await colours(line.mid, xs)
    const page = await colours(plain.mid, xs)
    check(`${theme}: beside a callout the page is bare at the caret's height: the band does not show past the box`, apart(beside[0], page[0]) <= 2 && apart(beside[1], page[1]) <= 2, JSON.stringify({ beside, page }))
    // Inside it the line is lit: its fill at the caret's height is not the callout's own fill a little above the line.
    const inside = await colours(line.mid, [callout.right - 10])
    const own = await colours(callout.top + 4, [callout.right - 10])
    check(`${theme}: inside the callout the caret's line is lit, edge to edge`, apart(inside[0], own[0]) >= 3, JSON.stringify({ inside, own }))
    if (process.env.SHOTS) await h.screenshot({ path: `${process.env.SHOTS}/band-callout-${theme}.png`, clip: { x: 300, y: 80, width: 960, height: 420 } })
    // --- A code block between two plain lines, the caret in it.
    await h.evaluate(([sel, content]) => { const ed = document.querySelector(sel).editor; ed.commands.setContent({ type: 'doc', content }); let at = 0; ed.state.doc.descendants((node, pos) => void (node.type.name === 'codeBlock' && (at = pos + 3))); ed.chain().focus().setTextSelection(at).run() }, [sel, [p('A plain line above.'), { type: 'codeBlock', content: [{ type: 'text', text: 'one line of code\nand another\nand a third' }] }, p('A plain line below.')]])
    await wait(500)
    const pre = await box('pre')
    const above = await box('p')
    if (!pre || !above) { check(`${theme}: a code block holds the caret`, false, JSON.stringify({ pre, above })); continue }
    const sides = [pre.left - 14, pre.right + 14]
    const byCode = await colours(pre.mid, sides)
    const byPlain = await colours(above.top - 6, sides)
    check(`${theme}: beside a code block the page is bare: no band past its sides`, apart(byCode[0], byPlain[0]) <= 2 && apart(byCode[1], byPlain[1]) <= 2, JSON.stringify({ byCode, byPlain }))
    if (process.env.SHOTS) await h.screenshot({ path: `${process.env.SHOTS}/band-code-${theme}.png`, clip: { x: 300, y: 80, width: 960, height: 420 } })
  }
  check('no page errors', !c.errors.some((one) => /PAGEERROR/.test(one)), c.errors.join(' / ').slice(0, 300))
} catch (error) {
  check('the run finished', false, error.message.split('\n').slice(0, 6).join(' ⏎ '))
} finally { await c.close() }
done()
