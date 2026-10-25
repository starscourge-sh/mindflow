// Covers in both looks: Home, Gems (as rows and as a grid) and Questions, in
// Paper drawings and Gradients, on a light page and a dark one, and Brutal.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-covers/main/index.js SHOTS=<dir> node qa/covers.mjs
// GRADIENTS=<folder> points Gradients at a folder of covers (read only); without it they are plain colour tiles.
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const dir = process.env.SHOTS ?? `${process.env.QA_DATA}/shots`
mkdirSync(dir, { recursive: true })
const c = await sandbox({ width: 1280, height: 860 })
const { h, v, go } = c
const shot = async (name) => { await h.mouse.move(5, 5); await h.waitForTimeout(1200); await h.screenshot({ path: `${dir}/${name}.png` }) }
try {
  const looks = [['paper', 'light', 'soft'], ['github', 'dark', 'soft'], ['paper', 'brutal', 'brutal']]
  for (const cover of ['paper', 'gradients']) {
    await v('settings:set', { coverStyle: cover, coversFolder: cover === 'gradients' ? process.env.GRADIENTS ?? '' : '' })
    for (const [theme, name, style] of looks) {
      await h.evaluate((s) => (s === 'brutal' ? localStorage.setItem('style', 'brutal') : localStorage.removeItem('style')), style)
      await c.theme(theme)
      await c.size(1280, 860)
      await h.waitForTimeout(cover === 'gradients' ? 4000 : 500)
      const tag = `${cover}-${name}`
      await go('home'); await shot(`${tag}-home`)
      await h.evaluate(() => localStorage.setItem('view:nugget', JSON.stringify({ density: 'list', pane: 'list' })))
      await go('nuggets'); await shot(`${tag}-gems`)
      await go('questions'); await shot(`${tag}-questions`)
      await h.evaluate(() => localStorage.setItem('view:nugget', JSON.stringify({ density: 'grid', pane: 'list' })))
      await go('home'); await go('nuggets'); await shot(`${tag}-grid`)
    }
  }
  const drawn = await h.evaluate(() => document.querySelectorAll('[data-paper-cover]').length)
  console.log(`last view: ${drawn} paper covers drawn (gradients mode, so expect 0)`)
  if (c.errors.length) console.log('errors:', c.errors.slice(0, 5))
} finally {
  await c.close()
}
