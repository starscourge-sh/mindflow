import { start, done } from './qa-visual-lib.mjs'
const c = await start()
const home = await c.showHome(1280, 800)
await c.send('view', 'tags'); await home.waitForTimeout(1000)
await home.locator('[data-row]', { hasText: 'tip' }).first().click(); await home.waitForTimeout(2500)
console.log(await home.evaluate(() => { const a = document.querySelectorAll('article')[2]; const out = []; let e = a.querySelector('[role=link]'); const walk = (n, d) => { if (d > 6) return; for (const ch of n.children) { const r = ch.getBoundingClientRect(); out.push(`${'  '.repeat(d)}${ch.tagName}.${String(ch.className).slice(0, 50)} h=${Math.round(r.height)}`); walk(ch, d + 1) } }; walk(e, 0); return out.join('\n') }))
await c.shot(home, 'tp-probe')
done(c)
