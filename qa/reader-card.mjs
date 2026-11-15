// The reader card (Settings, "Your book"): a cream card the same in every theme, the book's name, a drawn title, the
// day the book began, and only the stamps reached. "Randomize" draws another title and colours, kept after a reload; "Copy
// as image" puts a PNG of the card alone on the clipboard, its corners see-through (what was there is put back at the end);
// ⌘K's "Your reader card" opens it. The card sits beside its title and line, its picture (a coolshape) has a
// film grain that is in the PNG too, and it tips toward the pointer and lies flat again when the pointer leaves (not with
// Motion off). Pictures of the row in paper, light, dark and catppuccin, of three draws.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-p/main/index.js HALIGTREE_QA_AWAY=1 [SHOTS=<dir>] node qa/reader-card.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
import { clearBoard } from './pasteboard.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, v, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
// The whole row: the title and its line, the card and its buttons, with room around them.
const shot = async (name) => {
  if (!process.env.SHOTS) return
  const box = await h.locator('[data-setting-title="Reader card"]').boundingBox()
  await h.screenshot({ path: `${process.env.SHOTS}/${name}.png`, clip: { x: box.x - 20, y: box.y - 20, width: box.width + 40, height: box.height + 40 } })
}
// The card as "Copy as image" makes it, read off the clipboard: its size, a corner, the cream by it, and how grainy a
// patch of its picture is (the mean step in green from one pixel to the next: a smooth gradient steps by under 1).
const copied = async () => {
  await clearBoard(electron)
  await h.locator('[data-reader-copy]').click(); await wait(1500)
  return electron.evaluate(async ({ nativeImage }) => {
    for (const item of await globalThis.qaPasteboard.read()) {
      if (!item.types.includes('image/png')) continue
      const image = nativeImage.createFromBuffer(Buffer.from(await (await item.getType('image/png')).arrayBuffer()))
      const size = image.getSize()
      const bits = image.toBitmap()
      const scale = size.width / 250
      const at = (x, y) => [...bits.subarray((y * size.width + x) * 4, (y * size.width + x) * 4 + 4)]
      // toBitmap is BGRA: green is [1].
      const steps = (left, top, wide = 20) => {
        let sum = 0, count = 0
        for (let y = Math.round(top * scale); y < Math.round((top + 20) * scale); y++)
          for (let x = Math.round(left * scale); x < Math.round((left + wide) * scale); x++) (sum += Math.abs(at(x + 1, y)[1] - at(x, y)[1])), count++
        return +(sum / count).toFixed(2)
      }
      // The middle of the shape, and the cream margin beside the picture.
      return { size, corner: at(0, 0), inside: at(Math.round(40 * scale), Math.round(3 * scale)), grain: steps(115, 102), cream: steps(2, 150, 8) }
    }
    return null
  })
}
// The card's transform as drawn: "none", or how far it is turned.
const turned = () => h.evaluate(() => {
  const at = getComputedStyle(document.querySelector('[data-reader-card]').parentElement).transform
  if (at === 'none') return 0
  const m = new DOMMatrix(at)
  return +(Math.abs(Math.asin(Math.max(-1, Math.min(1, m.m13)))) * 180 / Math.PI + Math.abs(Math.asin(Math.max(-1, Math.min(1, m.m23)))) * 180 / Math.PI).toFixed(2)
})
const card = () => h.evaluate(() => {
  const at = document.querySelector('[data-reader-card]')
  if (!at) return null
  return {
    name: at.querySelector('[data-reader-name]')?.textContent.trim(),
    title: at.querySelector('[data-reader-title]')?.getAttribute('data-reader-title'),
    since: at.querySelector('[data-reader-since]')?.textContent.trim(),
    stamps: [...at.querySelectorAll('[data-reader-stamp]')].map((one) => one.getAttribute('data-reader-stamp')),
    hues: at.getAttribute('data-hues'),
    paper: getComputedStyle(at).backgroundColor,
    ink: getComputedStyle(at).color,
    nameLines: (() => { const one = at.querySelector('[data-reader-name]'); return Math.round(one.offsetHeight / parseFloat(getComputedStyle(one).lineHeight)) })(),
    nameCut: (() => { const one = at.querySelector('[data-reader-name]'); return one.scrollHeight > one.clientHeight + parseFloat(getComputedStyle(one).lineHeight) / 2 })(),
    // Its own size: on screen it stands turned, a book in 3D, so its box on the page is narrower and taller.
    size: `${at.offsetWidth}x${at.offsetHeight}`,
    seen: (() => { const box = at.getBoundingClientRect(); return box.top >= 0 && box.bottom <= innerHeight })(),
    // The tag's right edge and "Commonplace Book"'s left, to see they never run into each other.
    // Apart either across or down: the tag sits under the stamps and "Commonplace Book" now, on the book's narrower cover.
    gap: (() => { const [a, b] = [at.querySelector('[data-reader-book]').getBoundingClientRect(), at.querySelector('[data-reader-since]').getBoundingClientRect()]; return Math.round(Math.max(a.left - b.right, b.left - a.right, a.top - b.bottom, b.top - a.bottom)) })()
  }
})

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const facts = await v('reader:card')
  const shelf = await v('books:list')
  // Opened from ⌘K, from another page.
  await c.go('inbox')
  await h.keyboard.press('Meta+k'); await wait(500)
  await h.keyboard.type('Your reader card'); await wait(500)
  await h.keyboard.press('Enter'); await wait(1800)
  const first = await card()
  check('⌘K "Your reader card" opens Settings with the card in view', !!first?.seen, JSON.stringify(first))
  check('the card shows the book\'s name', first?.name === shelf.name, `${first?.name} / ${shelf.name}`)
  check('a title of two or three words in capitals', /^[A-Z][a-z]+(-[A-Z][a-z]+)?( [A-Z][a-z]+)+$/.test(first?.title ?? ''), first?.title)
  const day = new Date(facts.since).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).replace('Sept', 'Sep')
  check('the day the book began, in the tag', first?.since === `Kept since ${day}`, `${first?.since} / ${day}`)
  check('a cream card of 250 by 375', first?.paper === 'rgb(255, 251, 234)' && first?.size === '250x375', `${first?.paper} ${first?.size}`)
  check('the name whole, on two lines at most', !first?.nameCut && first?.nameLines <= 2, `${first?.nameLines} lines, cut ${first?.nameCut}`)
  const year = Date.now() - new Date(facts.since).getTime() >= 365 * 86400000
  const reached = [facts.notes >= 100 && 'A hundred notes', facts.linked && 'A note linked to another', facts.reviewed && 'A first gem reviewed', facts.journal >= 30 && 'Thirty days of Journal', facts.notes >= 1000 && 'A thousand notes', year && 'A year since the book began'].filter(Boolean)
  check("the day's tag and 'Commonplace Book' never touch", first?.gap >= 4, `${first?.gap}px apart`)
  check('only the stamps reached show', JSON.stringify(first?.stamps) === JSON.stringify(reached), `${JSON.stringify(first?.stamps)} from ${JSON.stringify(facts)}`)
  // Beside its words: the title and line on the left, the card on the right, their tops level.
  const row = await h.evaluate(() => {
    const setting = document.querySelector('[data-setting-title="Reader card"]')
    const words = setting.querySelector('.text-body').getBoundingClientRect()
    const card = document.querySelector('[data-reader-card]').getBoundingClientRect()
    return { wordsRight: Math.round(words.right), cardLeft: Math.round(card.left), wordsTop: Math.round(words.top), cardTop: Math.round(card.top) }
  })
  check('the card sits beside its title, on the right, tops level', row.cardLeft > row.wordsRight && Math.abs(row.cardTop - row.wordsTop) < 24, JSON.stringify(row))
  // It tips toward the pointer, then lies flat again when the pointer leaves.
  const held = await h.locator('[data-reader-card]').boundingBox()
  await h.mouse.move(held.x + held.width / 2, held.y + held.height / 2)
  await h.mouse.move(held.x + held.width * 0.85, held.y + held.height * 0.2, { steps: 6 }); await wait(600)
  const tipped = await turned()
  await h.mouse.move(held.x - 200, held.y + held.height / 2, { steps: 4 }); await wait(1200)
  const after = await turned()
  // A book: it faces you while pointed at and leans to the pointer; left, it turns back to stand with its spine to you.
  check('it tips toward the pointer, and turns back to stand spine-on when it leaves', tipped > 2 && after > 30 && after < 50, `${tipped}° then ${after}°`)
  // Grabbed and dragged it turns in the hand, round to its back; let go, it eases home to stand spine-on again.
  await h.mouse.move(held.x + held.width / 2, held.y + held.height / 2)
  await h.mouse.down()
  await h.mouse.move(held.x + held.width / 2 + 260, held.y + held.height / 2, { steps: 12 }); await wait(200)
  const spun = await h.evaluate(() => document.querySelector('[data-reader-back]').getBoundingClientRect().width > 60 && getComputedStyle(document.querySelector('[data-reader-card]').parentElement).transform !== 'none')
  await h.mouse.up(); await h.mouse.move(held.x - 200, held.y + held.height / 2, { steps: 4 }); await wait(2000)
  const home = await turned()
  check('dragged, it turns round in the hand; let go, it eases home', spun && home > 30 && home < 50, `${spun} then ${home}°`)
  // Not with Motion off.
  await h.evaluate(() => (document.documentElement.dataset.motion = 'off'))
  await h.mouse.move(held.x + held.width / 2, held.y + held.height / 2)
  await h.mouse.move(held.x + held.width * 0.85, held.y + held.height * 0.2, { steps: 6 }); await wait(600)
  const calm = await turned()
  await h.mouse.move(held.x - 200, held.y + held.height / 2)
  await h.evaluate(() => delete document.documentElement.dataset.motion)
  check('with Motion off it stays flat', calm < 0.1, `${calm}°`)
  await shot('reader-card-github')
  // The book as a hardback: its light follows how each face stands to a light above and to the right, its shadow
  // follows its turn, and a ribbon hangs from its foot.
  const bookShot = async (name) => {
    if (!process.env.SHOTS) return
    const box = await h.locator('[data-reader-hold]').boundingBox()
    await h.screenshot({ path: `${process.env.SHOTS}/${name}.png`, clip: { x: box.x - 70, y: box.y - 50, width: box.width + 140, height: box.height + 110 } })
  }
  const light = () => h.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-reader-light]')].map((one) => [one.dataset.readerLight, +(+getComputedStyle(one).opacity).toFixed(3)])))
  const shadow = () => h.evaluate(() => getComputedStyle(document.querySelector('[data-reader-shadow]')).transform)
  const shine = () => h.evaluate(() => +(+getComputedStyle(document.querySelector('[data-reader-shine="front"]')).opacity).toFixed(3))
  // In and out again with Motion on, so it stands at rest (it was left facing you with Motion off).
  await h.mouse.move(held.x + held.width / 2, held.y + held.height / 2, { steps: 2 }); await wait(300)
  await h.mouse.move(held.x - 200, held.y + held.height / 2, { steps: 2 }); await wait(1500)
  const rest = { light: await light(), shadow: await shadow(), shine: await shine() }
  await bookShot('book-rest')
  await h.mouse.move(held.x + held.width / 2, held.y + held.height / 2, { steps: 4 }); await wait(1200)
  const faced = { light: await light(), shadow: await shadow(), shine: await shine() }
  await bookShot('book-facing')
  check('at rest the spine, turned from the light, is darker than the cover', rest.light.spine > rest.light.front + 0.2, JSON.stringify(rest.light))
  check('facing you, the cover is shown as printed, no veil on it', faced.light.front < 0.02, JSON.stringify(faced.light))
  check('the shadow and the gloss move as it turns', rest.shadow !== faced.shadow && rest.shine !== faced.shine, `${rest.shadow} / ${faced.shadow}; shine ${rest.shine} / ${faced.shine}`)
  const parts = await h.evaluate(() => {
    const cover = document.querySelector('[data-reader-card]').getBoundingClientRect()
    const ribbon = document.querySelector('[data-reader-ribbon]').getBoundingClientRect()
    return { ribbonBelow: Math.round(ribbon.bottom - cover.bottom), boards: document.querySelectorAll('[data-reader-board]').length }
  })
  check('a ribbon hangs from the foot, and both boards have an edge', parts.ribbonBelow > 20 && parts.boards === 2, JSON.stringify(parts))
  // Held turned to show its spine, its fore-edge and its back: the light on each face as it comes round.
  const centre = { x: held.x + held.width / 2, y: held.y + held.height / 2 }
  for (const [name, dx, dy, face] of [['book-spine', 120, -40, 'spine'], ['book-fore-edge', -110, -40, 'fore'], ['book-back', 300, 0, 'back']]) {
    await h.mouse.move(centre.x, centre.y); await h.mouse.down()
    await h.mouse.move(centre.x + dx, centre.y + dy, { steps: 10 }); await wait(900)
    const lit = await light()
    await bookShot(name)
    check(`held round to its ${face}, that face is lit by how it stands to the light`, lit[face] < rest.light[face] || lit[face] < 0.3, `${lit[face]} (at rest ${rest.light[face]})`)
    await h.mouse.up(); await h.mouse.move(held.x - 200, centre.y, { steps: 2 }); await wait(2600)
  }
  // Thrown: let go mid-swing it carries on the way it was going, slows, and settles home; every frame a small step
  // from the last, and caught again mid-spin it stops under the hand with no jump.
  const angle = 'const m = new DOMMatrix(getComputedStyle(document.querySelector("[data-reader-card]").parentElement).transform); return Math.atan2(m.m31, m.m33) * 180 / Math.PI'
  const record = (ms) => h.evaluate(({ ms, angle }) => new Promise((done) => {
    const read = new Function(angle)
    const frames = []
    const start = performance.now()
    const step = () => (frames.push(read()), performance.now() - start < ms ? requestAnimationFrame(step) : done(frames))
    requestAnimationFrame(step)
  }), { ms, angle })
  await h.mouse.move(centre.x, centre.y); await h.mouse.down()
  for (let i = 1; i <= 8; i++) (await h.mouse.move(centre.x + i * 18, centre.y), await wait(8))
  const thrownAt = await h.evaluate(angle => new Function(angle)(), angle)
  const watching = record(2600)
  await h.mouse.up(); await h.mouse.move(held.x - 200, centre.y)
  const frames = await watching
  // Unwrapped, so a turn past 180° reads on round, not back to -180°.
  const flat = frames.reduce((all, one) => (all.push(all.length ? all.at(-1) + (((one - frames[all.length - 1] + 540) % 360) - 180) : one), all), [])
  // Smooth is no sudden change of speed: a fast spin moves far each frame, a jump moves far in one frame alone.
  const speeds = flat.slice(1).map((one, at) => one - flat[at])
  const steps = speeds.slice(1).map((one, at) => Math.abs(one - speeds[at]))
  const carried = Math.max(...flat.slice(0, 20)) - thrownAt
  check('thrown, it carries on, then settles home, each frame a small step', carried > 15 && Math.max(...steps) < 6 && (await turned()) > 30 && (await turned()) < 50,
    `carried ${carried.toFixed(1)}° past ${thrownAt.toFixed(1)}°, largest change of step ${Math.max(...steps).toFixed(1)}° over ${frames.length} frames, home ${await turned()}°`)
  await h.mouse.move(centre.x, centre.y); await h.mouse.down()
  for (let i = 1; i <= 8; i++) (await h.mouse.move(centre.x + i * 18, centre.y), await wait(8))
  await h.mouse.up(); await wait(120)
  const catching = record(400)
  await h.mouse.move(centre.x + 144, centre.y); await h.mouse.down()
  const caught = await catching
  const moves = caught.slice(1).map((one, at) => ((one - caught[at] + 540) % 360) - 180)
  const jolt = Math.max(...moves.slice(1).map((one, at) => Math.abs(one - moves[at])))
  await h.mouse.up(); await h.mouse.move(held.x - 200, centre.y); await wait(2600)
  check('caught again mid-spin, it stops under the hand with no jump', jolt < 6, `largest change of step ${jolt.toFixed(1)}°`)
  if (process.env.SHOTS) (await import('node:fs')).writeFileSync(`${process.env.SHOTS}/throw-frames.json`, JSON.stringify({ frames: flat, caught }))
  // A long name wraps to a second line, never cut short ("Chapel of Anticipati…" was). The sandbox's book cannot be
  // renamed, so the name is written into the card for the look of it, and put back after.
  const named = (text) => h.evaluate((one) => { document.querySelector('[data-reader-name]').textContent = one }, text)
  await named('Chapel of Anticipation'); await wait(300)
  const long = await card()
  check('a long name wraps to two lines, whole', long?.name === 'Chapel of Anticipation' && long.nameLines === 2 && !long.nameCut, JSON.stringify(long))
  await shot('reader-card-long-name')
  await named(shelf.name)

  await h.locator('[data-reader-randomize]').click(); await wait(900)
  const drawn = await card()
  check('"Randomize" draws another title', drawn.title !== first.title, `${first.title} → ${drawn.title}`)
  const seed = (await v('settings')).readerSeed
  check('and the draw is saved', typeof seed === 'number', String(seed))
  await h.reload(); await wait(2500)
  await c.go('settings'); await wait(800)
  const kept = await card()
  check('kept after a reload', kept?.title === drawn.title && kept?.hues === drawn.hues, `${drawn.title} ${drawn.hues} / ${kept?.title} ${kept?.hues}`)
  // Draws until the colours change too: each draw is a new title, and most a new pair of colours.
  let hues = kept.hues
  for (let i = 0; i < 6 && hues === kept.hues; i++) (await h.locator('[data-reader-randomize]').click(), await wait(600), (hues = (await card()).hues))
  check('"Randomize" draws other colours', hues !== kept.hues, `${kept.hues} → ${hues}`)

  const box = await h.locator('[data-reader-card]').evaluate((one) => ({ width: one.offsetWidth, height: one.offsetHeight }))
  {
    const corners = await copied()
    const size = corners?.size
    check('"Copy as image" puts a PNG of the card on the clipboard', !!size && Math.abs(size.width / size.height - box.width / box.height) < 0.05, `${JSON.stringify(size)} for ${Math.round(box.width)}x${Math.round(box.height)}`)
    // The cover is cloth now (a book's), so it has a grain of its own, finer than the picture's.
    check('its picture has a grain in the PNG, the cover a finer one', corners?.grain > 2.5 && corners?.cream < corners?.grain, JSON.stringify(corners && { grain: corners.grain, cream: corners.cream }))
    check('its corners see-through and its edge cream', corners?.corner[3] === 0 && corners?.inside[3] === 255 && corners.inside[2] > 200 && corners.inside[1] > 215 && corners.inside[0] > 215, JSON.stringify(corners && { corner: corners.corner, inside: corners.inside }))
    check('one picture only: no button swaps it for bands', (await h.locator('[data-reader-picture]').count()) === 0)
    await shot('reader-card-shape')
  }

  for (const theme of ['paper', 'light', 'dark', 'catppuccin']) {
    await c.theme(theme)
    await c.go('settings'); await wait(800)
    await h.locator('[data-reader-card]').scrollIntoViewIfNeeded(); await wait(300)
    const seen = await card()
    check(`the same cream card in ${theme}`, seen?.paper === 'rgb(255, 251, 234)', seen?.paper)
    await shot(`reader-card-${theme}`)
  }
  // On a narrow pane the card drops under its words, in the middle.
  await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((one) => one.isVisible() && one.getSize()[0] >= 1200)?.setSize(760, 900)); await wait(800)
  const stacked = await h.evaluate(() => {
    const words = document.querySelector('[data-setting-title="Reader card"] .text-body').parentElement.getBoundingClientRect()
    const row = document.querySelector('[data-setting-title="Reader card"]').getBoundingClientRect()
    const card = document.querySelector('[data-reader-hold]').getBoundingClientRect()
    return { below: Math.round(card.top - words.bottom), offCentre: Math.round(card.left + card.width / 2 - (row.left + row.width / 2)) }
  })
  check('on a narrow pane the card sits under its words, centred', stacked.below > 0 && Math.abs(stacked.offCentre) < 12, JSON.stringify(stacked))
  await shot('reader-card-narrow')
  await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((one) => one.isVisible() && one.getSize()[0] === 760)?.setSize(1300, 900)); await wait(800)
  for (let i = 1; i <= 4; i++) (await h.locator('[data-reader-randomize]').click(), await wait(1000), await shot(`reader-card-draw-${i}`))
  check('no page errors', !c.errors?.some((one) => /PAGEERROR/.test(one)), (c.errors ?? []).slice(0, 2).join(' | '))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
