// A stand-in for the free sites the reader searches and reads (src/main/free-sites.ts):
// Wikipedia's search and two of its articles, Wiktionary's search, Project Gutenberg's
// catalogue, the Stanford Encyclopedia of Philosophy's search and Wikimedia's pictures,
// on this machine. Set HALIGTREE_QA_SITES to its address before the app starts:
// main sends every ask for those sites here (src/main/outside.ts), so a test never asks
// the real ones. `asked` lists every ask; `offline(true)` makes each one fail as a Mac
// with no network would.
import { createServer } from 'node:http'
import { deflateSync, crc32 } from 'node:zlib'

const png = (r, g, b, w = 64, h = 40) => {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data])
    const out = Buffer.alloc(8 + data.length + 4)
    out.writeUInt32BE(data.length, 0)
    body.copy(out, 4)
    out.writeUInt32BE(crc32(body), 8 + data.length)
    return out
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(w, 0); header.writeUInt32BE(h, 4); header[8] = 8; header[9] = 2
  const rows = Buffer.concat(Array.from({ length: h }, () => Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [r, g, b]).flat())])))
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))])
}

const para = (topic, n) => `<p>${topic} paragraph ${n} walks through the provinces, the roads between them and the people who kept the peace, with enough words here that the reader calls this an article and not a scrap of a page.</p>`
/** A heading as Wikipedia draws it now: in a box beside its "[edit]" link, which once cost the reader most of a page's headings. */
const heading = (level, words) => `<div class="mw-heading mw-heading${level}"><h${level} id="${words.replace(/ /g, '_')}">${words}</h${level}><span class="mw-editsection"><span class="mw-editsection-bracket">[</span><a href="/w/index.php?title=Roman_Empire&amp;action=edit&amp;section=1" title="Edit section: ${words}"><span>edit</span></a><span class="mw-editsection-bracket">]</span></span></div>`
const article = (title, body) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${title} - Wikipedia</title><meta property="og:title" content="${title}"><meta property="og:site_name" content="Wikipedia"></head><body>
<div id="mw-navigation"><a href="/wiki/Main_Page">Main page</a> <a href="/wiki/Special:Random">Random article</a></div>
<main id="content"><h1 id="firstHeading">${title}</h1><div id="bodyContent"><div class="mw-parser-output">${body}</div></div></main>
<footer>Text is available under the Creative Commons Attribution-ShareAlike 4.0 License</footer></body></html>`

export const ROMAN = 'https://en.wikipedia.org/wiki/Roman_Empire'
export const BYZANTINE = 'https://en.wikipedia.org/wiki/Byzantine_Empire'
/** An article the stand-in takes a moment and a half to send, to see the reader while it reads. */
export const CARTHAGE = 'https://en.wikipedia.org/wiki/Carthage'
const pages = {
  '/en.wikipedia.org/wiki/Roman_Empire': article('Roman Empire', `
    <p>The <b>Roman Empire</b> was the state ruled by the Romans after Augustus took sole rule, and it lasted in the west until the fifth century and in the east, as the <a href="/wiki/Byzantine_Empire" title="Byzantine Empire">Byzantine Empire</a>, for a thousand years more.<sup class="reference"><a href="#cite_note-1">[1]</a></sup> Its story is told on <a href="https://example.org/rome-elsewhere">a page elsewhere</a> too.</p>
    <figure typeof="mw:File/Thumb"><a href="/wiki/File:Colosseum.jpg" class="mw-file-description"><img src="//upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Colosseum.jpg/250px-Colosseum.jpg" width="250" height="160" alt="The Colosseum"></a><figcaption>The Colosseum in Rome</figcaption></figure>
    ${para('The opening', 1)}${para('The opening', 2)}
    ${heading(2, 'History')}
    ${para('History', 1)}${para('History', 2)}${para('History', 3)}
    ${heading(3, 'Pax Romana')}
    <p>The Pax Romana was a long peace that lasted about two centuries across the empire and its provinces.</p>
    <figure typeof="mw:File/Thumb"><a href="/wiki/File:Film_poster.jpg" class="mw-file-description"><img src="//upload.wikimedia.org/wikipedia/en/c/cc/Film_poster.jpg" width="200" height="300" alt="A film poster"></a><figcaption>A film poster, held here under fair use</figcaption></figure>
    ${para('Pax Romana', 1)}${para('Pax Romana', 2)}
    ${heading(2, 'Legacy')}
    ${para('Legacy', 1)}<p>Its law and its roads outlived it, and so did <a href="/wiki/Byzantine_Empire">the empire in the east</a>, which kept its name for a thousand years.</p>
    ${Array.from({ length: 13 }, (_, n) => para('Legacy', n + 2)).join('')}
    ${heading(2, 'References')}<ol class="references"><li id="cite_note-1">Gibbon, The History of the Decline and Fall of the Roman Empire.</li></ol>`),
  '/en.wikipedia.org/wiki/Byzantine_Empire': article('Byzantine Empire', `
    <p>The <b>Byzantine Empire</b>, also called the Eastern Roman Empire, was the continuation of the <a href="/wiki/Roman_Empire">Roman Empire</a> in its eastern provinces, ruled from Constantinople.</p>
    ${para('Byzantium', 1)}${para('Byzantium', 2)}
    <h2 id="Name">Name</h2>${para('The name', 1)}${para('The name', 2)}`),
  '/en.wikipedia.org/wiki/Carthage': article('Carthage', `<p>The city of <b>Carthage</b> stood on the coast of North Africa.</p>${para('Carthage', 1)}${para('Carthage', 2)}
    ${heading(2, 'History')}${para('Its history', 1)}${heading(2, 'Legacy')}${para('Its legacy', 1)}`)
}
const search = {
  'en.wikipedia.org': {
    pages: [
      { id: 1, key: 'Roman_Empire', title: 'Roman Empire', excerpt: 'The <span class="searchmatch">Roman</span> <span class="searchmatch">Empire</span> was the state ruled by the Romans', description: 'State and civilisation, 27 BC to AD 476', thumbnail: { url: '//thumb.wikimedia.org/wikipedia/commons/thumb/0/00/Trajan_117AD.png/60px-Trajan_117AD.png?utm_source=en.wikipedia.org' } },
      { id: 2, key: 'Holy_Roman_Empire', title: 'Holy Roman Empire', excerpt: 'The Holy <span class="searchmatch">Roman</span> Empire was a polity in Central Europe', description: 'Empire in Central Europe, 800 to 1806', thumbnail: { url: '//upload.wikimedia.org/wikipedia/en/thumb/1/12/Crown.png/60px-Crown.png' } },
      { id: 3, key: 'Byzantine_Empire', title: 'Byzantine Empire', excerpt: 'The Byzantine Empire, also called the Eastern <span class="searchmatch">Roman</span> <span class="searchmatch">Empire</span>', description: null, thumbnail: null }
    ]
  },
  'en.wiktionary.org': { pages: [{ id: 9, key: 'serendipity', title: 'serendipity', excerpt: 'A combination of events which have come about by chance, with a happy result', description: null, thumbnail: null }] }
}
const GUTENBERG = `<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Books: frankenstein</title>
<entry><id>https://www.gutenberg.org/ebooks/authors/search.opds/?query=frankenstein</id><title>Authors</title><content type="text">One author name matches your search.</content></entry>
<entry><id>https://www.gutenberg.org/ebooks/84.opds</id><title>Frankenstein; or, The modern Prometheus</title><content type="text">Mary Wollstonecraft Shelley</content></entry></feed>`
const SEP = `<html><body><div class="search_results"><div class="result_listing"><div class="result_title"><a class=l href="https://plato.stanford.edu/search/r?entry=/entries/kant/&rank=0&query=kant">Immanuel <b>Kant</b></a></div>
<div class="result_snippet">Kant, Immanuel: moral philosophy<!-- 21.3 = (MATCH) sum of --></div><div class="result_author">Michael Rohlf
</div><div class="result_url"><a href="https://plato.stanford.edu/search/r?entry=/entries/kant/">https://plato.stanford.edu/entries/kant/</a></div></div></div></body></html>`

/** Starts the stand-in; resolves to its address, the asks it has had, and its offline switch. */
export async function standIn() {
  const asked = []
  let down = false
  const server = createServer((request, response) => {
    asked.push(request.url)
    if (down) return void request.socket.destroy()
    const url = new URL(request.url, 'http://stand-in')
    const [, host] = url.pathname.split('/')
    const send = (status, type, body) => (response.writeHead(status, { 'content-type': type }), response.end(body))
    // As Wikimedia does: a request naming no app (Node's bare "node", or nothing) is turned away with a 429, which the
    // app once said as "this Mac seems to be offline" (15 Nov 2026).
    const agent = request.headers['user-agent'] ?? ''
    if (!agent || agent === 'node' || /^undici/i.test(agent)) return send(429, 'text/plain', 'Too many requests')
    if (url.pathname.endsWith('/w/rest.php/v1/search/page') && search[host]) return send(200, 'application/json', JSON.stringify(search[host]))
    if (url.pathname === '/www.gutenberg.org/ebooks/search.opds/') return send(200, 'application/atom+xml', GUTENBERG)
    if (url.pathname === '/plato.stanford.edu/search/searcher.py') return send(200, 'text/html; charset=utf-8', SEP)
    if (url.pathname === '/en.wikipedia.org/wiki/Carthage') return void setTimeout(() => send(200, 'text/html; charset=utf-8', pages[url.pathname]), 1500)
    if (pages[url.pathname]) return send(200, 'text/html; charset=utf-8', pages[url.pathname])
    // At the size its address says, as Wikimedia's own are ("250px-Colosseum.jpg" is 250 wide), or a photo's size: the
    // reader's cleaner measures each picture's file, and drops one the size of an icon.
    if (/^\/(upload|thumb)\.wikimedia\.org\//.test(url.pathname)) {
      const wide = Number(/\/(\d+)px-[^/]+$/.exec(url.pathname)?.[1] ?? 640)
      return send(200, 'image/png', png(150, 110, 60, wide, Math.round(wide * 0.75)))
    }
    send(404, 'text/plain', 'not here')
  })
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  return { base: `http://127.0.0.1:${server.address().port}`, asked, offline: (on) => void (down = on), close: () => server.close() }
}
