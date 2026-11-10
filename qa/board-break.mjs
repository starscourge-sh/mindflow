// A board fed the worst case: 5, 50, 500 and 5,000 cards, 30 lists, a word too long for any card, right-to-left,
// CJK and emoji names, an empty list, and a 560 x 400 window. Each is shot light and dark; the page never scrolls
// sideways, no card is wider than its list, and a board of 5,000 cards opens and takes a key in good time.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/board-break.mjs
// SHOTS=dir keeps the pictures.
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const shots = process.env.SHOTS ?? join(tmpdir(), `board-break-${Date.now()}`)
mkdirSync(shots, { recursive: true })
const { check, done } = checks()
const s = await sandbox({ width: 1440, height: 860 })
const { h, v, send, both, size } = s
const wait = (ms = 300) => h.waitForTimeout(ms)
const board = async (title, body) => {
  const id = await v('article:new')
  await v('item:save', id, { title, body })
  await v('notes:fields:set', 'nuggets', id, 'kanban-plugin', 'board')
  return id
}
const open = async (id) => {
  const t0 = Date.now()
  await send('article', id)
  await h.waitForFunction(() => document.querySelectorAll('[data-board] [data-lane]').length > 0, null, { timeout: 60000 })
  const took = Date.now() - t0
  await wait(800)
  return took
}
// Whatever sticks out: the page sideways, a card wider than its list, a name past its header.
const spill = () => h.evaluate(() => {
  const doc = document.scrollingElement
  const out = []
  if (doc.scrollWidth > doc.clientWidth + 1) out.push(`page ${doc.scrollWidth - doc.clientWidth}px`)
  for (const lane of document.querySelectorAll('[data-board] [data-lane]:not([data-folded])')) {
    const l = lane.getBoundingClientRect()
    for (const card of lane.querySelectorAll('[data-board-card]')) {
      const c = card.getBoundingClientRect()
      if (c.right > l.right + 1 || c.left < l.left - 1) out.push(`card ${card.textContent.slice(0, 20)}`)
      if (card.scrollWidth > card.clientWidth + 1) out.push(`inside ${card.textContent.slice(0, 20)}`)
    }
    const head = lane.querySelector('header')
    if (head && head.scrollWidth > head.clientWidth + 1) out.push(`header ${head.textContent.slice(0, 20)}`)
  }
  return out
})
try {
  await v('settings:set', { hintRate: 0 })
  await send('view', 'articles')
  await wait(1000)
  const cards = (n, word = 'Card') => Array.from({ length: n }, (_, at) => `- [${at % 7 === 0 ? 'x' : ' '}] ${word} ${at + 1}`).join('\n')
  for (const n of [5, 50, 500]) {
    const id = await board(`${n} cards`, `## Inbox\n\n${cards(n)}\n\n## Next\n\n${cards(Math.ceil(n / 5), 'Next')}\n`)
    const took = await open(id)
    await h.mouse.move(900, 840)
    await both(join(shots, `cards-${n}`))
    check(`${n} cards: nothing spills`, (await spill()).length === 0, (await spill()).join(', '))
    check(`${n} cards: open in good time`, took < 4000, `${took}ms`)
    if (n === 500) {
      const first = await h.evaluate(() => document.querySelector('[data-board] [data-lane]').querySelectorAll('[data-board-card]').length)
      const more = await h.evaluate(() => document.querySelector('[data-board] [data-more-cards]')?.textContent)
      await h.evaluate(() => { const box = document.querySelector('[data-board] [data-lane] [data-board-card]').parentElement; box.scrollTop = box.scrollHeight })
      await wait(600)
      const then = await h.evaluate(() => document.querySelector('[data-board] [data-lane]').querySelectorAll('[data-board-card]').length)
      check('500 cards: a long list draws its first 60, says how many more, and draws more as it is scrolled', first === 60 && /440 more cards/.test(more ?? '') && then > first, `${first} then ${then}; ${more}`)
    }
    const pile = await h.evaluate(() => [...document.querySelectorAll('[data-board] [data-archive-pile]')].map((one) => one.textContent.trim()))
    check(`${n} cards: a pile of done cards is offered a way out only when it is a pile`, n < 35 ? pile.length === 0 : pile.length >= 1, pile.join(' | '))
  }
  const big = await board('5,000 cards', `## Inbox\n\n${cards(4000)}\n\n## Next\n\n${cards(1000, 'Next')}\n`)
  const took = await open(big)
  check('5,000 cards open in good time', took < 15000, `${took}ms`)
  await h.locator('[data-board] [data-board-card]').first().click()
  const t0 = Date.now()
  await h.keyboard.press('ArrowDown')
  await h.waitForFunction(() => [...document.querySelectorAll('[data-board] [data-board-card]')].indexOf(document.querySelector('[data-board] [data-board-card][data-board-cursor]')) === 1, null, { timeout: 10000 })
  const step = Date.now() - t0
  check('5,000 cards: ↓ moves the cursor at once', step < 400, `${step}ms`)
  const t1 = Date.now()
  await h.keyboard.press('x')
  await h.waitForFunction(() => document.querySelector('[data-board] [data-board-card][data-board-cursor] [role="checkbox"]')?.getAttribute('aria-checked') === 'true', null, { timeout: 10000 })
  const tick = Date.now() - t1
  check('5,000 cards: X ticks the card at once', tick < 600, `${tick}ms`)
  await both(join(shots, 'cards-5000'))

  // Thirty lists, words no card can break, right-to-left, CJK and emoji, an empty list.
  const lists = Array.from({ length: 30 }, (_, at) => `## List ${at + 1}\n\n- [ ] one`).join('\n\n')
  const odd = await board('Odd words', `## ${'Supercalifragilisticexpialidocious'.repeat(3)}\n\n- [ ] ${'Pneumonoultramicroscopicsilicovolcanoconiosis'.repeat(2)}\n- [ ] https://example.com/a/very/long/address/that/goes/on/and/on/without/a/single/space/in/it\n\n## قائمة القراءة\n\n- [ ] كتاب جديد عن تاريخ المكتبات\n\n## 読書リスト\n\n- [ ] 新しい本を読む 📚🌿✨\n\n## 🌿🌿🌿\n\n- [ ] 🎉\n\n## Empty\n\n${lists}\n`)
  await open(odd)
  await h.mouse.move(900, 840)
  await both(join(shots, 'odd'))
  check('odd words: nothing spills', (await spill()).length === 0, (await spill()).join(', '))
  const names = await h.evaluate(() => [...document.querySelectorAll('[data-board] [data-lane-name]')].slice(0, 5).map((one) => one.textContent))
  check('a list named in emoji keeps its name (before, "New list")', names.includes('🌿🌿🌿') && names.includes('読書リスト') && names.includes('قائمة القراءة'), names.join(' | '))
  const empty = await h.evaluate(() => { const one = [...document.querySelectorAll('[data-board] [data-lane]')].find((l) => l.querySelector('[data-lane-name]')?.textContent === 'Empty'); return one && getComputedStyle(one.querySelector('[data-add-card]')).opacity })
  check('an empty list shows "Add a card" in full', empty === '1', String(empty))
  const strip = await h.evaluate(() => { const one = document.querySelector('[data-board-strip]'); return { scroll: one.scrollWidth > one.clientWidth, fade: one.hasAttribute('data-fade-right') } })
  check('35 lists scroll sideways inside the board, fading at the side with more', strip.scroll && strip.fade, JSON.stringify(strip))

  // The smallest window.
  await size(560, 400)
  await wait(800)
  await both(join(shots, 'small'))
  const small = await h.evaluate(() => {
    const doc = document.scrollingElement
    const tools = [...document.querySelectorAll('[data-board] button, [data-board] [data-add-card]')].filter((one) => one.getClientRects().length && one.getBoundingClientRect().width > 0)
    return { sideways: doc.scrollWidth - doc.clientWidth, lanes: document.querySelectorAll('[data-board] [data-lane]').length }
  })
  check('560 x 400: the page does not scroll sideways, the lists are there', small.sideways <= 0 && small.lanes > 0, JSON.stringify(small))
  const targets = await h.evaluate(() => [...document.querySelectorAll('[data-board] [data-card-more], [data-board] [data-lane-more], [data-board] header button')].map((one) => {
    const box = one.getBoundingClientRect()
    const after = getComputedStyle(one, '::after')
    const grow = after.content !== 'none' && after.position === 'absolute' ? -parseFloat(after.left || '0') * 2 : 0
    return Math.min(box.width, box.height) + grow
  }).filter((one) => one < 32))
  check('560 x 400: every board button takes a press 32px across', targets.length === 0, targets.join(','))
  await size(1440, 860)
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await s.close()
}
done()
