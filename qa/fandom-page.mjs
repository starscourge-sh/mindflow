// A Fandom wiki page as Fandom's desktop skin sends it, saved here so no probe asks the live site: the article in
// .mw-parser-output, its infobox an <aside class="portable-infobox"> with tabs of pictures, each picture in the words
// lazy (a 1px GIF in src, the real address in data-src, its file's name in data-image-key), a caption under each,
// [edit] marks, navigation boxes at the foot. `sections` sets its length: 60 is about the size of Harry Potter's page.
import { deflateSync, crc32 } from 'node:zlib'

/** A plain picture of one colour, as PNG bytes in base64. */
export const png = (r, g, b, w = 64, h = 36) => {
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
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]).toString('base64')
}

export function fandomPage({ site, cdn, sections = 60, perSection = 3 }) {
  const gif = 'data:image/gif;base64,R0lGODlhAQABAIABAAAAAP///yH5BAEAAAEALAAAAAABAAEAQAICTAEAOw%3D%3D'
  const file = (n) => `${cdn}/harrypotter/images/${n % 10}/${n}a/Picture_${n}.jpg/revision/latest`
  const link = (word) => `<a href="/wiki/${word}" title="${word}">${word}</a>`
  const words = 'Hogwarts Gryffindor Quidditch wand Hagrid Dumbledore Ministry Azkaban Patronus Horcrux'.split(' ')
  const para = (n) =>
    `<p>In the year that followed, ${link(words[n % 10])} and ${link(words[(n + 3) % 10])} came to matter more than either had guessed. ` +
    Array.from({ length: 9 }, (_, i) => `The ${i ? 'next' : 'first'} part of the story turned on ${link(words[(n + i) % 10])}, as the record of event ${n}.${i} tells it at some length for anyone who reads this far`).join('. ') +
    `.<sup id="cite_ref-${n}" class="reference"><a href="#cite_note-${n}">[${n}]</a></sup></p>`
  const picture = (n, caption) =>
    `<figure class="thumb tright show-info-icon" style="width: 250px"><a href="${file(n)}?cb=2019" class="image">` +
    `<img alt="${caption}" src="${gif}" decoding="async" loading="lazy" width="250" height="180" data-src="${file(n)}/scale-to-width-down/250?cb=2019" data-image-name="Picture ${n}.jpg" data-image-key="Picture_${n}.jpg" data-relevant="0" class="thumbimage lazyload"></a>` +
    `<figcaption class="thumbcaption"><a href="/wiki/File:Picture_${n}.jpg" class="info-icon"><svg><use xlink:href="#wds-icons-info-small"></use></svg></a><p class="caption">${caption}</p></figcaption></figure>`
  let n = 0
  const body = Array.from({ length: sections }, (_, s) => {
    const parts = [`<h2><span class="mw-headline" id="Section_${s}">Part ${s + 1} of the life</span><span class="mw-editsection"><span class="mw-editsection-bracket">[</span><a href="/wiki/Harry_Potter?action=edit&amp;section=${s}">edit</a><span class="mw-editsection-bracket">]</span></span></h2>`]
    for (let p = 0; p < perSection; p++) {
      n++
      if (p === 1) parts.push(picture(n, n === 2 ? 'Harry as an infant with his parents' : `A scene from part ${s + 1}, picture ${n}`))
      parts.push(para(n))
    }
    return parts.join('\n')
  }).join('\n')
  const infobox =
    `<aside role="region" class="portable-infobox pi-background pi-border-color pi-theme-character pi-layout-default">` +
    `<section class="pi-item pi-panel pi-border-color wds-tabber"><div class="wds-tabs__wrapper"><ul class="wds-tabs"><li class="wds-tabs__tab wds-is-current" data-hash="Film"><div class="wds-tabs__tab-label"><a href="#">Film</a></div></li><li class="wds-tabs__tab" data-hash="TV_series"><div class="wds-tabs__tab-label"><a href="#">TV series</a></div></li></ul></div>` +
    `<div class="wds-tab__content wds-is-current"><figure class="pi-item pi-image" data-source="image"><a href="${cdn}/harrypotter/images/9/97/Harry_Potter.jpg/revision/latest?cb=20140603201724" class="image image-thumbnail" title=""><img src="${cdn}/harrypotter/images/9/97/Harry_Potter.jpg/revision/latest/scale-to-width-down/268?cb=20140603201724" class="pi-image-thumbnail" alt="Harry Potter" width="268" height="361" data-image-key="Harry_Potter.jpg" data-image-name="Harry Potter.jpg"></a></figure></div>` +
    `<div class="wds-tab__content"><figure class="pi-item pi-image" data-source="image"><a href="${cdn}/harrypotter/images/1/12/Harry_TV.jpg/revision/latest?cb=2026" class="image image-thumbnail"><img src="${gif}" data-src="${cdn}/harrypotter/images/1/12/Harry_TV.jpg/revision/latest/scale-to-width-down/268?cb=2026" class="pi-image-thumbnail lazyload" alt="Harry Potter (TV series)" width="268" height="361" data-image-key="Harry_TV.jpg" data-image-name="Harry TV.jpg"></a></figure></div></section>` +
    `<h2 class="pi-item pi-item-spacing pi-title pi-secondary-background" data-source="name">Harry James Potter</h2>` +
    `<section class="pi-item pi-group pi-border-color"><h2 class="pi-item pi-header pi-secondary-font pi-item-spacing pi-secondary-background">Biographical information</h2>` +
    [['Born', `${link('31 July')} 1980, ${link("Godric's Hollow")}`], ['Blood status', link('Half-blood')], ['Marital status', 'Married'], ['Nationality', link('English')]]
      .map(([label, value]) => `<div class="pi-item pi-data pi-item-spacing pi-border-color" data-source="${label}"><h3 class="pi-data-label pi-secondary-font">${label}</h3><div class="pi-data-value pi-font">${value}</div></div>`)
      .join('') +
    `</section></aside>`
  const navbox = `<table class="navbox"><tbody>${Array.from({ length: 40 }, (_, i) => `<tr><td>${words.map(link).join(' • ')} ${i}</td></tr>`).join('')}</tbody></table>`
  return `<!DOCTYPE html><html lang="en" dir="ltr"><head><meta charset="UTF-8"><title>Harry Potter | Harry Potter Wiki | Fandom</title>
<meta property="og:type" content="article"><meta property="og:site_name" content="Harry Potter Wiki"><meta property="og:title" content="Harry Potter">
<meta property="og:image" content="${cdn}/harrypotter/images/9/97/Harry_Potter.jpg/revision/latest?cb=20140603201724"></head>
<body class="mediawiki skin-fandomdesktop"><div class="global-navigation"><a href="/wiki/Special:Search">Search</a> <a href="/f">Discuss</a></div>
<main class="page__main" id="content"><div class="page-header"><h1 class="page-header__title" id="firstHeading"><span class="mw-page-title-main">Harry Potter</span></h1></div>
<div id="mw-content-text" class="mw-body-content"><div class="mw-parser-output">
${infobox}
<div class="quote"><dl><dd><i>"You are protected, in short, by your ability to love!"</i></dd><dd>Albus Dumbledore</dd></dl></div>
<p><b>Harry James</b> <b>Potter</b> (b. ${link('31 July')} 1980) was an ${link('English')} half-blood ${link('wizard')}, and one of the most famous wizards of modern times.</p>
${body}
${navbox}
</div></div></main><div class="page__right-rail"><section class="rail-module"><h2>Recent Images</h2></section></div></body></html>`
}
