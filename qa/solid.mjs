// Turn see-through windows off and check both windows go solid.
import { open } from './harness.mjs'
const qa = await open()
const { page, electron } = qa
await page.waitForTimeout(2500)
const home = electron.windows().find((w) => w !== page)
const solid = (p) => p.evaluate(() => document.documentElement.hasAttribute('data-solid'))
console.log('before', await solid(page), await solid(home))
await page.evaluate(() => localStorage.setItem('frosted', 'off'))
await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'frosted' })))
await home.waitForTimeout(500)
console.log('after', await solid(page), await solid(home))
await page.evaluate(() => localStorage.removeItem('frosted'))
process.exit(0)
