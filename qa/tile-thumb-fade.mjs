// Home's tiles and cards and a list's grid covers fade their picture out over about 300ms when their note's
// pictures are taken away, as list rows do (qa/row-thumb-fade.mjs): the first frame without the picture still
// shows it over the cover or icon that replaces it, then it fades over several frames and is gone. Every frame
// the window paints is read, and with SHOTS=<dir> the tile is filmed every 50ms.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox [SHOTS=<dir>] node qa/tile-thumb-fade.mjs
import { mkdirSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
const { check, done } = checks()
const s = await sandbox({ width: 1300, height: 860 })
const { h, v, close } = s
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.SHOTS
if (shots) mkdirSync(shots, { recursive: true })

/** A body with every picture taken out, so the note has none. */
const noPictures = (node) => node && typeof node === 'object'
  ? { ...node, ...(node.content ? { content: node.content.filter((one) => !/image/i.test(one.type)).map(noPictures) } : {}) }
  : node

/** The tile `sel` filmed from now for 1.5s: in each frame, the leaving picture's strength and its own picture (none: its cover or icon). */
const film = async (sel, name) => {
  await h.evaluate((sel) => {
    const out = (window.__film = [])
    const start = performance.now()
    const tick = () => {
      const tile = document.querySelector(sel)
      const leaving = tile?.querySelector('[data-picture-leaving]')
      const own = tile && [...tile.querySelectorAll('img')].find((img) => !img.hasAttribute('data-picture-leaving') && !img.hasAttribute('aria-hidden'))?.getAttribute('src')?.slice(-16)
      out.push({ t: Math.round(performance.now() - start), leaving: leaving ? +(+getComputedStyle(leaving).opacity).toFixed(2) : null, own: own ?? null })
      if (performance.now() - start < 1500) requestAnimationFrame(tick)
    }
    tick()
  }, sel)
  // Filmed from before the change (the old picture first), a picture every 50ms, while the change is made.
  const filming = shots ? (async () => { for (let at = 0; at < 24; at++) { await h.locator(sel).first().screenshot({ path: `${shots}/${name}-${String(at).padStart(2, '0')}.png`, animations: 'allow' }).catch(() => {}); await wait(50) } })() : null
  if (shots) await wait(150)
  return async () => {
    await filming
    await wait(1600)
    return h.evaluate(() => window.__film)
  }
}

const judge = (where, run) => {
  const said = run.filter((f, i) => i === 0 || f.leaving !== run[i - 1].leaving || f.own !== run[i - 1].own).map((f) => `${f.t}ms ${f.leaving === null ? 'no old' : 'old ' + f.leaving} ${f.own ? 'pic ' + f.own : 'cover'}`).join(', ')
  console.log(`${where}: ${said}`)
  const goneAt = run.findIndex((f) => f.own !== run[0].own)
  const mid = run.filter((f) => f.leaving !== null && f.leaving > 0.1 && f.leaving < 0.9)
  check(`${where}: its picture changes or goes`, goneAt >= 0, `at frame ${goneAt}`)
  check(`${where}: the first frame after still shows the old one over it, at full strength`, goneAt >= 0 && run[goneAt].leaving !== null && run[goneAt].leaving > 0.8, JSON.stringify(run[goneAt]))
  check(`${where}: it fades over several frames, then is gone`, mid.length >= 3 && run.at(-1).leaving === null, `${mid.length} frames part-way, ends ${JSON.stringify(run.at(-1))}`)
  const lasted = run.filter((f) => f.leaving !== null)
  if (lasted.length) check(`${where}: the fade takes about 300ms`, lasted.at(-1).t - lasted[0].t >= 220 && lasted.at(-1).t - lasted[0].t <= 420, `${lasted[0].t} to ${lasted.at(-1).t}ms`)
}

const strip = async (type, id) => {
  if (type === 'capture') {
    const note = await h.evaluate((id) => window.api.captures.get(id), id)
    await h.evaluate(([id, body]) => window.api.captures.save(id, { body }), [id, noPictures(typeof note.body === 'string' ? JSON.parse(note.body) : note.body)])
  } else {
    const gem = await v('item', id)
    if (gem?.body) await v('item:save', id, { body: noPictures(typeof gem.body === 'string' ? JSON.parse(gem.body) : gem.body) })
  }
}

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  // Home: the first card or tile on show with a picture of its own.
  await s.go('home')
  await wait(1500)
  const target = await h.evaluate(() => {
    for (const button of document.querySelectorAll('[data-drag-open]:not([data-drag-open^="task:"])')) {
      // Its own picture (Picture, private-text), not the drawn paper cover a pictureless card wears (GrainFill).
      const img = [...button.querySelectorAll('img.private-text')][0]
      if (img && img.getBoundingClientRect().width > 20) { button.scrollIntoView({ block: 'center' }); button.setAttribute('data-qa-film', 'home'); return button.getAttribute('data-drag-open') }
    }
    return null
  })
  check('Home: a tile with its own picture', !!target, String(target))
  if (target) {
    const [type, id] = target.split(':')
    const sel = '[data-qa-film="home"]'
    await wait(400)
    const stop = await film(sel, 'home')
    await strip(type === 'capture' ? 'capture' : 'item', id)
    judge('Home', await stop())
  }

  // A grid: Pages drawn as tiles (Cover in note-list.tsx), picked in Display's "View as" as a person picks it.
  await s.go('articles')
  await wait(1200)
  for (const name of ['History', 'Renaissance']) {
    const one = (await v('groups', 'article')).find((group) => group.name === name)
    const side = one && h.locator(`[data-side-folder="${one.id}"]`).first()
    if (side && (await side.count())) { await side.click(); await wait(700) }
  }
  await h.locator('[data-page] header button[data-display]').first().click()
  await wait(500)
  await h.locator('button[aria-pressed]', { hasText: /^Grid$/ }).first().click()
  await wait(300)
  await h.keyboard.press('Escape')
  await wait(1500)
  const tile = await h.evaluate(() => {
    for (const img of document.querySelectorAll('[data-tile-picture]')) {
      const row = img.closest('[data-id]')
      if (row && img.getBoundingClientRect().width > 20) { row.scrollIntoView({ block: 'center' }); row.setAttribute('data-qa-film', 'grid'); return row.getAttribute('data-id') }
    }
    return null
  })
  check('grid: a cover with its own picture', !!tile, String(tile))
  if (tile) {
    await wait(400)
    const stop = await film('[data-qa-film="grid"]', 'grid')
    await strip('item', tile)
    judge('grid cover', await stop())
  }
} catch (e) { check('ran', false, e.message.split('\n')[0]) }
await close()
done()
