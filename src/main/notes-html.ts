/**
 * A note from Apple Notes as Markdown. Notes hands each note over as a small
 * page of HTML: a line is a <div>, with headings, bold and italic, lists,
 * checklists, links, tables and pictures written inline as data. This reads
 * that much and nothing more, so the editor can take it the way it takes a
 * vault's notes. Written apart from Electron, so a test can load it alone.
 */

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
const decode = (text: string): string =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) =>
    name[0] === '#' ? String.fromCodePoint(name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1))) : (ENTITIES[name.toLowerCase()] ?? whole))

/** Every picture written into the note as data, once each, for storing before the words are read. */
export const dataPictures = (html: string): string[] =>
  [...new Set([...html.matchAll(/<img\b[^>]*?\ssrc\s*=\s*["'](data:image\/[^"']+)["']/gi)].map((match) => match[1]))]

const attr = (tag: string, name: string): string | null => new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(tag)?.slice(2).find((one) => one !== undefined) ?? null

type List = { ordered: boolean; check: boolean; n: number }

/**
 * The note's HTML as Markdown. `pictures` says where each data picture was
 * stored; one it does not know is counted in `missing` and left out. The first
 * line goes when it only says the note's name again, as it always does in Notes.
 */
export function notesMarkdown(html: string, title: string, pictures: Map<string, string> = new Map()): { markdown: string; missing: number } {
  const blocks: string[] = []
  let line = ''
  let prefix = ''
  // A list item's line joins the one before it with a single break; any other line stands apart.
  let tight = false
  const lists: List[] = []
  const links: (string | null)[] = []
  let missing = 0
  let row: string[] | null = null
  let table: string[][] | null = null
  let cell = ''
  // Bold, italic, strike and code still open: Apple Notes wraps them round
  // whole runs of lines, so each line closes them at its end and opens them
  // again at the next start, rather than leaving a lone "**" on a line.
  const open: string[] = []
  const flush = (): void => {
    const closing = [...open].reverse().join('')
    const words = tidyMarks(`${line.replace(/\s+$/, '')}${closing}`.replace(/[ \t]+/g, ' ')).trim()
    if (words || prefix) {
      const text = `${prefix}${words}`.trimEnd()
      if (text) {
        if (tight && blocks.length) blocks[blocks.length - 1] += `\n${text}`
        else blocks.push(text)
      }
    }
    line = open.join('')
    prefix = ''
    tight = false
  }
  const mark = (token: string, close: boolean): void => {
    if (close) {
      const at = open.lastIndexOf(token)
      if (at === -1) return
      open.splice(at, 1)
      // "**word **" is not bold: the mark goes before the spaces.
      if (row) cell = cell.replace(/(\s*)$/, `${token}$1`)
      else line = line.replace(/(\s*)$/, `${token}$1`)
    } else {
      open.push(token)
      add(token)
    }
  }
  const add = (text: string): void => {
    if (row) cell += text
    else line += text
  }
  for (const part of html.replace(/\r\n?/g, '\n').split(/(<[^>]+>)/)) {
    if (!part) continue
    if (part[0] !== '<') {
      const text = decode(part.replace(/\n/g, ' '))
      // "** word" is not bold either: spaces after an opening mark go before it.
      const target = row ? cell : line
      const opened = open.length ? open[open.length - 1] : ''
      if (opened && target.endsWith(opened) && /^\s/.test(text)) {
        const lead = /^\s+/.exec(text)![0]
        const moved = `${target.slice(0, -opened.length)}${lead}${opened}`
        if (row) cell = moved
        else line = moved
        add(text.slice(lead.length))
      } else add(text)
      continue
    }
    const close = part[1] === '/'
    const name = /^<\/?\s*([a-z0-9]+)/i.exec(part)?.[1]?.toLowerCase() ?? ''
    if (name === 'div' || name === 'p') {
      if (!lists.length && !row) flush()
    } else if (name === 'br') {
      if (row) cell += ' '
      else if (!lists.length) flush()
    } else if (/^h[1-6]$/.test(name)) {
      flush()
      if (!close) prefix = `${'#'.repeat(Number(name[1]))} `
    } else if (name === 'b' || name === 'strong') mark('**', close)
    else if (name === 'i' || name === 'em') mark('*', close)
    else if (name === 's' || name === 'strike' || name === 'del') mark('~~', close)
    else if (name === 'tt' || name === 'code') mark('`', close)
    else if (name === 'a') {
      if (close) {
        const href = links.pop()
        if (href) add(`](${href})`)
      } else {
        const href = attr(part, 'href')
        const ok = href && /^(https?:|mailto:|tel:)/i.test(href) ? href : null
        links.push(ok)
        if (ok) add('[')
      }
    } else if (name === 'ul' || name === 'ol') {
      flush()
      if (close) lists.pop()
      else lists.push({ ordered: name === 'ol', check: /checklist/i.test(attr(part, 'class') ?? ''), n: 0 })
    } else if (name === 'li') {
      flush()
      if (close) continue
      const list = lists[lists.length - 1] ?? { ordered: false, check: false, n: 0 }
      list.n += 1
      const cls = attr(part, 'class') ?? ''
      const check = list.check || /\b(un)?checked\b/i.test(cls) || /data-checked/i.test(part)
      const done = /\bchecked\b/i.test(cls.replace(/unchecked/gi, '')) || /data-checked\s*=\s*["']?(true|yes|1)/i.test(part)
      prefix = `${'  '.repeat(Math.max(0, lists.length - 1))}${list.ordered ? `${list.n}.` : '-'} ${check ? `[${done ? 'x' : ' '}] ` : ''}`
      tight = list.n > 1 || lists.length > 1
    } else if (name === 'input' && /checkbox/i.test(part)) {
      // A box drawn inside the item, its tick in the tag itself.
      if (/\schecked\b/i.test(part)) prefix = prefix.replace(/\[ \] $/, '[x] ')
      else if (!/\[[ x]\] $/.test(prefix)) prefix += '[ ] '
    } else if (name === 'img' && !close) {
      const src = attr(part, 'src') ?? ''
      const stored = pictures.get(src) ?? (/^https?:/i.test(src) ? src : null)
      if (stored) add(`![](${stored})`)
      else missing += 1
    } else if (name === 'table') {
      flush()
      if (close && table) {
        const width = Math.max(...table.map((one) => one.length))
        const lines = table.map((one) => `| ${[...one, ...Array(width - one.length).fill('')].join(' | ')} |`)
        lines.splice(1, 0, `| ${Array(width).fill('---').join(' | ')} |`)
        blocks.push(lines.join('\n'))
        table = null
      } else if (!close) table = []
    } else if (name === 'tr') {
      if (close && row && table) table.push(row)
      row = close ? null : []
    } else if (name === 'td' || name === 'th') {
      if (close && row) row.push(cell.replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim())
      cell = ''
    }
  }
  flush()
  // The name, said again as the first line, goes: the article is called it already.
  const plain = (text: string): string => text.replace(/^#+\s+/, '').replace(/[*_~`]/g, '').trim().toLowerCase()
  if (blocks.length && plain(blocks[0].split('\n')[0]) === title.trim().toLowerCase()) {
    const rest = blocks[0].split('\n').slice(1).join('\n')
    if (rest) blocks[0] = rest
    else blocks.shift()
  }
  return { markdown: blocks.join('\n\n').trim(), missing }
}

/** Marks around nothing ("****", "~~~~", "** **") are left from empty runs: gone. */
function tidyMarks(text: string): string {
  let was = ''
  while (was !== text) {
    was = text
    text = text.replace(/(\*\*|~~|`)(\s*)\1/g, '$2').replace(/(^|[^*])\*(\s+)\*(?!\*)/g, '$1$2')
  }
  return text
}
