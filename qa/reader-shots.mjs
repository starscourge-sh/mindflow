// Link card pictures, page width and the way out of Read, in light and dark.
import { sandbox } from './sandbox-lib.mjs'
const OUT = '/private/tmp/claude-501/-Users-starscourge-Documents-forge-mindflow/703b99ba-c755-40e3-a385-896560d19061/scratchpad/reader'
const s = await sandbox({ width: 1200, height: 800 })
const { h, electron, errors } = s
const shot = (name, p = h) => p.screenshot({ path: `${OUT}/${name}.png` })
const log = (...a) => console.log(...a)
try {
  // A YouTube-shaped thumbnail: 4:3 with black bands baked in, like hqdefault.jpg.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><rect width="480" height="360" fill="#000"/><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#e64a19"/><stop offset="1" stop-color="#1e88e5"/></linearGradient></defs><rect y="45" width="480" height="270" fill="url(#g)"/><circle cx="240" cy="180" r="40" fill="#fff"/></svg>`
  const image = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')
  const body = { type: 'doc', content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'A talk worth watching' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Kept for the part about attention, about twenty minutes in. The rest is good too, and the questions at the end are better than the talk.' }] },
    { type: 'bookmark', attrs: { href: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'How we pay attention', description: 'A lecture on attention and reading, with questions.', image, site: 'YouTube' } },
    { type: 'paragraph', content: [{ type: 'text', text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.' }] },
  ] }
  const id = await h.evaluate((b) => window.api.captures.create({ kind: 'note', body: b }).then((c) => c.id ?? c), body)
  log('capture', id)
  const open = async () => { await s.send('capture', id); await h.waitForTimeout(1500) }
  for (const theme of ['light', 'dark']) {
    await s.theme(theme)
    await h.evaluate(() => window.api.vigil('settings:set', { linkPictures: 'fill', pageWidth: 'narrow' }))
    await open()
    await shot(`1-card-fill-${theme}`)
    log(theme, 'fit', await h.evaluate(() => getComputedStyle(document.querySelector('.tiptap-bookmark-image')).objectFit))
    await h.evaluate(() => window.api.vigil('settings:set', { linkPictures: 'whole' }))
    await h.waitForTimeout(600)
    log(theme, 'fit whole', await h.evaluate(() => getComputedStyle(document.querySelector('.tiptap-bookmark-image')).objectFit))
    await shot(`1-card-whole-${theme}`)
    await h.evaluate(() => window.api.vigil('settings:set', { linkPictures: 'fill' }))
    // Page width from the header.
    for (const w of ['Narrow', 'Wide', 'Full']) {
      await h.click('button[aria-label="Page width"]')
      await h.waitForTimeout(300)
      if (w === 'Wide') await shot(`2-width-menu-${theme}`)
      await h.getByRole('menuitemradio', { name: w }).click()
      await h.waitForTimeout(600)
      log(theme, w, await h.evaluate(() => [document.documentElement.dataset.width, Math.round(document.querySelector('.note-pane .tiptap.ProseMirror.mindflow-editor').getBoundingClientRect().width)]))
      await shot(`2-width-${w}-${theme}`)
    }
    await h.evaluate(() => window.api.vigil('settings:set', { pageWidth: 'narrow' }))
    // Read, and out of it.
    await h.evaluate(() => localStorage.removeItem('readExitTold'))
    await h.click('button[aria-label="Read"]')
    await h.waitForTimeout(900)
    await shot(`3-read-hint-${theme}`)
    await h.waitForTimeout(5000)
    await shot(`3-read-quiet-${theme}`)
    await h.keyboard.press('Escape')
    await h.waitForTimeout(500)
    log(theme, 'esc closes read', await h.evaluate(() => !document.querySelector('[aria-label="Reading"]')))
    await h.click('button[aria-label="Read"]')
    await h.waitForTimeout(800)
    await h.getByRole('button', { name: 'Done reading' }).click()
    await h.waitForTimeout(500)
    log(theme, 'button closes read', await h.evaluate(() => !document.querySelector('[aria-label="Reading"]')))
  }
  // Settings rows.
  await s.go('settings')
  await h.evaluate(() => [...document.querySelectorAll('h3, [data-setting]')].find((e) => e.textContent.includes('Page width'))?.scrollIntoView({ block: 'center' }))
  await h.waitForTimeout(500)
  await shot('4-settings-dark')
  // The note window.
  await h.evaluate((id) => window.api.vigil('notes:window', 'capture', id), id)
  let w
  for (let i = 0; i < 30 && !w; i++) { w = electron.windows().find((x) => x.url().includes('note=')); if (!w) await h.waitForTimeout(300) }
  await w.waitForTimeout(1800)
  await w.click('button[aria-label="Page width"]')
  await w.waitForTimeout(300)
  await w.getByRole('menuitemradio', { name: 'Wide' }).click()
  await w.waitForTimeout(600)
  log('note window wide', await w.evaluate(() => document.documentElement.dataset.width), 'main follows', await h.evaluate(() => document.documentElement.dataset.width))
  await shot('5-note-window-wide-dark', w)
  await w.click('button[aria-label="Read"]')
  await w.waitForTimeout(900)
  await shot('5-note-window-read-dark', w)
  await w.keyboard.press('Escape')
  await w.waitForTimeout(500)
  log('note window esc closes read', await w.evaluate(() => !document.querySelector('[aria-label="Reading"]')))
  await h.evaluate(() => window.api.vigil('settings:set', { pageWidth: 'narrow' }))
  log('errors', errors.slice(0, 5))
} catch (e) { console.error(e) } finally { await s.close() }
