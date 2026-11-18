import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { showOutside } from './app-folder'
import { copyFile, mkdir, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { basename, join } from 'path'
import { database, LABEL } from './captures'
import { mentionsIn } from './notes'

/**
 * A note and the notes it links to, published as a small website: a folder of
 * plain web pages (index.html is the note you started from), their pictures
 * beside them, and a page's links to the others kept as links. Read in any
 * browser, put on any web host as it is. Private notes never go, and a link to
 * one (or to a note left out) stays as its words. Nothing is sent anywhere:
 * the folder is yours to put where you like.
 */

type Doc = { type?: string; text?: string; attrs?: Record<string, unknown>; marks?: { type: string; attrs?: Record<string, unknown> }[]; content?: Doc[] }
type Page = { id: string; title: string; body: string | null; file: string }

/** Two steps out: the note, what it links to, and what those link to. */
const STEPS = 2
/** A site of more pages than this would be most of the book: the nearest are kept. */
const MOST = 200

const escape = (text: unknown): string => String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** A file name from a title: lower case, plain letters and digits, hyphens between. */
export const slug = (title: string): string =>
  title.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'note'

/**
 * A stored body as HTML: the editor's document walked (headings, lists, quotes,
 * code, tables, pictures, links and emphasis kept), or Markdown's lines as
 * paragraphs. `hrefOf` gives a published note's page, or nothing for one left
 * out; `pictureOf` gives a picture's place in the site.
 */
export function pageHtml(raw: string | null, hrefOf: (id: string) => string | undefined, pictureOf: (src: string) => string, title = '', hidden: (id: string) => boolean = () => false): string {
  let value: unknown = raw
  try { value = JSON.parse(raw ?? 'null') } catch { /* Markdown, as it is */ }
  if (!value) return ''
  if (typeof value === 'string')
    return value.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean)
      .map((part) => `<p>${escape(part).replace(/\[\[@([^|\]]+)\|([^\]]+)\]\]/g, (_, id: string, label: string) => (hrefOf(id.replace(/^[a-z]+:/, '').split('#')[0]) ? `<a href="${hrefOf(id.replace(/^[a-z]+:/, '').split('#')[0])}">${label}</a>` : label)).replace(/\n/g, '<br>')}</p>`).join('\n')
  const inline = (nodes: Doc[] = []): string => nodes.map((node) => {
    if (node.type === 'hardBreak') return '<br>'
    if (node.type === 'noteLink') {
      const id = String(node.attrs?.id ?? '').replace(/^[a-z]+:/, '')
      const href = hrefOf(id)
      // A private note's name never goes out, even as the words of a link.
      if (!href && hidden(id)) return '<em>a private note</em>'
      const words = escape(node.attrs?.text || node.attrs?.label || '')
      return href ? `<a href="${href}">${words}</a>` : words
    }
    if (node.type === 'image') { const src = pictureOf(String(node.attrs?.src ?? '')); return src ? `<img src="${escape(src)}" alt="${escape(node.attrs?.alt ?? '')}">` : '' }
    if (node.type === 'inlineMath') return `<code>${escape(node.attrs?.latex)}</code>`
    if (node.type === 'emoji') return escape(node.attrs?.emoji ?? node.attrs?.name ?? '')
    if (node.type === 'footnoteReference') return `<sup>${escape(node.attrs?.n || 1)}</sup>`
    let text = node.text !== undefined ? escape(node.text) : inline(node.content)
    for (const mark of node.marks ?? []) {
      if (mark.type === 'bold') text = `<strong>${text}</strong>`
      else if (mark.type === 'italic') text = `<em>${text}</em>`
      else if (mark.type === 'strike') text = `<s>${text}</s>`
      else if (mark.type === 'underline') text = `<u>${text}</u>`
      else if (mark.type === 'code') text = `<code>${text}</code>`
      else if (mark.type === 'highlight') text = `<mark>${text}</mark>`
      else if (mark.type === 'link' && /^(https?:|mailto:)/i.test(String(mark.attrs?.href ?? ''))) text = `<a href="${escape(mark.attrs?.href)}">${text}</a>`
    }
    return text
  }).join('')
  const kids = (node: Doc): string => (node.content ?? []).map(block).join('\n')
  const caption = (node: Doc): string => (node.attrs?.caption ? `<figcaption>${escape(node.attrs.caption)}</figcaption>` : '')
  function block(node: Doc): string {
    switch (node.type) {
      case 'paragraph': return `<p>${inline(node.content)}</p>`
      case 'heading': { const level = Math.min(6, Math.max(2, Number(node.attrs?.level ?? 1) + 1)); return `<h${level}>${inline(node.content)}</h${level}>` }
      case 'blockquote': return `<blockquote>${kids(node)}</blockquote>`
      case 'bulletList': return `<ul>${kids(node)}</ul>`
      case 'orderedList': return `<ol>${kids(node)}</ol>`
      case 'taskList': return `<ul class="tasks">${kids(node)}</ul>`
      case 'listItem': return `<li>${kids(node)}</li>`
      case 'taskItem': return `<li class="${node.attrs?.checked ? 'done' : ''}">${kids(node)}</li>`
      case 'codeBlock': return `<pre><code>${escape((node.content ?? []).map((one) => one.text ?? '').join(''))}</code></pre>`
      case 'horizontalRule': return '<hr>'
      case 'image': { const picture = inline([node]); return picture ? `<figure>${picture}${caption(node)}</figure>` : '' }
      case 'blockMath': return `<pre class="math"><code>${escape(node.attrs?.latex)}</code></pre>`
      case 'table': return `<table>${kids(node)}</table>`
      case 'tableRow': return `<tr>${kids(node)}</tr>`
      case 'tableHeader': return `<th>${kids(node)}</th>`
      case 'tableCell': return `<td>${kids(node)}</td>`
      case 'callout': return `<aside class="callout">${node.attrs?.title ? `<p><strong>${escape(node.attrs.title)}</strong></p>` : ''}${kids(node)}</aside>`
      case 'columns': return `<div class="columns">${kids(node)}</div>`
      case 'column': return `<div>${kids(node)}</div>`
      case 'youtube': return !/^https?:/i.test(String(node.attrs?.src ?? '')) ? '' : `<p><a href="${escape(node.attrs?.src)}">${escape(node.attrs?.caption || 'A video')}</a></p>`
      case 'bookmark': return /^https?:/i.test(String(node.attrs?.href ?? '')) ? `<p><a href="${escape(node.attrs?.href)}">${escape(node.attrs?.title || node.attrs?.href)}</a></p>` : ''
      case 'footnotes': return `<ol class="footnotes">${(node.content ?? []).map((one) => `<li>${kids(one)}</li>`).join('')}</ol>`
      // A graph is drawn by the app, which a static page cannot: its formulas are what it is made of (10 Nov: it vanished).
      case 'graph': { const lines = ((node.attrs?.expressions ?? []) as Array<{ text?: string }>).map((one) => String(one.text ?? '').trim()).filter(Boolean); return lines.length ? `<figure class="graph"><pre><code>${escape(lines.join('\n'))}</code></pre><figcaption>A graph of these, drawn in Haligtree</figcaption></figure>` : '' }
      case 'excalidraw': return '<p><em>A drawing, kept in the book.</em></p>'
      // A file, a meeting's recording, a PDF: kept in the app, not on a web page.
      case 'attachment': case 'meeting': case 'imagePlaceholder': return ''
      default: return node.content ? kids(node) : inline([node])
    }
  }
  // The first line, when it is the title the page already shows over it, is not said twice.
  const doc = value as Doc
  const plain = (text: string): string => text.replace(/\s+/g, ' ').trim().toLowerCase()
  const first = doc.content?.[0]
  const lead = first && (first.type === 'paragraph' || first.type === 'heading') ? plain((first.content ?? []).map((one) => one.text ?? '').join('')) : ''
  return block(lead && lead === plain(title) ? { ...doc, content: doc.content!.slice(1) } : doc)
}

const STYLE = `:root{color-scheme:light dark;--ink:#1d1c1a;--soft:#6b6862;--page:#fbfaf7;--rule:#e4e1da;--link:#2f5fa7}
@media (prefers-color-scheme:dark){:root{--ink:#ecebe6;--soft:#a3a09a;--page:#1b1b1a;--rule:#34332f;--link:#8db4ef}}
*{box-sizing:border-box}body{overflow-wrap:anywhere;margin:0;background:var(--page);color:var(--ink);font:18px/1.65 Georgia,'Iowan Old Style',serif}
main{max-width:40rem;margin:0 auto;padding:3rem 1.25rem 4rem}nav{font:14px/1.4 -apple-system,system-ui,sans-serif;color:var(--soft);margin-bottom:2rem}
h1{font-size:2rem;line-height:1.2;margin:0 0 1.5rem}h2,h3,h4{line-height:1.3;margin:2rem 0 .5rem}a{color:var(--link)}img{max-width:100%;height:auto;border-radius:4px}
figure{margin:1.5rem 0}figcaption{font-size:.85em;color:var(--soft)}blockquote,aside.callout{margin:1.25rem 0;padding:.25rem 1rem;border-left:3px solid var(--rule)}
pre{overflow-x:auto;padding:.75rem 1rem;border:1px solid var(--rule);border-radius:4px;font-size:.85em}code{font-family:ui-monospace,Menlo,monospace;font-size:.9em}
table{border-collapse:collapse;width:100%;display:block;overflow-x:auto}td,th{border:1px solid var(--rule);padding:.35rem .6rem;text-align:left;vertical-align:top}
mark{background:#f5e27a66;color:inherit}ul.tasks li.done{text-decoration:line-through;color:var(--soft)}hr{border:0;border-top:1px solid var(--rule);margin:2rem 0}
.columns{display:grid;gap:1.5rem;grid-template-columns:repeat(auto-fit,minmax(14rem,1fr))}footer{margin-top:3rem;padding-top:1rem;border-top:1px solid var(--rule);font:15px/1.5 -apple-system,system-ui,sans-serif;color:var(--soft)}
footer h2{font-size:1em;font-weight:600;margin:1rem 0 .25rem}footer ul{padding-left:1.1rem}`

/** The notes to publish: the one asked for, then each step out along its links, never a private or thrown-away one. */
function gather(start: string): Page[] {
  const db = database()
  const read = (id: string): Omit<Page, 'file'> | undefined =>
    (db.prepare(`select id, ${LABEL} as title, body from captures where id = ? and private = 0 and status != 'discarded'`).get(id) ??
      db.prepare("select id, coalesce(nullif(nullif(trim(title), 'Untitled'), ''), label('', body)) as title, body from nuggets where id = ? and private = 0 and binned_at is null and tier not in ('card', 'deck')").get(id)) as Omit<Page, 'file'> | undefined
  const found = new Map<string, Omit<Page, 'file'>>()
  const first = read(start)
  if (!first) return []
  found.set(first.id, first)
  let ring = [first]
  for (let step = 0; step < STEPS && found.size < MOST; step++) {
    const next: Omit<Page, 'file'>[] = []
    for (const page of ring)
      for (const link of mentionsIn(page.body).keys()) {
        const id = link.replace(/^[a-z]+:/, '')
        if (found.has(id) || found.size >= MOST) continue
        const one = read(id)
        if (one) (found.set(id, one), next.push(one))
      }
    ring = next
  }
  // Each its own file name, the first page the folder's index.
  const taken = new Set<string>(['index'])
  return [...found.values()].map((page, at) => {
    if (!at) return { ...page, file: 'index.html' }
    let name = slug(page.title)
    for (let n = 2; taken.has(name); n++) name = `${slug(page.title)}-${n}`
    taken.add(name)
    return { ...page, file: `${name}.html` }
  })
}

/** Writes the site into a new folder inside `parent`; its index page's path, and the page count. */
export async function publishSite(start: string, parent: string): Promise<{ index: string; pages: number } | 'private' | 'gone'> {
  const pages = gather(start)
  if (!pages.length) return database().prepare('select 1 from captures where id = ? and private = 1 union all select 1 from nuggets where id = ? and private = 1').get(start, start) ? 'private' : 'gone'
  let folder = join(parent, slug(pages[0].title))
  for (let n = 2; existsSync(folder); n++) folder = join(parent, `${slug(pages[0].title)}-${n}`)
  await mkdir(join(folder, 'pictures'), { recursive: true })
  const byId = new Map(pages.map((page) => [page.id, page]))
  const assets = join(app.getPath('userData'), 'assets')
  const pictures = new Map<string, string>()
  const pictureOf = (src: string): string => {
    const own = /^haligtree:\/\/assets\/([^?#]+)/.exec(src)
    if (!own) return /^(https?:|data:image\/)/i.test(src) ? src : ''
    const name = basename(decodeURIComponent(own[1]))
    pictures.set(name, join(assets, name))
    return `pictures/${encodeURIComponent(name)}`
  }
  // Which published pages link to each, for a page's own "Linked from here" and "Links here" lines.
  const into = new Map<string, Set<string>>()
  for (const page of pages) for (const link of mentionsIn(page.body).keys()) {
    const to = link.replace(/^[a-z]+:/, '')
    if (to !== page.id && byId.has(to)) into.set(to, (into.get(to) ?? new Set()).add(page.id))
  }
  const hidden = (id: string): boolean => !!database().prepare('select 1 from captures where id = ? and private = 1 union all select 1 from nuggets where id = ? and private = 1').get(id, id)
  const list = (ids: Iterable<string>): string => [...ids].map((id) => byId.get(id)!).map((page) => `<li><a href="${page.file}">${escape(page.title)}</a></li>`).join('')
  for (const page of pages) {
    const words = pageHtml(page.body, (id) => byId.get(id)?.file, pictureOf, page.title, hidden)
    const out = [...mentionsIn(page.body).keys()].map((link) => link.replace(/^[a-z]+:/, '')).filter((id) => id !== page.id && byId.has(id))
    const back = [...(into.get(page.id) ?? [])]
    const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(page.title)}</title><link rel="stylesheet" href="style.css"></head>
<body><main>
${page.file === 'index.html' ? '' : `<nav><a href="index.html">${escape(pages[0].title)}</a></nav>`}
<h1>${escape(page.title)}</h1>
${words}
${out.length || back.length ? `<footer>${out.length ? `<h2>Links from here</h2><ul>${list(new Set(out))}</ul>` : ''}${back.length ? `<h2>Links here</h2><ul>${list(back)}</ul>` : ''}</footer>` : ''}
</main></body></html>
`
    await writeFile(join(folder, page.file), html)
  }
  await writeFile(join(folder, 'style.css'), STYLE)
  for (const [name, from] of pictures) await copyFile(from, join(folder, 'pictures', name)).catch(() => undefined)
  return { index: join(folder, 'index.html'), pages: pages.length }
}

export function registerSite(): void {
  // Where to put it, asked first and on its own, so nothing says "Publishing…" while the folder sheet is open.
  ipcMain.handle('haligtree:site:pick', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const options = { title: 'Publish as a website', message: 'A folder of web pages is made inside the folder you choose.', buttonLabel: 'Publish here', properties: ['openDirectory' as const, 'createDirectory' as const] }
    const picked = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
    return picked.canceled ? null : picked.filePaths[0] ?? null
  })
  // The note and its links into a folder inside `parent`, then shown in Finder (not while testing).
  ipcMain.handle('haligtree:site:publish', async (_event, id: unknown, parent: unknown) => {
    if (typeof id !== 'string' || typeof parent !== 'string' || !parent) return 'gone'
    // A folder that cannot be written to (locked, full, gone) says so, rather than failing without a word.
    const made = await publishSite(id, parent).catch((error: NodeJS.ErrnoException) => ({ failed: error?.code === 'EACCES' || error?.code === 'EPERM' ? 'That folder cannot be written to' : error?.code === 'ENOSPC' ? 'The disk is full' : 'The pages could not be written' }))
    if (typeof made === 'object' && 'index' in made && !process.env.HALIGTREE_QA_AWAY) showOutside(made.index)
    return made
  })
}
