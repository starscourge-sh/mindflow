// The reader card (Settings, Appearance, "You"): the book's name, a drawn title, the day the book began, and only the stamps
// reached. "Randomize" draws another title and colours, kept after a reload; "Copy as image" puts a PNG of the card on the
// clipboard (what was there is put back at the end); ⌘K's "Your reader card" opens it. Pictures in light and dark.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-p/main/index.js HALIGTREE_QA_AWAY=1 [SHOTS=<dir>] node qa/reader-card.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, v, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
const shot = (name) => process.env.SHOTS && h.screenshot({ path: `${process.env.SHOTS}/${name}.png` })
const card = () => h.evaluate(() => {
  const at = document.querySelector('[data-reader-card]')
  if (!at) return null
  return {
    name: at.querySelector('[data-reader-name]')?.textContent.trim(),
    title: at.querySelector('[data-reader-title]')?.getAttribute('data-reader-title'),
    since: at.querySelector('[data-reader-since]')?.textContent.trim(),
    stamps: [...at.querySelectorAll('[data-reader-stamp]')].map((one) => one.getAttribute('data-reader-stamp')),
    hues: at.getAttribute('data-hues'),
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
  check('the day the book began', first?.since === `Since ${day}`, `${first?.since} / ${day}`)
  const year = Date.now() - new Date(facts.since).getTime() >= 365 * 86400000
  const reached = [facts.notes >= 100 && 'A hundred notes', facts.linked && 'A note linked to another', facts.reviewed && 'A first gem reviewed', facts.journal >= 30 && 'Thirty days of Journal', facts.notes >= 1000 && 'A thousand notes', year && 'A year since the book began'].filter(Boolean)
  check('only the stamps reached show', JSON.stringify(first?.stamps) === JSON.stringify(reached), `${JSON.stringify(first?.stamps)} from ${JSON.stringify(facts)}`)
  await shot('reader-card-light')

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

  await c.theme('dark')
  await c.go('settings'); await wait(800)
  await h.locator('[data-reader-card]').scrollIntoViewIfNeeded()
  await shot('reader-card-dark')
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
