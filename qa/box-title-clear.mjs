// Quick capture's top line: with Back and Forward showing, the note's name
// (shown once its first line scrolls away) starts clear of their pill, with
// the side panel open or shut.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/box-title-clear.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, page, v } = c
try {
  await h.evaluate(() => window.api.showPrompt()); await page.waitForTimeout(1200)
  // Two notes opened in turn from the side panel's Inbox, so Back and Forward show.
  // The side panel, opened from its chip (the key goes nowhere in a window that is not in front).
  await page.evaluate(() => document.querySelector('[data-waiting]')?.click()); await page.waitForTimeout(1200)
  for (const name of ['Tasks, said in plain words', 'Start here']) {
    await page.getByText(name, { exact: true }).first().evaluate((el) => el.click())
    await page.waitForTimeout(900)
  }
  for (const panel of [true, false]) {
    const pill = page.locator('[aria-label^="Back"]').first()
    if (!(await pill.count())) { check(`panel ${panel ? 'open' : 'shut'}: Back and Forward show`, false); break }
    await page.evaluate(() => { const box = [...document.querySelectorAll('*')].filter((el) => el.scrollHeight > el.clientHeight + 200 && /auto|scroll/.test(getComputedStyle(el).overflowY)).find((el) => el.querySelector('.ProseMirror')); box?.scrollBy(0, 2000); box?.dispatchEvent(new Event('scroll')) })
    await page.waitForTimeout(900)
    const m = await page.evaluate(() => {
      const nav = document.querySelector('[aria-label^="Back"]')?.closest('.mf-segs')?.getBoundingClientRect()
      const title = [...document.querySelectorAll('[data-drag-strip] .truncate')].find((el) => el.textContent.trim())?.getBoundingClientRect()
      return { navRight: nav && Math.round(nav.right), titleLeft: title && Math.round(title.left) }
    })
    await page.screenshot({ path: `${process.env.SHOTS ?? '/tmp'}/box-title-${panel ? 'panel' : 'alone'}.png`, clip: { x: 0, y: 0, width: 1300, height: 60 } })
    check(`panel ${panel ? 'open' : 'shut'}: the name starts clear of Back and Forward`, m.navRight && m.titleLeft && m.titleLeft >= m.navRight + 8, JSON.stringify(m))
    await page.click('[aria-label="Hide the side panel"]', { force: true }).catch(() => undefined); await page.waitForTimeout(900)
  }
} finally {
  await c.close()
}
done()
