import { parseHTML } from 'linkedom'

/**
 * A page's article, as Readability found it (classes kept), cleaned to read as a page of the book: words, lists,
 * tables, quotes, code, the article's own pictures and links whole. Each picture is the version a desktop reader sees,
 * once; icons, logos, badges and a site's buttons go, so nothing reads as a page with broken CSS.
 */

/** A picture kept here (its haligtree: address) and its size as read from its file; or the site's address it stays at. */
export type Kept = { kept: string; size: { width?: number; height?: number; type?: string } | null }

/**
 * What may stay in a kept article: words, lists, tables, quotes, code, pictures and links. Anything else goes, with
 * what it held: a site's menus and pop-ups too.
 */
const DROP = 'script, style, iframe, object, embed, form, input, button, select, textarea, noscript, svg, canvas, video, audio, link, meta, nav, dialog, [role=navigation], [role=dialog], [role=alertdialog], [aria-modal=true]'

/** A picture under this many pixels on both sides is an icon (an arrow, an avatar, an app's mark): kept only inside a line of words, at the words' size. */
const ICON = 100
/** One thinner than this with no words to say what it is (alt) is a strip of decoration, a rule or a scribble. */
const THIN = 48

/** What a desktop reader is shown: a window this wide, at twice the pixels, the column 40rem. */
const WIDE = 1280
const SHARP = 1300

/** Whether a `<source>`'s media query is one a wide window on a light page meets. */
const wide = (media: string | null): boolean =>
  [...(media ?? '').matchAll(/\(\s*([a-z-]+)\s*:\s*([^)]+)\)/gi)].every(([, feature, value]) => {
    const px = parseFloat(value) * (/em/.test(value) ? 16 : 1)
    if (/^min-width$/i.test(feature)) return px <= WIDE
    if (/^max-width$/i.test(feature)) return px >= WIDE
    if (/^prefers-color-scheme$/i.test(feature)) return /light/i.test(value)
    if (/^orientation$/i.test(feature)) return /landscape/i.test(value)
    return true
  })

/**
 * Of a srcset, the picture sharp enough for the column at twice the pixels, or its largest. Read as a browser reads
 * one: an address runs to the next space (it may hold commas, as an image service's do), its size to the next comma.
 */
const sharpest = (srcset: string): string | null => {
  const each: { url: string; size: number }[] = []
  for (let at = 0; at < srcset.length; ) {
    while (at < srcset.length && /[\s,]/.test(srcset[at])) at++
    const gap = srcset.slice(at).search(/\s/)
    let url = srcset.slice(at, gap < 0 ? undefined : at + gap)
    at = gap < 0 ? srcset.length : at + gap
    let said = '1x'
    if (/,$/.test(url)) url = url.replace(/,+$/, '')
    else {
      const comma = srcset.indexOf(',', at)
      said = srcset.slice(at, comma < 0 ? undefined : comma).trim() || '1x'
      at = comma < 0 ? srcset.length : comma + 1
    }
    if (url) each.push({ url, size: parseFloat(said) * (/x$/.test(said) ? SHARP / 2 : 1) || SHARP / 2 })
  }
  each.sort((a, b) => a.size - b.size)
  return (each.find((one) => one.size >= SHARP) ?? each.at(-1))?.url ?? null
}

/** Classes that hide a thing on a wide window: Tailwind's, Bootstrap's and the plain words sites use. */
const hiddenWide = (classes: string): boolean => {
  const all = classes.split(/\s+/)
  const has = (re: RegExp): boolean => all.some((one) => re.test(one))
  if (has(/^(sm|md|lg|xl):hidden$|^d-(sm|md|lg|xl)-none$|^hidden-(md|lg)$|^visible-(xs|sm)$|^(mobile|phone)[-_]?only$|^only[-_](mobile|phone)$|^(show|visible)[-_](on[-_])?(mobile|phone)$|^(hide|hidden)[-_](on[-_])?(desktop|large)$/i)) return true
  // Hidden everywhere, unless a wider window shows it again.
  return has(/^(hidden|d-none)$/) && !has(/^(sm|md|lg|xl):(block|inline|inline-block|flex|inline-flex|grid|table)$|^d-(sm|md|lg|xl)-(block|inline|inline-block|flex|inline-flex|grid|table)$/)
}

/**
 * A picture's place and name without the words that tell its sizes apart ("-wide", "/mobile/", "@2x", "800w",
 * "1024x683"), to find one picture's versions: its folder counts (two videos' "hqdefault.jpg" are two pictures), and
 * for an image service (Next.js's /_next/image?url=...) the picture it serves.
 */
const stem = (src: string): string => {
  const at = URL.parse(src, 'https://x')
  const served = at?.searchParams.get('url')
  return ((served ? URL.parse(served, 'https://x')?.pathname : at?.pathname) ?? '')
    .replace(/\.[a-z0-9]+$/i, '')
    .toLowerCase()
    .split(/[/\-_.@\s]+/)
    .filter((word) => word && !/^(wide|narrow|desktop|mobile|tablet|phone|small|medium|large|sm|md|lg|xl|xs|xxl|portrait|landscape|retina|full|half|\d+(w|px|x|x\d+)?)$/.test(word))
    .join('-')
}

/** Words of a link or a line, without the arrows and marks sites draw as glyphs. */
const wordsOf = (one: Element): string => (one.textContent ?? '').replace(/[\s↗→←↑↓›»«‹➔➜⟶•·|]+/g, '')

/** A picture that is decoration, not the article's: a logo, an icon, a badge, a scribble, a spacer. */
const DECOR = /(^|[-_./])(logo|icon|arrow|badge|seal|spacer|pixel|divider|separator|ornament|flourish|squiggle|scribble|swoosh|sprite|decor)/i

/** Where a site that loads its pictures as they scroll into view keeps each one's real address (lazysizes, WordPress, Fandom). */
const LAZY = ['data-src', 'data-lazy-src', 'data-original', 'data-lazy', 'data-hi-res-src', 'data-full-src', 'data-url']
const LAZY_SET = ['data-srcset', 'data-lazy-srcset']

/**
 * A page made ready before Readability reads it. A picture loaded only as it scrolls into view gets its real address
 * from the attribute that holds it: Readability guesses from every attribute that ends in ".jpg", and on Fandom, whose
 * pictures carry their file's bare name too (data-image-key="Harry_infant.jpg"), the guess can land on that name, a
 * page on the wiki and no picture. A Fandom infobox (an <aside>, which Readability drops with all it holds) becomes its
 * picture, captioned with its name, and a table of its facts.
 */
export function beforeReading(page: ReturnType<typeof parseHTML>['document']): void {
  for (const one of page.querySelectorAll('img')) {
    const src = one.getAttribute('src') ?? ''
    const lazy = /lazy/i.test(one.getAttribute('class') ?? '') || !src || /^data:/i.test(src)
    const real = LAZY.map((name) => one.getAttribute(name) ?? '').find((value) => value.trim() && !/^data:/i.test(value.trim()))
    const set = LAZY_SET.map((name) => one.getAttribute(name) ?? '').find((value) => value.trim())
    if (lazy && real) one.setAttribute('src', real.trim())
    if (lazy && set) one.setAttribute('srcset', set)
    if (lazy && (real || set)) one.setAttribute('class', (one.getAttribute('class') ?? '').replace(/\S*lazy\S*/gi, ''))
  }
  for (const box of [...page.querySelectorAll('aside.portable-infobox')]) {
    // The picture on show: the first tab's, when it has tabs (Film, TV series).
    const picture = box.querySelector('.pi-image img, img')
    const name = box.querySelector('.pi-title')?.textContent?.trim() ?? ''
    const facts = [...box.querySelectorAll('.pi-data')].filter((one) => one.querySelector('.pi-data-label') && one.querySelector('.pi-data-value'))
    const kept = page.createElement('div')
    if (picture) {
      const figure = page.createElement('figure')
      figure.append(picture)
      if (name) {
        const caption = page.createElement('figcaption')
        caption.textContent = name
        figure.append(caption)
      }
      kept.append(figure)
    }
    if (facts.length) {
      const table = page.createElement('table')
      for (const one of facts) {
        const row = page.createElement('tr')
        const label = page.createElement('th')
        label.textContent = one.querySelector('.pi-data-label')?.textContent?.trim() ?? ''
        const value = page.createElement('td')
        value.append(...one.querySelector('.pi-data-value')!.childNodes)
        row.append(label, value)
        table.append(row)
      }
      kept.append(table)
    }
    box.replaceWith(kept)
  }
}

/** Why a picture was not kept here: the site would not send it, did not answer, was too slow, or the reading was stopped first. */
export type Missed = { why: 'refused' | 'unreached' | 'slow' | 'stopped' }

/** The line a picture the site did not send becomes, said plainly: a link to it there. */
const MISSED: Record<Missed['why'], string> = {
  refused: 'Picture the site would not send',
  unreached: 'Picture that could not be reached',
  slow: 'Picture the site was too slow to send',
  stopped: 'Picture not brought, as the reading was stopped'
}

/**
 * The article cleaned in two steps, so its words show before its pictures come. `html` holds the words, each picture
 * a stand-in marked `data-wait` with the index of its address in `pictures`; `judge` settles one picture as it arrives
 * (the same file twice shows where it came first), giving the HTML that takes its stand-in's place ('' when it goes); `finish` gives the whole article once every
 * picture is settled. `site` is the site's name, `title` the name the article is kept under.
 */
export function cleanInParts(content: string, base: URL, site: string, title = ''): { html: string; pictures: string[]; judge: (at: number, got: Kept | Missed) => string; finish: () => string } {
  const { document: clean } = parseHTML(`<!doctype html><html><body>${content}</body></html>`)
  for (const one of clean.querySelectorAll(DROP)) one.remove()
  // A first heading that only repeats the name the article is kept under (the page's own heading, when its titles said
  // only "Home"): the reader sets the title over the words, so it never shows twice. Readability takes off only a
  // heading that repeats the title it found itself.
  const words = (text: string): string => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
  const first = clean.querySelector('h1, h2, h3')
  if (words(title) && first && words(first.textContent ?? '') === words(title)) first.remove()
  // Of each picture's versions, the one a desktop reader sees, read from its sources and classes before they are stripped:
  // a <picture>'s first source a wide window takes, a srcset's sharpest for the column, and nothing a wide window hides.
  for (const one of clean.querySelectorAll('picture')) {
    const source = [...one.querySelectorAll('source[srcset]')].find((each) => wide(each.getAttribute('media')) && /^$|^image\/(webp|avif|png|jpe?g|gif|svg)/.test(each.getAttribute('type') ?? ''))
    one.querySelector('img')?.setAttribute('srcset', source?.getAttribute('srcset') ?? one.querySelector('img')?.getAttribute('srcset') ?? '')
    for (const each of one.querySelectorAll('source')) each.remove()
  }
  for (const one of clean.querySelectorAll('img[srcset]')) {
    const best = sharpest(one.getAttribute('srcset') ?? '')
    if (best) one.setAttribute('src', best)
  }
  for (const one of clean.querySelectorAll('[class]')) if (hiddenWide(one.getAttribute('class') ?? '') && !wordsOf(one) && (one.matches('img') || one.querySelector('img'))) one.remove()
  // A site's own versions side by side (its wide one and its narrow one, a class apart): the widest stays.
  for (const one of clean.querySelectorAll('img')) {
    let next = one.nextSibling
    while (next && next.nodeType === 3 && !next.textContent?.trim()) next = next.nextSibling
    if (next?.nodeType !== 1 || (next as Element).tagName !== 'IMG' || !stem(one.getAttribute('src') ?? '') || stem(one.getAttribute('src') ?? '') !== stem((next as Element).getAttribute('src') ?? '')) continue
    const width = (img: Element): number => Number(img.getAttribute('width')) || 0
    ;(width(next as Element) > width(one) ? one : (next as Element)).remove()
  }
  // A link drawn as a site's button ("Download", "Learn more ↗"): kept only where it reads in a sentence.
  const buttons = new Set([...clean.querySelectorAll('a')].filter((one) => one.hasAttribute('data-cta') || one.getAttribute('role') === 'button' || /(^|[\s_-])(btn|button|cta)($|[\s_-])/i.test(one.getAttribute('class') ?? '')))
  for (const one of clean.querySelectorAll('*')) {
    for (const { name } of [...one.attributes]) {
      // A picture's credit (free-sites.ts creditCommons, marked before the cleaning) is the one mark kept.
      if (/^on|^style$|^class$|^id$|^srcset$|^sizes$|^data-(?!credit$)|^loading$|^role$|^aria-/i.test(name)) one.removeAttribute(name)
    }
  }
  for (const one of clean.querySelectorAll('a[href]')) {
    const to = URL.parse(one.getAttribute('href') ?? '', base)
    if (to && /^https?:$/.test(to.protocol)) one.setAttribute('href', to.href)
    else one.removeAttribute('href')
  }
  // Every picture with an address on the web waits for its file, its place held by a stand-in; one with none goes.
  // Where it stood (a line of words, a link and the link's words) is read now, before the tidying below moves it.
  const pictures: string[] = []
  const stood: { one: Element; line: Element | null; link: Element | null; linkWords: string }[] = []
  for (const one of clean.querySelectorAll('img')) {
    const to = URL.parse(one.getAttribute('src') ?? '', base)
    if (!to || !/^https?:$/.test(to.protocol)) {
      one.remove()
      continue
    }
    const link = one.closest('a')
    stood.push({ one, line: one.closest('p, li, figcaption, td, th, dd, dt, blockquote, h1, h2, h3, h4, h5, h6'), link, linkWords: link ? wordsOf(link) : '' })
    one.setAttribute('data-wait', String(pictures.length))
    one.removeAttribute('src')
    pictures.push(to.href)
  }
  const shown = new Set<string>()
  // One picture settled, with its size known: shown, said as a line, or gone (null).
  const judge = (at: number, got: Kept | Missed): Element | null => {
    const { one, line, link, linkWords } = stood[at]
    one.removeAttribute('data-wait')
    const alt = one.getAttribute('alt')?.trim() ?? ''
    // One on this machine's network goes (kept as ''); one the site did not send stays a link to it there, said by its words.
    if ('why' in got || !got.kept.startsWith('haligtree:')) {
      if (('kept' in got && !got.kept) || !alt) return (one.remove(), null)
      const away = clean.createElement('a')
      away.setAttribute('href', pictures[at])
      away.textContent = `${MISSED['why' in got ? got.why : 'refused']}: ${alt}`
      // On a line of its own where the picture stood, unless it stood inside a line of words already.
      if (line) return (one.replaceWith(away), away)
      const own = clean.createElement('p')
      own.append(away)
      return (one.replaceWith(own), own)
    }
    const { kept, size } = got
    const name = URL.parse(pictures[at])?.pathname ?? ''
    // Kept but not a picture a page can show, the same picture again, a logo, or decoration with nothing to say: gone.
    if (!size?.width || !size.height || shown.has(kept)) return (one.remove(), null)
    if (/\b(logo|icon|avatar|background|backdrop)\b/i.test(alt) || (alt && alt.toLowerCase() === site.toLowerCase()) || (!alt && (DECOR.test(name) || size.type === 'svg') && !one.closest('figure'))) return (one.remove(), null)
    // A picture inside a link with words of its own is the link's icon: the words carry the link.
    if (link && linkWords) return (one.remove(), null)
    // Its size as the site means it shown, never more than its file holds (an icon's large file declared at 24px).
    const scale = Math.min(1, (Number(one.getAttribute('width')) || Infinity) / size.width)
    const [w, h] = [size.width * scale, size.height * scale]
    const icon = Math.max(w, h) < ICON
    const strip = !icon && Math.min(w, h) < THIN
    // A small picture that is a link's whole content is a site's button or badge ("Download on the App Store").
    if ((icon || strip) && link) return (one.remove(), null)
    if (strip && !alt) return (one.remove(), null)
    if (icon) {
      // An icon in a sentence stays, at the words' size; on its own it goes.
      if (!line || !wordsOf(line)) return (one.remove(), null)
      one.setAttribute('data-inline', '')
    }
    shown.add(kept)
    one.setAttribute('src', kept)
    return one
  }
  return { html: tidy(clean, buttons), pictures, judge: (at, got) => judge(at, got)?.outerHTML ?? '', finish: () => tidy(clean, buttons) }
}

/** The article's HTML, cleaned at once, every picture fetched first: `keep` keeps a picture here and says its size. */
export async function cleanArticle(content: string, base: URL, site: string, keep: (src: string) => Promise<Kept>, title = ''): Promise<string> {
  const parts = cleanInParts(content, base, site, title)
  const got = await Promise.all(parts.pictures.map(keep))
  got.forEach((one, at) => parts.judge(at, one))
  return parts.finish()
}

/** What is left tidied, with the pictures as they stand (a stand-in counts as one), and its HTML. */
function tidy(clean: ReturnType<typeof parseHTML>['document'], buttons: Set<Element>): string {
  // Links: a block inside one set inline (its arrow then ends its words, never a line of its own); one with no words
  // goes, its picture staying; a button not in a sentence goes.
  for (const one of clean.querySelectorAll('a')) for (const block of one.querySelectorAll('div, p, section, article, header, footer, h1, h2, h3, h4, h5, h6')) block.replaceWith(...block.childNodes, ' ')
  for (const one of clean.querySelectorAll('a')) {
    const block = one.parentElement?.closest('p, li, td, th, dd, blockquote, h1, h2, h3, h4, h5, h6, figcaption')
    if (!wordsOf(one)) one.replaceWith(...one.querySelectorAll('img'))
    else if (buttons.has(one) && (!block || wordsOf(block) === wordsOf(one))) one.remove()
  }
  // A thing drawn from letters (a keyboard of keys, a row of marks): six lines or more of a word or a sign each, gone.
  const sign = (line: Element): boolean => wordsOf(line).length >= 1 && wordsOf(line).length <= 7 && !line.matches('img, table, pre') && !line.querySelector('img, table, pre')
  for (const one of [...clean.querySelectorAll('div, section')].reverse()) {
    const lines = [...one.children]
    if (lines.length >= 6 && lines.filter(sign).length >= lines.length * 0.8) one.remove()
  }
  // A title with nothing after it (a site's closing "Download it free", its buttons gone) introduces nothing: it goes.
  // A heading of more words is a statement of its own (a guarantee, a claim) and stays.
  const last = (): Element | undefined => [...clean.querySelectorAll('p, li, dd, dt, blockquote, pre, table, img, figcaption, h1, h2, h3, h4, h5, h6')].filter((one) => one.matches('img, table') || wordsOf(one)).at(-1)
  for (let end = last(); end?.matches('h1, h2, h3, h4, h5, h6') && (end.textContent ?? '').trim().split(/\s+/).length <= 8; end = last()) end.remove()
  // What is left with nothing in it: a wrapper whose button or icon went.
  for (const one of [...clean.querySelectorAll('p, div, span, section, figure, picture, header, footer, aside, li, a')].reverse()) if (!wordsOf(one) && !one.querySelector('img, table, hr, pre')) one.remove()
  // Readability's own wrappers (a page div, the site's article) unwrapped, so the words sit straight in the reader's column.
  let inner = clean.body as unknown as Element
  while (inner.children.length === 1 && /^(div|article|section|main)$/i.test(inner.children[0].tagName) && [...inner.childNodes].every((node) => node.nodeType === 1 || !(node.textContent ?? '').trim())) inner = inner.children[0]
  return inner.innerHTML
}
