// A note's hover card holds still over links set side by side as pills that
// wrap onto a second line ("Connected to: 💎 Matrices as transformation
// machines, 💎 Vectors ..."): resting on a pill that wraps, on either of its
// lines, the card shows once and stays; moving slowly along the pills on both
// lines, it never goes and comes back while the pointer stays on one pill.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-p/main/index.js HALIGTREE_QA_AWAY=1 node qa/hover-card-steady.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 850 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const NAMES = ['Matrices as transformation machines', 'Vectors are arrows and lists at once', 'Determinants measure how space stretches', 'Eigenvectors stay on their own line', 'Linear maps keep grid lines parallel and evenly spaced', 'Dot products say how much two arrows agree', 'Change of basis is a translation between languages', 'The null space is everything sent to zero']
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await v('onboarding:set', { pageHints: false })
  const ids = []
  for (const name of NAMES) ids.push(await h.evaluate((name) => window.api.captures.create({ kind: 'note', title: name, body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: name }] }, { type: 'paragraph', content: [{ type: 'text', text: `More words about ${name.toLowerCase()}.` }] }] } }), name))
  const links = ids.flatMap((id, at) => [...(at ? [{ type: 'text', text: ', ' }] : []), { type: 'noteLink', attrs: { id, label: NAMES[at] } }])
  const hub = await h.evaluate((links) => window.api.captures.create({ kind: 'note', title: 'Linear algebra', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Linear algebra' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'Connected to: ' }, ...links] }] } }), links)
  await c.send('capture', hub); await wait(2500)
  // Every link's line pieces, and the ones that wrap.
  const pieces = await h.evaluate(() => [...document.querySelectorAll('a.tiptap-note-link[data-note]')].map((one) => ({ id: one.getAttribute('data-note'), rects: [...one.getClientRects()].filter((r) => r.width > 2).map((r) => ({ x: r.x, y: r.y, w: r.width, h: r.height })) })))
  const wrapped = pieces.filter((one) => one.rects.length >= 2)
  check('the pills sit side by side and some wrap onto the next line', pieces.length === NAMES.length && wrapped.length > 0, `${pieces.length} links, ${wrapped.length} wrap`)

  // Sampled every frame: which link is under the pointer, and whether the card shows (and whose).
  const start = () => h.evaluate(() => {
    window.__seen = []
    const at = { x: 0, y: 0 }
    document.addEventListener('mousemove', (e) => void ((at.x = e.clientX), (at.y = e.clientY)), { capture: true })
    window.__at = at
    const look = () => {
      const under = document.elementsFromPoint(at.x, at.y).find((el) => el.closest?.('a.tiptap-note-link[data-note]'))?.closest('a.tiptap-note-link[data-note]')?.getAttribute('data-note') ?? null
      const card = document.querySelector('[data-note-preview]')
      window.__seen.push({ under, card: !!card, title: card?.querySelector('[data-preview-title]')?.textContent ?? null, x: at.x, y: at.y, top: document.elementFromPoint(at.x, at.y)?.className?.toString().slice(0, 30) })
      window.__frame = requestAnimationFrame(look)
    }
    look()
  })
  const stop = () => h.evaluate(() => (cancelAnimationFrame(window.__frame), window.__seen))
  // A card that went while the pointer stayed on one pill, and came back.
  const flickers = (seen) => {
    let n = 0
    for (let i = 2; i < seen.length; i++) {
      const [a, b, now] = [seen[i - 2], seen[i - 1], seen[i]]
      if (a.under && a.under === b.under && b.under === now.under && a.card && !b.card) n++
    }
    return n
  }
  const rest = async (x, y, name) => {
    await h.mouse.move(x - 40, y + 30); await wait(400)
    await start()
    await h.mouse.move(x, y, { steps: 6 })
    await wait(3000)
    const seen = await stop()
    const shownAt = seen.findIndex((one) => one.card)
    const hides = seen.slice(shownAt).filter((one, i, all) => i && all[i - 1].card && !one.card).length
    check(`${name}: the card shows and stays`, shownAt >= 0 && hides === 0 && seen[seen.length - 1].card, `${seen.length} frames, shown from frame ${shownAt}, ${hides} hides`)
  }
  const one = wrapped[0]
  await rest(one.rects[0].x + one.rects[0].w / 2, one.rects[0].y + one.rects[0].h / 2, 'resting on the first line of a pill that wraps')
  await h.mouse.move(5, 5, { steps: 3 }); await wait(900)
  await rest(one.rects[1].x + Math.min(20, one.rects[1].w / 2), one.rects[1].y + one.rects[1].h / 2, 'resting on its second line')
  await h.mouse.move(5, 5, { steps: 3 }); await wait(900)

  // Slowly along every pill, line by line, a few pixels a frame.
  const lines = [...new Set(pieces.flatMap((p) => p.rects.map((r) => Math.round(r.y + r.h / 2))))].sort((a, b) => a - b)
  const left = Math.min(...pieces.flatMap((p) => p.rects.map((r) => r.x)))
  const right = Math.max(...pieces.flatMap((p) => p.rects.map((r) => r.x + r.w)))
  await h.mouse.move(left - 10, lines[0]); await wait(300)
  await start()
  for (const y of lines) {
    await h.mouse.move(left, y, { steps: 4 })
    for (let x = left; x <= right; x += 6) { await h.mouse.move(x, y); await wait(20) }
  }
  await wait(600)
  const seen = await stop()
  const n = flickers(seen)
  if (process.env.QA_DEBUG) for (let i = 2; i < seen.length; i++) if (seen[i - 2].under && seen[i - 2].under === seen[i].under && seen[i - 2].card && !seen[i - 1].card) console.log(JSON.stringify(seen.slice(i - 6, i + 8).map((one) => [one.under?.slice(-4), one.card, one.title?.slice(0, 12), one.x, one.y, one.top])))
  check('moving slowly along the pills on both lines: no card goes and comes back over one pill', n === 0, `${n} flickers in ${seen.length} frames`)
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally { await c.close?.() }
done()
