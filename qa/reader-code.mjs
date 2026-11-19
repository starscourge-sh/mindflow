// Code in the web reader reads as written (17 Nov items 16 and 17): a page that sets each line of its code as an
// element of its own (Tailwind's docs, any Shiki page) keeps every line, indent and space, coloured as a note's code
// block, a long line scrolling inside its block; the site's live example of that code is not left as loose lines;
// and the column is a note's measure, about 70 characters a line. The site is faked in the main process's fetch, as
// in qa/web-reader.mjs.
//   QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/reader-code.mjs
// QA_SHOTS=dir keeps the reader light and dark.
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const SITE = 'https://93.184.216.34'
const s = (words, mark) => `<span style="color:var(--color-sky-300)"${mark ? ' class="highlighted-word relative"' : ''}>${words}</span>`
const para = (n) => `<p>Paragraph ${n} says how utility classes are put together, one small single-purpose class at a time, so a reader has enough words here to call this an article and not a scrap of a page.</p>`
const page = `<html><head><title>Styling with utility classes - Core concepts</title><meta property="og:site_name" content="Tailwind CSS"></head><body><article><h1>Styling with utility classes</h1>
  ${para(1)}${para(2)}
  <div class="not-prose"><div class="card"><div><div>ChitChat</div><p>You have a new message!</p></div></div></div>
  <div><pre class="shiki tailwindcss-theme" tabindex="0"><code><span class="line">&#x3C;div class=${s('"flex flex-col gap-2 p-8 ')}${s('sm:flex-row', 1)}${s(' ')}${s('sm:items-center', 1)}${s(' mx-auto max-w-sm items-center gap-x-4 rounded-xl bg-white p-6 shadow-lg outline outline-black/5 dark:bg-slate-800"')}></span><span class="line">  &#x3C;div class=${s('"text-xl font-medium text-black"')}>ChitChat&#x3C;/div></span><span class="line">  &#x3C;p class=${s('"text-gray-500"')}>You have a new message!&#x3C;/p></span><span class="line">&#x3C;/div></span></code></pre></div>
  ${para(3)}${para(4)}</article></body></html>`

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v, electron } = c
const shots = process.env.QA_SHOTS
try {
  await electron.evaluate((_, [site, page]) => {
    globalThis.__realFetch ??= globalThis.fetch
    globalThis.fetch = async (input, init) => {
      const url = String(input instanceof URL ? input.href : (input?.url ?? input))
      if (!url.startsWith(site + '/')) return globalThis.__realFetch(input, init)
      return new URL(url).pathname === '/docs' ? new Response(page, { headers: { 'content-type': 'text/html; charset=utf-8' } }) : new Response('', { status: 404 })
    }
  }, [SITE, page])
  await v('settings:set', { sounds: false, hintRate: 0, motion: false })
  await h.evaluate((href) => window.dispatchEvent(new CustomEvent('haligtree:web', { detail: { href } })), `${SITE}/docs`)
  await h.waitForSelector('.web-reader-body pre', { timeout: 20000 }).catch(() => {})
  // Coloured once the grammars are in.
  await h.waitForFunction(() => !!document.querySelector('.web-reader-body pre [class*="hljs-"]'), null, { timeout: 8000 }).catch(() => {})
  const seen = await h.evaluate(() => {
    const body = document.querySelector('.web-reader-body')
    const pre = body?.querySelector('pre')
    const p = body?.querySelector('p')
    const outside = [...(body?.childNodes ?? [])].filter((one) => one.nodeName !== 'PRE').map((one) => one.textContent).join(' ')
    const em = p ? parseFloat(getComputedStyle(p).fontSize) : 16
    return {
      lines: pre?.textContent?.split('\n') ?? [],
      spaced: /sm:flex-row sm:items-center/.test(pre?.textContent ?? ''),
      colours: pre?.querySelectorAll('[class*="hljs-"]').length ?? 0,
      wrap: pre ? getComputedStyle(pre).whiteSpace : '',
      scrolls: pre ? pre.scrollWidth > pre.clientWidth + 4 && getComputedStyle(pre).overflowX === 'auto' : false,
      inPage: pre ? pre.getBoundingClientRect().right <= body.getBoundingClientRect().right + 1 : false,
      loose: /You have a new message/.test(outside),
      measure: body ? Math.round((body.getBoundingClientRect().width / em) * 10) / 10 : 0,
      chars: p ? Math.round(body.getBoundingClientRect().width / (em * 0.5)) : 0
    }
  })
  check('item 16: the code keeps its four lines', seen.lines.length === 4, `${seen.lines.length} lines: ${JSON.stringify(seen.lines).slice(0, 160)}`)
  check('item 16: its indents and its spaces as written ("sm:flex-row sm:items-center")', seen.spaced && /^  <div/.test(seen.lines[1] ?? ''), JSON.stringify(seen.lines[1] ?? ''))
  check('item 16: coloured as a note\'s code block', seen.colours >= 3, `${seen.colours} coloured runs`)
  check('item 16: a long line stays one line and scrolls inside its block, within the page', seen.wrap === 'pre' && seen.scrolls && seen.inPage, JSON.stringify({ wrap: seen.wrap, scrolls: seen.scrolls, inPage: seen.inPage }))
  check('item 16: the site\'s live example is not left as loose lines', !seen.loose, '')
  check('item 17: the column is a note\'s measure (36em, about 70 characters)', seen.measure >= 35.5 && seen.measure <= 36.5, `${seen.measure}em`)
  if (shots) {
    await h.evaluate(() => document.querySelector('.web-reader-body pre')?.scrollIntoView({ block: 'center' }))
    await h.waitForTimeout(300)
    await c.both(`${shots}/reader-code`)
  }
} finally {
  await c.close()
}
done()
