// Turn Blurring off and check private words and the left-window dim go plain.
import { open } from './harness.mjs'
const qa = await open()
const { page, electron } = qa
await page.waitForTimeout(2500)
const home = electron.windows().find((w) => w.url().includes('home'))
const probe = (p) => p.evaluate(() => {
  const t = document.createElement('div'); t.setAttribute('data-private', ''); t.innerHTML = '<span class="private-text">x</span>'; document.body.append(t)
  const f = getComputedStyle(t.firstChild).filter; t.remove()
  document.documentElement.dataset.blurred = 'on'; const o = getComputedStyle(document.body).opacity; document.documentElement.dataset.blurred = 'off'
  return `${f} / ${o}`
})
console.log('on :', await probe(page), '|', await probe(home))
await page.evaluate(() => window.api.haligtree('settings:set', { blur: false })); await page.waitForTimeout(800)
console.log('off:', await probe(page), '|', await probe(home))
await page.evaluate(() => window.api.haligtree('settings:set', { blur: true }))
process.exit(0)
