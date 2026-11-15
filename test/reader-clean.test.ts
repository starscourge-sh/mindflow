// Run with: node --test test/reader-clean.test.ts
// A page in the reader reads as a clean page, never one with broken CSS (the user, 15 Nov 2026, on notability.com):
// no icon on its own, no picture twice, no link with no words, no site button standing alone. Four real pages, saved
// once (qa/fixtures/reader, scripts and styles taken out), with each picture's real size as measured on the site
// (<name>.pictures.json): nothing is fetched here.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseHTML } from 'linkedom'
import { Readability } from '@mozilla/readability'
import { cleanArticle } from '../src/main/article-clean.ts'

const PAGES = { notability: 'https://notability.com/', raycast: 'https://www.raycast.com/', anki: 'https://docs.ankiweb.net/browsing.html', webdev: 'https://web.dev/articles/optimize-lcp' }

/** The page as the reader keeps it: each picture "kept" under its own address, with the size the site's file has. */
async function read(name: keyof typeof PAGES): Promise<{ body: HTMLElement; asked: string[] }> {
  const page = readFileSync(new URL(`../qa/fixtures/reader/${name}.html`, import.meta.url), 'utf8')
  const sizes = JSON.parse(readFileSync(new URL(`../qa/fixtures/reader/${name}.pictures.json`, import.meta.url), 'utf8')) as Record<string, [number, number, string] | null>
  const { document } = parseHTML(page)
  const found = new Readability(document as unknown as Document, { charThreshold: 300, keepClasses: true }).parse()
  const asked: string[] = []
  const html = await cleanArticle(found!.content!, new URL(PAGES[name]), document.querySelector('meta[property="og:site_name"]')?.getAttribute('content') ?? '', async (src) => {
    asked.push(src)
    const size = sizes[src]
    return size ? { kept: `haligtree://assets/${encodeURIComponent(src)}`, size: { width: size[0], height: size[1], type: size[2] } } : { kept: src, size: null }
  })
  return { body: parseHTML(`<!doctype html><html><body>${html}</body></html>`).document.body as unknown as HTMLElement, asked }
}

const sizes = (name: string): Record<string, [number, number, string] | null> => JSON.parse(readFileSync(new URL(`../qa/fixtures/reader/${name}.pictures.json`, import.meta.url), 'utf8'))
const site = (src: string): string => decodeURIComponent(src.replace('haligtree://assets/', ''))

for (const name of Object.keys(PAGES) as (keyof typeof PAGES)[]) {
  test(`${name}: every picture shown once, none an icon on its own, no link without words`, async () => {
    const { body } = await read(name)
    const pictures = [...body.querySelectorAll('img')]
    const srcs = pictures.map((one) => site(one.getAttribute('src') ?? ''))
    assert.equal(new Set(srcs).size, srcs.length, `a picture twice: ${srcs.join(' ')}`)
    for (const one of pictures) {
      const size = sizes(name)[site(one.getAttribute('src') ?? '')]
      assert.ok(size, `a picture the page cannot show: ${one.getAttribute('src')}`)
      // As the reader draws it: its file's own size (the column narrows a wide one).
      const [width, height] = size
      // A block: 100px or more one way, and 48px or more the other unless its words say what it is (a formula).
      if (!one.hasAttribute('data-inline')) assert.ok(Math.max(width, height) >= 100 && (Math.min(width, height) >= 48 || one.getAttribute('alt')), `a picture block ${width}x${height}: ${site(one.getAttribute('src') ?? '')}`)
      else assert.ok((one.closest('p, li, td, th, dd, dt, figcaption, blockquote, h1, h2, h3, h4, h5, h6')?.textContent ?? '').trim(), 'an inline icon outside a line of words')
    }
    for (const one of body.querySelectorAll('a')) assert.ok((one.textContent ?? '').replace(/[\s↗→]+/g, ''), `a link without words: ${one.outerHTML.slice(0, 120)}`)
    assert.ok(!body.querySelector('nav, button, svg, [class], [srcset], source'), 'menus, buttons, drawings and classes all gone')
    // Nothing drawn from letters: never three lines in a row of a sign or two each (a keyboard's keys).
    const lines = [...body.querySelectorAll('p, div, li')].filter((one) => !one.querySelector('p, div, li')).map((one) => (one.textContent ?? '').trim())
    assert.ok(!lines.some((_, at) => lines.slice(at, at + 3).length === 3 && lines.slice(at, at + 3).every((line) => line.length > 0 && line.length <= 3)), 'lines of single signs')
  })
}

test('notability.com: its feature pictures once each (the wide one), no logo, arrow, seal or scribble, no "Learn more" button', async () => {
  const { body } = await read('notability')
  const srcs = [...body.querySelectorAll('img')].map((one) => site(one.getAttribute('src') ?? '').replace('https://notability.com/static/', ''))
  assert.deepEqual(srcs, ['features/ai/featuregraphic-AI-flashcards-wide.webp', 'features/ai/featuregraphic-AI-smartnotes-narrow.webp', 'features/ai/featuregraphic-AI-chat-wide.webp', 'features/ai/featuregraphic-AI-actionitems-narrow.webp', 'features/ai/featuregraphic-AI-youtube-wide.webp'])
  assert.ok(!/Learn more/.test(body.textContent ?? ''), 'the "Learn more" button went')
  assert.ok(/Learn Guarantee/.test(body.textContent ?? '') && /cover the cost for the rest of the semester/.test(body.textContent ?? ''), 'the words around it stayed')
  assert.ok(!/Download Notability for free/.test(body.textContent ?? ''), 'the closing heading, its buttons gone, went with them')
})

test('docs.ankiweb.net: of a picture with a dark version, the light one a page shows', async () => {
  const { body, asked } = await read('anki')
  assert.ok(!asked.some((src) => /dark/i.test(src)), `asked for a dark version: ${asked.join(' ')}`)
  assert.equal(body.querySelectorAll('img').length, 4)
})

test("two neighbouring pictures in folders of their own are two pictures, not two versions of one", async () => {
  const html = await cleanArticle('<p>Two videos, side by side, and words enough around them to read as a paragraph of an article.</p><div><img src="https://i.ytimg.com/vi/aaa111/hqdefault.jpg" alt="One video"><img src="https://i.ytimg.com/vi/bbb222/hqdefault.jpg" alt="Another video"></div><div><img src="/_next/image?url=%2Fmedia%2Fone.png&w=1080" alt="One"><img src="/_next/image?url=%2Fmedia%2Ftwo.png&w=1080" alt="Two"></div><div><img src="/static/hero-wide.webp" width="2000"><img src="/static/hero-narrow.webp" width="900"></div>', new URL('https://example.com/'), 'Example', async (src) => ({ kept: `haligtree://assets/${encodeURIComponent(src)}`, size: { width: 1200, height: 800, type: 'jpg' } }))
  const srcs = [...parseHTML(`<!doctype html><html><body>${html}</body></html>`).document.querySelectorAll('img')].map((one) => decodeURIComponent(one.getAttribute('src') ?? ''))
  assert.deepEqual(srcs.map((src) => src.replace(/^haligtree:\/\/assets\//, '')), ['https://i.ytimg.com/vi/aaa111/hqdefault.jpg', 'https://i.ytimg.com/vi/bbb222/hqdefault.jpg', 'https://example.com/_next/image?url=%2Fmedia%2Fone.png&w=1080', 'https://example.com/_next/image?url=%2Fmedia%2Ftwo.png&w=1080', 'https://example.com/static/hero-wide.webp'])
})

test('a store badge or a button drawn as a picture goes; a figure that links to its full size stays', async () => {
  const sizes: Record<string, [number, number]> = { 'https://example.com/badge.png': [120, 40], 'https://example.com/photo.jpg': [1600, 1000] }
  const html = await cleanArticle('<p>An app worth trying, with enough words around it to read as a paragraph of an article.</p><p><a href="https://apps.apple.com/app/x"><img src="/badge.png" alt="Download on the App Store"></a></p><figure><a href="/photo.jpg"><img src="/photo.jpg" alt="The garden"></a><figcaption>The garden in May</figcaption></figure>', new URL('https://example.com/'), 'Example', async (src) => ({ kept: `haligtree://assets/${encodeURIComponent(src)}`, size: { width: sizes[src][0], height: sizes[src][1], type: 'png' } }))
  const { body } = parseHTML(`<!doctype html><html><body>${html}</body></html>`).document
  assert.deepEqual([...body.querySelectorAll('img')].map((one) => one.getAttribute('alt')), ['The garden'])
  assert.ok(!/App Store/.test(body.innerHTML) && /The garden in May/.test(body.textContent ?? ''), body.innerHTML)
})

test('web.dev: a srcset gives the sharpest the column needs; a figure keeps its caption', async () => {
  const { body, asked } = await read('webdev')
  // Its srcset has no space after each comma ("..._36.png 36w,..._48.png 48w"): read as a browser reads it, 1440w is the sharpest the column needs.
  assert.ok(asked.includes('https://web.dev/static/articles/optimize-lcp/image/lcp-devtools_1440.png'), asked.join(' '))
  assert.ok(body.querySelector('figure img') && body.querySelector('figure figcaption'), 'figures with captions')
})
