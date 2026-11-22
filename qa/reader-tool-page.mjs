// A tool's page in the web reader, as the user read terminaltrove.com/cliamp (22 Nov 2026): its strip of figures
// ("4.7K / Stars / v2.4.1 / Latest release ...") ran down the column a word a paragraph, a closed modal's "×" and its
// words ("Script Preview", "Review this script...") were pulled in, the install line in its tabs ("brew install ...")
// was lost, and a big first letter opened the one-line tagline. And: "why nowhere to quickly copy link?". A local copy
// of a page like it (qa/fixtures/reader/tool-page.html) is served by the main process's fetch, as in qa/reader-code.mjs.
// An everyday reader: opens the page, reads the figures as one line, copies the install line from its block's button,
// copies the page's link from the bar, with ⇧⌘C, and from a right-click on the page. Every copy is read from the app's
// own call (navigator.clipboard.writeText stubbed in the page): the Mac's clipboard is never touched.
//   QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/reader-tool-page.mjs
// QA_SHOTS=dir keeps the reader light and dark.
import { readFileSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const SITE = 'https://93.184.216.34'
const HREF = `${SITE}/cliamp/`
const page = readFileSync(new URL('./fixtures/reader/tool-page.html', import.meta.url), 'utf8')

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v, electron } = c
const shots = process.env.QA_SHOTS
const wait = (ms) => h.waitForTimeout(ms)
const copies = () => h.evaluate(() => window.__copied.slice())
const notices = () => h.evaluate(() => [...document.querySelectorAll('[data-sonner-toast], [role=status]')].map((one) => one.textContent).join(' | '))
try {
  await electron.evaluate((_, [site, page]) => {
    globalThis.__realFetch ??= globalThis.fetch
    globalThis.fetch = async (input, init) => {
      const url = String(input instanceof URL ? input.href : (input?.url ?? input))
      if (!url.startsWith(site + '/')) return globalThis.__realFetch(input, init)
      return new URL(url).pathname === '/cliamp/' ? new Response(page, { headers: { 'content-type': 'text/html; charset=utf-8' } }) : new Response('', { status: 404 })
    }
  }, [SITE, page])
  await v('settings:set', { sounds: false, hintRate: 0, motion: false })
  // What the app copies, caught in the page: never the Mac's clipboard.
  await h.evaluate(() => {
    window.__copied = []
    Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: async (text) => void window.__copied.push(text) })
  })
  await h.evaluate((href) => window.dispatchEvent(new CustomEvent('haligtree:web', { detail: { href } })), HREF)
  await h.waitForSelector('.web-reader-body p', { timeout: 20000 }).catch(() => {})
  await wait(400)

  const seen = await h.evaluate(() => {
    const body = document.querySelector('.web-reader-body')
    const text = body?.textContent ?? ''
    const paragraphs = [...(body?.querySelectorAll('p') ?? [])].map((one) => one.textContent.trim())
    const pres = [...(body?.querySelectorAll('pre') ?? [])].map((one) => ({ tab: one.getAttribute('data-tab'), language: one.querySelector('code')?.getAttribute('data-language'), code: one.textContent }))
    return { text, paragraphs, pres, drop: body?.querySelector('p[data-drop]')?.textContent.trim().slice(0, 60) ?? null }
  })
  check('the figures read as one line, not a word a paragraph', seen.paragraphs.some((one) => one.startsWith('4.7K stars · v2.4.1 latest release · 2 days ago last activity')) && !seen.paragraphs.some((one) => /^(Stars|4\.7K|Status|Latest release)$/.test(one)), JSON.stringify(seen.paragraphs.slice(0, 6)))
  check('the install line is kept as code, named by its tab, in its language', seen.pres.some((one) => one.code.trim() === 'brew install bjarneo/cliamp/cliamp' && one.tab === 'brew' && one.language === 'bash'), JSON.stringify(seen.pres))
  check('the hidden tabs\' code is kept too, each named', ['linux', 'eget', 'install script'].every((tab) => seen.pres.some((one) => one.tab === tab && one.code.trim())), JSON.stringify(seen.pres.map((one) => one.tab)))
  check('no closed modal, its "×", nor a button\'s "Copy" pulled in', !/×|Script Preview|Review this script|View script|^Copy$/m.test(seen.text) && !seen.paragraphs.includes('Copy'), seen.text.slice(0, 200))
  check('no big first letter on the one-line tagline', seen.drop === null || !/^A terminal music player/.test(seen.drop), String(seen.drop))

  // Every button in the bar shows something to press and says what it is: no empty patch that lights up.
  const bar = await h.evaluate(() =>
    [...document.querySelectorAll('.web-reader .pdf-reader-bar button')].map((one) => {
      const box = one.getBoundingClientRect()
      // A rolling figure ("100%", lib/roll.tsx) is measured whole: its letters stand in boxes of their own that roll.
      const marks = [...one.querySelectorAll('svg, [data-roll]')].map((part) => part.getBoundingClientRect())
      const walk = document.createTreeWalker(one, NodeFilter.SHOW_TEXT)
      for (let node = walk.nextNode(); node; node = walk.nextNode()) {
        // The highlights count laid over the icon's corner is not the button's room.
        if (!node.textContent.trim() || node.parentElement.closest('[data-roll], [data-marks-count]')) continue
        const range = document.createRange()
        range.selectNodeContents(node)
        marks.push(range.getBoundingClientRect())
      }
      const shown = marks.filter((r) => r.width > 0)
      const left = Math.min(...shown.map((r) => r.left))
      const right = Math.max(...shown.map((r) => r.right))
      return { label: one.getAttribute('aria-label') ?? '', shows: shown.length, spare: shown.length ? Math.round(box.width - (right - left)) : null }
    })
  )
  check('every bar button has an icon or words and a name', bar.length > 0 && bar.every((one) => one.shows > 0 && one.label.trim()), JSON.stringify(bar))
  check('no bar button is wider than what it shows (no empty patch to hover)', bar.every((one) => one.spare !== null && one.spare <= 18), JSON.stringify(bar.filter((one) => one.spare > 18)))

  // The code block's own copy button, on hover.
  await h.hover('.web-reader-body pre[data-tab="brew"]'); await wait(250)
  const button = await h.$('[data-code-copy] button')
  check('a copy button shows over the code block on hover', !!button, '')
  if (button) {
    await button.click(); await wait(400)
    check('it copies the code as written', (await copies()).at(-1) === 'brew install bjarneo/cliamp/cliamp', JSON.stringify(await copies()))
    check('and says "Copied"', /Copied/.test(await notices()), await notices())
  }

  // The page's link: the bar's button, ⇧⌘C, and a right-click on the page's margin.
  await h.click('.web-reader button[aria-label="Copy link"]'); await wait(400)
  check('"Copy link" in the bar copies the page\'s link', (await copies()).at(-1) === HREF, JSON.stringify(await copies()))
  check('and says "Link copied"', /Link copied/.test(await notices()), await notices())
  await h.click('.web-reader-body p'); await wait(150)
  await h.evaluate(() => getSelection()?.removeAllRanges())
  const before = (await copies()).length
  await h.keyboard.press('Meta+Shift+c'); await wait(400)
  check('⇧⌘C with no words picked copies the link', (await copies()).length === before + 1 && (await copies()).at(-1) === HREF, JSON.stringify(await copies()))
  const margin = await h.evaluate(() => { const r = document.querySelector('.web-reader-column').getBoundingClientRect(); return { x: r.left + 12, y: r.top + 240 } })
  await h.mouse.click(margin.x, margin.y, { button: 'right' }); await wait(400)
  const row = await h.$('[role="menuitem"][data-reader-page="copy-link"]')
  check('right-click on the page offers "Copy link" with ⇧⌘C', !!row && /⇧⌘C/.test((await row.textContent()) ?? ''), '')
  if (row) {
    await row.click(); await wait(400)
    check('and it copies the link', (await copies()).length === before + 2 && (await copies()).at(-1) === HREF, JSON.stringify(await copies()))
  }
  if (shots) {
    await h.hover('.web-reader-body pre[data-tab="brew"]'); await wait(250)
    await c.both(`${shots}/reader-tool-page`)
  }
} finally {
  await c.close()
}
done()
