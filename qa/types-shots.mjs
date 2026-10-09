// The seven kinds in the sandbox: the box's type list, a #book's fields, a
// #bit blurred in a list, and the year's books page, in light and dark.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-types/main/index.js SHOTS=<dir> node qa/types-shots.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const dir = process.env.SHOTS ?? '/tmp/types'
mkdirSync(dir, { recursive: true })
const s = await sandbox({ width: 1100, height: 760 })
const { h, v, page, electron } = s
let failed = 0
const check = (what, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${what}${detail ? `: ${detail}` : ''}`); if (!ok) failed++ }
try {
  const recap = await v('recap', 'year')
  console.log('books:', JSON.stringify(recap.books))
  if (process.env.ONLY_RECAP) {
    await s.go('stats')
    await h.click('button:has-text("Your year")')
    await h.waitForSelector('[aria-label="Recap"]')
    for (let i = 0; i < 14 && !(await h.evaluate(() => document.querySelector('[aria-label="Recap"]')?.textContent?.includes('You read'))); i++) {
      await h.keyboard.press('ArrowRight')
      await h.waitForTimeout(700)
    }
    await h.waitForTimeout(3000)
    console.log('page:', await h.evaluate(() => document.querySelector('[aria-label="Recap"]')?.innerText.replace(/\s+/g, ' ')))
    process.exitCode = 0
  } else {
  const rows = await h.evaluate(() => window.api.captures.list())
  const kinds = [...new Set(rows.map((one) => one.kind))].sort()
  check('only the seven kinds in the sandbox', kinds.every((kind) => ['note', 'todo', 'quote', 'word', 'link', 'decision', 'experiment'].includes(kind)), kinds.join(','))
  const bit = rows.find((one) => (one.label ?? '').startsWith("There's no place"))
  check('the #bit note is a private note', bit?.kind === 'note' && bit?.private === 1, `${bit?.kind}/${bit?.private}`)
  const odyssey = rows.find((one) => (one.label ?? '').startsWith('Tell me, O muse'))
  check('the long Odyssey passage is a quote', odyssey?.kind === 'quote')
  const pride = rows.find((one) => (one.label ?? '').startsWith('Pride and Prejudice #book'))
  check('Pride and Prejudice is a #book note', pride?.kind === 'note')
  check('the year still has its books', ['Pride and Prejudice', 'Frankenstein', 'Hamlet'].every((title) => recap.books.some((one) => one.title === title && one.finished)))

  for (const theme of ['light', 'dark']) {
    await s.theme(theme)
    // A #bit blurred in the Inbox.
    await s.go('inbox')
    await h.waitForTimeout(800)
    const blurred = await h.evaluate(() => [...document.querySelectorAll('[data-private]')].some((row) => row.textContent?.includes("There's no place")))
    check(`${theme}: the #bit row is blurred in the Inbox`, blurred)
    await h.screenshot({ path: `${dir}/inbox-bit-${theme}.png` })
    // A #book's fields in its properties.
    await s.send('capture', pride.id)
    await h.waitForTimeout(1500)
    if ((await h.getAttribute('button[aria-label="Details"]', 'aria-pressed')) !== 'true') await h.click('button[aria-label="Details"]')
    await h.waitForTimeout(800)
    await h.evaluate(() => document.querySelector('aside.mf-details')?.scrollTo(0, 400))
    await h.waitForTimeout(400)
    const panel = await h.evaluate(() => ({ text: document.body.textContent, stars: !!document.querySelector('[aria-label^="Rating"]') }))
    const areas = await h.evaluate(() => [...document.querySelectorAll('textarea')].map((one) => one.value).join(' | '))
    check(`${theme}: #book shows status, rating and takeaway`, panel.text.includes('#book') && panel.stars && /First impressions are a draft/.test(areas))
    await h.screenshot({ path: `${dir}/book-fields-${theme}.png` })
    // The year's books page.
    await s.go('stats')
    await h.click('button:has-text("Your year")')
    await h.waitForSelector('[aria-label="Recap"]')
    for (let i = 0; i < 14 && !(await h.evaluate(() => document.querySelector('[aria-label="Recap"]')?.textContent?.includes('You read'))); i++) {
      await h.keyboard.press('ArrowRight')
      await h.waitForTimeout(700)
    }
    await h.waitForTimeout(3000)
    const said = await h.evaluate(() => document.querySelector('[aria-label="Recap"]')?.innerText.replace(/\s+/g, ' '))
    console.log(`${theme} recap:`, said)
    check(`${theme}: the books page names them`, /Pride and Prejudice/.test(said) && /Frankenstein/.test(said) && /Hamlet/.test(said))
    await h.screenshot({ path: `${dir}/recap-books-${theme}.png` })
    await h.keyboard.press('Escape')
    await h.waitForTimeout(600)
    // The box: its type list, and #book typed.
    await electron.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows().find((one) => !one.webContents.getURL().includes('view=')); win?.setBounds({ x: 60, y: 60, width: 760, height: 520 }); win?.show() })
    await page.evaluate((name) => { localStorage.setItem('theme', name); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }, theme)
    await page.waitForTimeout(800)
    await page.click('.tiptap.ProseMirror')
    await page.keyboard.press('Meta+a')
    await page.keyboard.press('Backspace')
    await page.keyboard.type('Middlemarch #book', { delay: 20 })
    await page.waitForTimeout(1500)
    const box = await page.evaluate(() => ({ text: document.body.innerText, who: !!document.querySelector('input[placeholder="Who wrote it"]') }))
    check(`${theme}: the box says what #book does and asks who wrote it`, box.text.includes('#book: A book') && box.who)
    await page.screenshot({ path: `${dir}/box-book-${theme}.png` })
    await page.click('[data-kind-chip]')
    await page.waitForTimeout(700)
    const list = await page.evaluate(() => [...document.querySelectorAll('[cmdk-item]')].map((one) => one.innerText.replace(/\s+/g, ' ')))
    console.log(`${theme} picker:`, JSON.stringify(list))
    check(`${theme}: the picker has seven types, keys 1 to 7, each saying what it does`, list.length === 7 && list.every((row, index) => row.endsWith(String(index + 1)) && row.split(' ').length > 4))
    await page.screenshot({ path: `${dir}/picker-${theme}.png` })
    await page.keyboard.press('Escape')
    await page.keyboard.press('Meta+a')
    await page.keyboard.press('Backspace')
  }
  console.log('errors', s.errors)
  console.log(failed ? `${failed} FAILED` : 'ALL PASS')
  }
} finally {
  await s.close()
}
