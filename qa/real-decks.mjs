// Real shared Anki decks the user downloaded (never shipped), imported into a throwaway book to see how they come in, how long each takes, and how Review's Decks shelf and Media show them.
//   DECKS=dir SHOTS=dir QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/real-decks.mjs
import { readdirSync } from 'fs'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'
const dir = process.env.DECKS, shots = process.env.SHOTS
const c = await sandbox({ width: 1400, height: 950 })
const { h, electron, go } = c
const wait = (ms) => h.waitForTimeout(ms)
try {
  await h.evaluate(() => window.api.haligtree('settings:set', { sounds: false, hintRate: 0 }))
  const before = (await h.evaluate(() => window.api.haligtree('items', 'nugget'))).length
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.apkg'))) {
    const t0 = Date.now()
    await electron.evaluate(async ({ dialog, Menu }, path) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
      const find = (menu, label = '') => { for (const one of menu?.items ?? []) { if (one.label === 'Files…' && /import/i.test(label)) return one; const deep = find(one.submenu, one.label); if (deep) return deep } return null }
      find(Menu.getApplicationMenu())?.click()
    }, join(dir, name))
    let notice = ''
    let asked = ''
    for (let i = 0; i < 600 && !notice; i++) {
      await wait(500)
      // A big deck or one with someone's reviews asks first, in the app's own sheet: answered as suggested.
      const sheet = await h.evaluate(() => document.querySelector('[data-apkg-ask]')?.innerText ?? '')
      if (sheet && !asked) (asked = sheet, await h.screenshot({ path: join(shots, `ask-${name.slice(0, 12)}.png`) }), await h.evaluate(() => document.querySelector('[data-apkg-go]')?.click()))
      notice = await h.evaluate(() => document.querySelector('[data-import-done]')?.innerText ?? '')
    }
    if (asked) console.log(`asked: ${asked.replace(/\n+/g, ' | ')}`)
    console.log(`== ${name}: ${((Date.now() - t0) / 1000).toFixed(1)}s\n${notice.replace(/\n+/g, ' | ')}`)
    await h.screenshot({ path: join(shots, `notice-${name.slice(0, 12)}.png`) })
    await h.keyboard.press('Escape'); await wait(800)
  }
  const all = await h.evaluate(() => window.api.haligtree('items', 'nugget'))
  console.log('cards added:', all.length - before)
  const sample = all.slice(-400).filter((x) => x.prompt).sort(() => 0.5 - Math.random()).slice(0, 8).map((x) => ({ prompt: (x.prompt || '').slice(0, 140), title: (x.title || '').slice(0, 80) }))
  console.log(JSON.stringify(sample, null, 1))
  await go('review'); await wait(2500)
  await h.screenshot({ path: join(shots, 'review-1.png') })
  for (let i = 2; i <= 4; i++) { await h.keyboard.press('Space'); await wait(1200); await h.screenshot({ path: join(shots, `review-${i}a.png`) }); await h.keyboard.press('3'); await wait(1200) }
  await go('media'); await wait(2000); await h.screenshot({ path: join(shots, 'media.png') })
  await go('review'); await wait(1500)
  await h.evaluate(() => document.querySelector('[data-review-tab="decks"]')?.click()); await wait(1500)
  console.log('shelf:', (await h.evaluate(() => document.querySelector('[data-deck-shelf]')?.innerText ?? '')).replace(/\n+/g, ' | '))
  await h.screenshot({ path: join(shots, 'decks.png') })
  // Light and dark, beside Review's other pages and Gems.
  const theme = (dark) => c.theme(dark ? 'dark' : 'light')
  await theme(true); await go('review'); await wait(1200)
  await h.evaluate(() => document.querySelector('[data-review-tab="decks"]')?.click()); await wait(1200)
  await h.screenshot({ path: join(shots, 'decks-dark.png') })
  for (const tab of ['today', 'cards']) { await h.evaluate((tab) => document.querySelector(`[data-review-tab="${tab}"]`)?.click(), tab); await wait(1200); await h.screenshot({ path: join(shots, `review-${tab}-dark.png`) }) }
  await go('nuggets'); await wait(1500); await h.screenshot({ path: join(shots, 'gems-dark.png') })
  await theme(false)
  await go('nuggets'); await wait(1500); await h.screenshot({ path: join(shots, 'gems.png') })
  // The art deck's gallery, and a card opened from it.
  await go('review'); await wait(1200)
  await h.evaluate(() => document.querySelector('[data-review-tab="decks"]')?.click()); await wait(1200)
  await h.evaluate(() => document.querySelector('[data-deck-gallery]')?.click()); await wait(2500)
  console.log('gallery tiles:', await h.evaluate(() => document.querySelectorAll('[data-deck-pictures] img').length), '| first names:', await h.evaluate(() => [...document.querySelectorAll('[data-deck-pictures] li')].slice(0, 4).map((one) => one.innerText).join(' / ')))
  await h.screenshot({ path: join(shots, 'gallery.png') })
  await h.evaluate(() => document.querySelector('[data-deck-pictures] button')?.click()); await wait(2000)
  console.log('opened from gallery:', (await h.evaluate(() => document.querySelector('main, [data-page]')?.innerText ?? document.body.innerText)).slice(0, 300).replace(/\n+/g, ' | '))
  await h.screenshot({ path: join(shots, 'gallery-open.png') })
  // A deck picture opened from Media.
  await go('media'); await wait(1500)
  await h.evaluate(() => document.querySelector('[data-media-decks] button, [data-media-decks] [role]')?.click()); await wait(1500)
  await h.evaluate(() => document.querySelector('[data-media-grid] img')?.closest('button, a, [role=button], [data-media-tile]')?.click() ?? document.querySelector('[data-media-grid] img')?.click()); await wait(2000)
  console.log('opened from Media:', (await h.evaluate(() => document.body.innerText)).slice(0, 300).replace(/\n+/g, ' | '))
  await h.screenshot({ path: join(shots, 'media-open.png') })
  // An artist from the deck is a Sources page; a movement is a tag.
  const pages = await h.evaluate(() => window.api.haligtree('sources').then((all) => all.filter((one) => /Ernst|Rubens|Monet|Picasso|Rembrandt/.test(one.name)).map((one) => `${one.name} (${one.count})`)).catch((e) => String(e)))
  console.log('sources:', JSON.stringify(pages)?.slice(0, 300))
  // The Map's Sources view: the deck's artists joined to the deck, no node per card.
  const graph = await h.evaluate(() => window.api.haligtree('sources:graph'))
  const deckNode = graph.nodes.find((one) => one.title === 'Great Works of Art')
  console.log('map:', graph.nodes.length, 'nodes;', graph.nodes.filter((one) => one.kind === 'person').length, 'people; deck node links:', deckNode?.links, '; Picasso:', !!graph.nodes.find((one) => one.title === 'Pablo Picasso'))
  await h.evaluate(() => localStorage.setItem('mapMode', 'sources')); await go('map'); await wait(4000)
  await h.screenshot({ path: join(shots, 'map-sources.png') })
  // Study a deck, and its links changed.
  await go('review'); await wait(1200)
  await h.evaluate(() => document.querySelector('[data-review-tab="decks"]')?.click()); await wait(1200)
  console.log('buttons:', await h.evaluate(() => [...document.querySelectorAll('[data-deck] button')].map((one) => one.textContent.trim()).join(' / ')))
  await h.evaluate(() => document.querySelector('[data-deck-links]')?.click()); await wait(1500)
  console.log('links panel:', (await h.evaluate(() => document.querySelector('[data-deck-links-panel]')?.innerText ?? '')).replace(/\n+/g, ' | '))
  await h.screenshot({ path: join(shots, 'deck-links.png') })
  await h.evaluate(() => [...document.querySelectorAll('[data-deck-links-panel] button')].find((one) => one.textContent.trim() === 'Cancel')?.click())
  await h.evaluate(() => [...document.querySelectorAll('[data-deck]')].find((one) => /Art of War/.test(one.textContent))?.querySelector('[data-deck-study]')?.click()); await wait(2500)
  console.log('study Art of War:', (await h.evaluate(() => document.querySelector('[data-review-tabs]')?.closest('section, main, div')?.parentElement?.innerText ?? '')).slice(0, 200).replace(/\n+/g, ' | '))
  await h.screenshot({ path: join(shots, 'deck-study.png') })
  console.log('errors:', c.errors.slice(0, 5))
} catch (e) { console.log('RUN FAILED', e.message.split('\n')[0]) } finally { await c.close?.() }
