// The reader card (Settings, Appearance, "You"): a cream card the same in every theme, the book's name, a drawn title, the
// day the book began, and only the stamps reached. "Randomize" draws another title and colours, kept after a reload; "Copy
// as image" puts a PNG of the card alone on the clipboard, its corners see-through (what was there is put back at the end);
// ⌘K's "Your reader card" opens it. The card sits beside its title and line, its picture (a coolshape, or two bands) has a
// film grain that is in the PNG too, and it tips toward the pointer and lies flat again when the pointer leaves (not with
// Motion off), its picture and name standing off the paper as it tips, the picture's shadow on it. Pictures of the row in paper, light, dark and catppuccin, of three draws, and of the bands.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-p/main/index.js HALIGTREE_QA_AWAY=1 [SHOTS=<dir>] node qa/reader-card.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
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
  await electron.evaluate(({ clipboard }) => clipboard.clear())
  await h.locator('[data-reader-copy]').click(); await wait(1500)
  const shape = await h.evaluate(() => document.querySelector('[data-reader-card]').dataset.picture === 'shape')
  return electron.evaluate(async ({ clipboard, nativeImage }, shape) => {
    for (const item of await clipboard.read()) {
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
      // In the top band, or the middle of the shape; and the cream margin beside the picture.
      return { size, corner: at(0, 0), inside: at(Math.round(8 * scale), Math.round(2 * scale)), grain: shape ? steps(115, 102) : steps(60, 30), cream: steps(2, 150, 8) }
    }
    return null
  }, shape)
}
// The card's transform as drawn: "none", or how far it is turned.
const turned = () => h.evaluate(() => {
  const at = getComputedStyle(document.querySelector('[data-reader-card]')).transform
  if (at === 'none') return 0
  const m = new DOMMatrix(at)
  return +(Math.abs(Math.asin(Math.max(-1, Math.min(1, m.m13)))) * 180 / Math.PI + Math.abs(Math.asin(Math.max(-1, Math.min(1, m.m23)))) * 180 / Math.PI).toFixed(2)
})
// How far the picture and name layers stand moved from their place on the paper, and how much the picture's shadow shows.
const layers = () => h.evaluate(() => {
  const moved = (el) => { const m = new DOMMatrix(getComputedStyle(el).transform); return { x: +m.m41.toFixed(2), y: +m.m42.toFixed(2) } }
  return {
    picture: moved(document.querySelector('[data-reader-layer="picture"]')),
    name: moved(document.querySelector('[data-reader-layer="name"]')),
    shadow: +Number(getComputedStyle(document.querySelector('[data-reader-shadow]')).opacity).toFixed(2)
  }
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
    nameLines: (() => { const one = at.querySelector('[data-reader-name]'); return Math.round(one.getBoundingClientRect().height / parseFloat(getComputedStyle(one).lineHeight)) })(),
    nameCut: (() => { const one = at.querySelector('[data-reader-name]'); return one.scrollHeight > one.clientHeight + parseFloat(getComputedStyle(one).lineHeight) / 2 })(),
    size: (() => { const box = at.getBoundingClientRect(); return `${Math.round(box.width)}x${Math.round(box.height)}` })(),
    seen: (() => { const box = at.getBoundingClientRect(); return box.top >= 0 && box.bottom <= innerHeight })(),
    // The tag's right edge and "Commonplace Book"'s left, to see they never run into each other.
    gap: Math.round(at.querySelector('[data-reader-book]').getBoundingClientRect().left - at.querySelector('[data-reader-since]').getBoundingClientRect().right)
  }
})

// What the clipboard held before the run, to put back after.
await electron.evaluate(async ({ clipboard }) => {
  const kept = []
  for (const item of await clipboard.read()) {
    const one = {}
    for (const type of item.types) one[type] = await item.getType(type).catch(() => null)
    kept.push(Object.fromEntries(Object.entries(one).filter(([, blob]) => blob instanceof Blob)))
  }
  globalThis.__keptClipboard = kept.filter((one) => Object.keys(one).length)
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
  check('the day the book began, in the tag', first?.since === `Haligtree${day}`, `${first?.since} / ${day}`)
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
  const lifted = await layers()
  if (process.env.SHOTS) await h.screenshot({ path: `${process.env.SHOTS}/reader-card-tipped.png`, clip: { x: held.x - 40, y: held.y - 40, width: held.width + 80, height: held.height + 80 } })
  await h.mouse.move(held.x - 200, held.y + held.height / 2, { steps: 4 }); await wait(1200)
  const after = await turned()
  const settled = await layers()
  check('it tips toward the pointer, and lies flat when it leaves', tipped > 2 && after < 0.1, `${tipped}° then ${after}°`)
  // Layers: the picture stands furthest off the paper and slides most, toward the side that comes forward (up and right,
  // with the pointer up and right); the name a little; the picture's shadow shows on the paper. All flat again after.
  check('tipped, the picture slides more than the name, both toward the pointer, its shadow on the paper', lifted.picture.x > 2 && lifted.picture.y < -1 && lifted.name.x > 0.5 && lifted.picture.x > lifted.name.x * 2 && lifted.shadow > 0.5, JSON.stringify(lifted))
  check('flat again, the layers lie on the paper and the shadow is gone', Math.abs(settled.picture.x) < 0.1 && Math.abs(settled.name.x) < 0.1 && settled.shadow < 0.05, JSON.stringify(settled))
  // Not with Motion off.
  await h.evaluate(() => (document.documentElement.dataset.motion = 'off'))
  await h.mouse.move(held.x + held.width / 2, held.y + held.height / 2)
  await h.mouse.move(held.x + held.width * 0.85, held.y + held.height * 0.2, { steps: 6 }); await wait(600)
  const calm = await turned()
  const flat = await layers()
  await h.mouse.move(held.x - 200, held.y + held.height / 2)
  await h.evaluate(() => delete document.documentElement.dataset.motion)
  check('with Motion off it stays flat, its layers too', calm < 0.1 && Math.abs(flat.picture.x) < 0.1 && flat.shadow < 0.05, `${calm}°, ${JSON.stringify(flat)}`)
  await shot('reader-card-github')
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

  const box = await h.locator('[data-reader-card]').boundingBox()
  for (const look of ['shape', 'bands']) {
    if ((await h.evaluate(() => document.querySelector('[data-reader-card]').dataset.picture)) !== look) (await h.locator('[data-reader-picture]').click(), await wait(900))
    const corners = await copied()
    const size = corners?.size
    check(`"Copy as image" puts a PNG of the card on the clipboard (${look})`, !!size && Math.abs(size.width / size.height - box.width / box.height) < 0.05, `${JSON.stringify(size)} for ${Math.round(box.width)}x${Math.round(box.height)}`)
    check(`its picture has a grain in the PNG, the cream none (${look})`, corners?.grain > 2.5 && corners?.cream < 1, JSON.stringify(corners && { grain: corners.grain, cream: corners.cream }))
    check(`its corners see-through and its edge cream (${look})`, corners?.corner[3] === 0 && corners?.inside[3] === 255 && corners.inside[2] > 245 && corners.inside[1] > 240 && corners.inside[0] > 220, JSON.stringify(corners && { corner: corners.corner, inside: corners.inside }))
    await shot(`reader-card-${look}`)
  }
  // Back to the shape, the default.
  await h.locator('[data-reader-picture]').click(); await wait(600)

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
    const card = document.querySelector('[data-reader-card]').getBoundingClientRect()
    return { below: Math.round(card.top - words.bottom), offCentre: Math.round(card.left + card.width / 2 - (row.left + row.width / 2)) }
  })
  check('on a narrow pane the card sits under its words, centred', stacked.below > 0 && Math.abs(stacked.offCentre) < 12, JSON.stringify(stacked))
  await shot('reader-card-narrow')
  await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((one) => one.isVisible() && one.getSize()[0] === 760)?.setSize(1300, 900)); await wait(800)
  for (let i = 1; i <= 4; i++) (await h.locator('[data-reader-randomize]').click(), await wait(1000), await shot(`reader-card-draw-${i}`))
  await h.locator('[data-reader-picture]').click(); await wait(900)
  for (let i = 1; i <= 2; i++) (await h.locator('[data-reader-randomize]').click(), await wait(1000), await shot(`reader-card-bands-draw-${i}`))
  check('no page errors', !c.errors?.some((one) => /PAGEERROR/.test(one)), (c.errors ?? []).slice(0, 2).join(' | '))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await electron.evaluate(async ({ clipboard, ClipboardItem }) => {
    const kept = globalThis.__keptClipboard ?? []
    if (kept.length) await clipboard.write(kept.map((one) => new ClipboardItem(one)))
    else clipboard.clear()
  }).catch((error) => console.log('  could not put the clipboard back:', error.message))
  await c.close?.()
}
done()
