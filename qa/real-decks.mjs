// Scratch: real shared Anki decks the user downloaded, imported into a throwaway book to see how they come in.
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
    for (let i = 0; i < 600 && !notice; i++) { await wait(500); notice = await h.evaluate(() => document.querySelector('[data-import-done]')?.innerText ?? '') }
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
  console.log('errors:', c.errors.slice(0, 5))
} catch (e) { console.log('RUN FAILED', e.message.split('\n')[0]) } finally { await c.close?.() }
