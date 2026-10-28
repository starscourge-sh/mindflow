// The reader card (Settings, Appearance, "You"): a cream card the same in every theme, the book's name, a drawn title, the
// day the book began, and only the stamps reached. "Randomize" draws another title and colours, kept after a reload; "Copy
// as image" puts a PNG of the card alone on the clipboard, its corners see-through (what was there is put back at the end);
// ⌘K's "Your reader card" opens it. Pictures of the card in paper, light, dark and catppuccin, and of three draws.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-p/main/index.js HALIGTREE_QA_AWAY=1 [SHOTS=<dir>] node qa/reader-card.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, v, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
// The card and its buttons, with room around them.
const shot = async (name) => {
  if (!process.env.SHOTS) return
  const box = await h.locator('[data-reader-card]').boundingBox()
  await h.screenshot({ path: `${process.env.SHOTS}/${name}.png`, clip: { x: box.x - 60, y: box.y - 40, width: box.width + 120, height: box.height + 110 } })
}
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
    seen: (() => { const box = at.getBoundingClientRect(); return box.top >= 0 && box.bottom <= innerHeight })()
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
  check('a two-word title in capitals', /^[A-Z][a-z]+ [A-Z][a-z]+$/.test(first?.title ?? ''), first?.title)
  const day = new Date(facts.since).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).replace('Sept', 'Sep')
  check('the day the book began, in the tag', first?.since === `Haligtree${day}`, `${first?.since} / ${day}`)
  check('a cream card of 250 by 375', first?.paper === 'rgb(255, 251, 234)' && first?.size === '250x375', `${first?.paper} ${first?.size}`)
  check('the name whole, on two lines at most', !first?.nameCut && first?.nameLines <= 2, `${first?.nameLines} lines, cut ${first?.nameCut}`)
  const year = Date.now() - new Date(facts.since).getTime() >= 365 * 86400000
  const reached = [facts.notes >= 100 && 'A hundred notes', facts.linked && 'A note linked to another', facts.reviewed && 'A first gem reviewed', facts.journal >= 30 && 'Thirty days of Journal', facts.notes >= 1000 && 'A thousand notes', year && 'A year since the book began'].filter(Boolean)
  check('only the stamps reached show', JSON.stringify(first?.stamps) === JSON.stringify(reached), `${JSON.stringify(first?.stamps)} from ${JSON.stringify(facts)}`)
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

  await electron.evaluate(({ clipboard }) => clipboard.clear())
  await h.locator('[data-reader-copy]').click(); await wait(1500)
  const size = await electron.evaluate(async ({ clipboard, nativeImage }) => {
    for (const item of await clipboard.read()) {
      if (!item.types.includes('image/png')) continue
      return nativeImage.createFromBuffer(Buffer.from(await (await item.getType('image/png')).arrayBuffer())).getSize()
    }
    return null
  })
  const box = await h.locator('[data-reader-card]').boundingBox()
  check('"Copy as image" puts a PNG of the card on the clipboard', !!size && Math.abs(size.width / size.height - box.width / box.height) < 0.05, `${JSON.stringify(size)} for ${Math.round(box.width)}x${Math.round(box.height)}`)
  // Its corners see-through, its paper cream just inside them: no window colour caught.
  const corners = await electron.evaluate(async ({ clipboard, nativeImage }) => {
    for (const item of await clipboard.read()) {
      if (!item.types.includes('image/png')) continue
      const image = nativeImage.createFromBuffer(Buffer.from(await (await item.getType('image/png')).arrayBuffer()))
      const { width } = image.getSize()
      const bits = image.toBitmap()
      const scale = image.getSize().width / 250
      const at = (x, y) => [...bits.subarray((y * width + x) * 4, (y * width + x) * 4 + 4)]
      return { corner: at(0, 0), inside: at(Math.round(8 * scale), Math.round(2 * scale)) }
    }
    return null
  })
  // toBitmap is BGRA.
  check('its corners see-through and its edge cream', corners?.corner[3] === 0 && corners?.inside[3] === 255 && corners.inside[2] > 245 && corners.inside[1] > 240 && corners.inside[0] > 220, JSON.stringify(corners))

  for (const theme of ['paper', 'light', 'dark', 'catppuccin']) {
    await c.theme(theme)
    await c.go('settings'); await wait(800)
    await h.locator('[data-reader-card]').scrollIntoViewIfNeeded(); await wait(300)
    const seen = await card()
    check(`the same cream card in ${theme}`, seen?.paper === 'rgb(255, 251, 234)', seen?.paper)
    await shot(`reader-card-${theme}`)
  }
  for (let i = 1; i <= 3; i++) (await h.locator('[data-reader-randomize]').click(), await wait(1000), await shot(`reader-card-draw-${i}`))
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
