// Which Macs get which feature (main/needs.ts): the app run as four Macs in turn
// (HALIGTREE_QA_CAPS=every|macos15|macos26|ai), and on each, nothing that needs
// more than that Mac has is offered as working. Every surface that offers a Mac
// feature marks itself data-mac-needs; one this Mac lacks carries data-mac-lacking
// and no live control. What Haligtree can do says at its top what works here.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/mac-needs.mjs
// SHOT=<folder> keeps a picture of the page's top and of a card that needs more, per Mac.
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const RANK = { every: 0, macos15: 1, macos26: 2, ai: 3 }
// The pages that offer Mac features; Settings is read whole, every section.
const PAGES = ['powers', 'home', 'today', 'settings', 'inbox', 'nuggets', 'weekpage']

for (const level of Object.keys(RANK)) {
  process.env.HALIGTREE_QA_CAPS = level
  const c = await sandbox({ width: 1200, height: 900 })
  try {
    const caps = await c.v('caps')
    check(`${level}: main says this Mac is the one stood in`, (level === 'ai') === (caps.ai === 'available') && caps.major === { every: 14, macos15: 15, macos26: 26, ai: 26 }[level], JSON.stringify(caps))
    let offered = 0
    let marked = 0
    // Every card on What Haligtree can do that needs more than this Mac, gathered tab by tab.
    const lackingCards = new Set()
    for (const page of PAGES) {
      await c.go(page)
      // Settings and What Haligtree can do: every section (tab) in turn (the page opens in tabs since 27d91f0ff).
      const sections = page === 'settings' || page === 'powers' ? await c.h.evaluate(() => [...document.querySelectorAll('[data-section]')].map((one) => one.getAttribute("data-section"))) : [null]
      for (const section of sections.length ? sections : [null]) {
        if (section) {
          await c.h.evaluate((name) => document.querySelector(`[data-section="${name}"]`)?.click(), section)
          await c.h.waitForTimeout(400)
        }
        const seen = await c.h.evaluate(() => [...document.querySelectorAll('[data-mac-needs]')].map((one) => ({
          needs: one.getAttribute('data-mac-needs'),
          lacking: one.hasAttribute('data-mac-lacking'),
          live: [...one.querySelectorAll('button, [role="switch"], input, [role="menuitem"]')].filter((b) => !b.disabled && b.getAttribute('aria-disabled') !== 'true').length,
          name: (one.getAttribute('data-power') ?? one.textContent ?? '').trim().slice(0, 50),
          power: one.getAttribute('data-power')
        })))
        for (const one of seen) {
          const has = RANK[one.needs] <= RANK[level]
          if (has) offered++
          else marked++
          if (page === 'powers' && one.power && !has) lackingCards.add(one.power)
          if (has && one.lacking) check(`${level}: ${page}${section ? ' ' + section : ''}: “${one.name}” works here and is not marked as missing`, false)
          if (!has && (!one.lacking || one.live)) check(`${level}: ${page}${section ? ' ' + section : ''}: “${one.name}” needs ${one.needs} and is not offered as working`, false, `lacking ${one.lacking}, live controls ${one.live}`)
        }
      }
    }
    check(`${level}: every Mac feature on ${PAGES.length} pages offered only where it works (${offered} offered, ${marked} marked as needing more)`, offered > 0)
    await c.go('powers')
    // What this Mac lacks is said on the page's "Every page" tab.
    await c.h.evaluate(() => document.querySelector('[data-section="Every page"]')?.click())
    await c.h.waitForTimeout(400)
    const top = await c.h.evaluate(() => {
      const note = document.querySelector('[data-this-mac]')
      return { text: note?.textContent ?? '', missing: note?.getAttribute('data-this-mac') }
    })
    const needMore = lackingCards.size
    check(`${level}: the page says on this Mac how many need more (${needMore})`, Number(top.missing) === needMore && (needMore ? top.text.includes(`${needMore} feature`) : top.text.includes('Everything here works.')), top.text)
    if (process.env.SHOT) {
      await c.h.evaluate(() => document.querySelector('[data-this-mac]')?.scrollIntoView({ block: 'center' }))
      await c.h.waitForTimeout(300)
      await c.both(`${process.env.SHOT}/needs-${level}-top`)
      const card = await c.h.evaluate(() => {
        const one = document.querySelector('[data-mac-lacking]') ?? document.querySelector('[data-mac-needs="ai"]')
        one?.scrollIntoView({ block: 'center' })
        return !!one
      })
      if (card) {
        await c.h.waitForTimeout(300)
        await c.both(`${process.env.SHOT}/needs-${level}-card`)
      }
    }
    check(`${level}: no page errors`, !c.errors.length, c.errors.slice(0, 3).join(' | '))
  } finally {
    await c.close()
  }
}
done()
