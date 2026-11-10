// A note put up as a sticky draws as it does on the page: a quote as a quote, bold as bold, never the raw > and **.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/sticky-markdown.mjs
process.env.QA_ARGS ??= '--sandbox'
const { sandbox } = await import('./sandbox-lib.mjs')

const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1200, height: 820 })
const { electron, h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const windowOf = async (part) => {
  for (let i = 0; i < 50; i++) {
    const found = electron.windows().find((one) => !one.isClosed() && one.url().includes(part))
    if (found) return found
    await wait(200)
  }
  return null
}
const QUOTE = /^\s*>/m
const BOLD = /\*\*[^*\n]+\*\*/
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  // Notes kept as Markdown with a quote or bold in them, up to four, each put up and read.
  const found = []
  const all = await v('items', 'article')
  for (const one of all) {
    const item = await v('item', one.id)
    const md = typeof item?.body === 'string' ? item.body : null
    if (md && (QUOTE.test(md) || BOLD.test(md))) found.push({ id: one.id, md })
    if (found.length >= 4) break
  }
  check('the sandbox has notes kept as Markdown with a quote or bold', found.length > 0, `${found.length} of ${all.length}`)
  for (const one of found) {
    await h.evaluate((id) => window.api.stick('article', id, true), one.id)
    const w = await windowOf(one.id)
    await w.waitForSelector('.mf-card', { timeout: 8000 })
    await wait(800)
    // A first line that only says the title again is left out (the title is the one place it reads), so a quote that
    // is the title counts as drawn.
    const quoted = /^\s*>\s*(.*)$/m.exec(one.md)?.[1]?.replace(/\*\*/g, '').trim() ?? ''
    const seen = await w.evaluate((line) => {
      const card = document.querySelector('.mf-card')
      const text = card.innerText
      const title = card.querySelector('p')?.textContent?.trim() ?? ''
      return { raw: /\*\*|(^|\n)\s*>\s/.test(text), quote: !!card.querySelector('blockquote') || (!!line && title === line), bold: !!card.querySelector('strong'), text: text.slice(0, 120) }
    }, quoted)
    check(`sticky ${one.id.slice(0, 8)} shows no raw > or **`, !seen.raw, seen.text.replace(/\n/g, ' / '))
    if (QUOTE.test(one.md)) check(`sticky ${one.id.slice(0, 8)} draws its quote as a quote`, seen.quote)
    if (BOLD.test(one.md)) check(`sticky ${one.id.slice(0, 8)} draws bold as bold`, seen.bold)
    await h.evaluate((id) => window.api.stick('article', id, false), one.id)
    await wait(600)
  }
} catch (error) {
  check('ran to the end', false, error.message.split('\n')[0])
} finally {
  const passed = results.filter(Boolean).length
  console.log(`${passed}/${results.length} passed`)
  await c.close()
  process.exit(passed === results.length ? 0 : 1)
}
