import { call } from './haligtree'

/**
 * A Feed post as a picture: a clean card in the app's own type and the
 * current theme's colours, drawn at twice its size. Its face, account and
 * date; its words, or its quote in a card; its picture; and a small
 * "Haligtree" at the foot. Read off the post as drawn on screen, so it always
 * looks like the post you chose.
 */
export type CardPost = { account: string; said: string; title: string; text: string; quote: boolean; who: string | null; picture?: string }

const WIDTH = 600
const PAD = 32
const SCALE = 2

/** A colour as the page works it out, from any CSS value (a var, a color-mix). */
function colour(value: string, inside: Element = document.body): string {
  const probe = document.createElement('span')
  probe.style.color = value
  inside.appendChild(probe)
  const said = getComputedStyle(probe).color
  probe.remove()
  return said
}

const load = (src: string): Promise<HTMLImageElement | null> =>
  new Promise((done) => {
    const image = new Image()
    image.onload = () => done(image)
    image.onerror = () => done(null)
    image.src = src
  })

/** A picture of the app's own, as a data address, so the canvas can still be read. */
async function picture(src: string | undefined): Promise<HTMLImageElement | null> {
  if (!src) return null
  const data = src.startsWith('data:') ? src : await call<string | null>('feed:picture', src).catch(() => null)
  return data ? load(data) : null
}

/** Words in lines no wider than `width`, at most `most` of them, the last ending "…" when cut. */
function lines(ctx: CanvasRenderingContext2D, words: string, width: number, most: number): string[] {
  const out: string[] = []
  for (const para of words.split('\n')) {
    let line = ''
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word
      if (ctx.measureText(next).width <= width || !line) line = next
      else (out.push(line), (line = word))
    }
    out.push(line)
  }
  while (out.length && !out[out.length - 1].trim()) out.pop()
  if (out.length <= most) return out
  const kept = out.slice(0, most)
  let last = kept[most - 1]
  while (last && ctx.measureText(`${last}…`).width > width) last = last.replace(/\s*\S+$/, '')
  kept[most - 1] = `${last}…`
  return kept
}

/** The card, as a PNG data address. `post` is the post's own element on screen, for its face and type. */
export async function drawCard(card: CardPost, element: HTMLElement | null): Promise<string> {
  const root = document.documentElement
  const sans = getComputedStyle(document.body).fontFamily
  const serif = (element?.querySelector('blockquote') && getComputedStyle(element.querySelector('blockquote')!).fontFamily) || 'ui-serif, Georgia, serif'
  const bg = colour('var(--background)', root)
  const fg = colour('var(--foreground)', root)
  const muted = colour('var(--muted-foreground)', root)
  const line = colour('var(--border)', root)
  const tint = colour('color-mix(in oklab, var(--accent) 35%, var(--background))', root)
  const face = element?.querySelector<HTMLElement>('.mf-avatar')
  const stops = face ? [...face.querySelectorAll('stop')].map((stop) => getComputedStyle(stop).stopColor) : []
  const shape = face?.querySelector('path')?.getAttribute('d') ?? null
  const facePicture = face?.querySelector('img')?.src
  const initials = face?.querySelector('span')?.textContent ?? card.account.slice(0, 1)
  const [image, avatar] = await Promise.all([picture(card.picture), picture(facePicture)])

  // Laid out once to measure, then drawn on a canvas of exactly that height.
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  const inner = WIDTH - PAD * 2
  const text = 56
  const body: { font: string; color: string; lines: string[]; lead: number }[] = []
  if (card.quote) {
    ctx.font = `19px ${serif}`
    body.push({ font: `19px ${serif}`, color: fg, lines: lines(ctx, card.text || card.title, inner - 40, 14), lead: 30 })
  } else {
    ctx.font = `600 18px ${sans}`
    body.push({ font: `600 18px ${sans}`, color: fg, lines: lines(ctx, card.title, inner, 3), lead: 26 })
    if (card.text) {
      ctx.font = `16px ${sans}`
      body.push({ font: `16px ${sans}`, color: fg, lines: lines(ctx, card.text, inner, 12), lead: 25 })
    }
  }
  const words = body.reduce((sum, one) => sum + one.lines.length * one.lead, 0) + (body.length - 1) * 8
  const quoteBox = card.quote ? words + 36 + (card.who ? 28 : 0) : words
  const pictureHeight = image ? Math.min(420, (inner / image.width) * image.height) : 0
  const height = PAD + 44 + 20 + quoteBox + (image ? 16 + pictureHeight : 0) + 28 + 1 + 20 + 16 + PAD
  canvas.width = WIDTH * SCALE
  canvas.height = Math.ceil(height) * SCALE
  ctx.scale(SCALE, SCALE)
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, WIDTH, height)
  ctx.textBaseline = 'alphabetic'

  // The face: the picture you gave them, or their shape with their initials.
  const at = { x: PAD, y: PAD }
  if (avatar) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(at.x + 22, at.y + 22, 22, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(avatar, at.x, at.y, 44, 44)
    ctx.restore()
  } else {
    ctx.save()
    ctx.translate(at.x, at.y)
    ctx.scale(44 / 200, 44 / 200)
    const fill = ctx.createLinearGradient(0, 0, 200, 200)
    fill.addColorStop(0, stops[0] || tint)
    fill.addColorStop(1, stops[1] || stops[0] || tint)
    ctx.fillStyle = fill
    if (shape) ctx.fill(new Path2D(shape))
    else (ctx.beginPath(), ctx.arc(100, 100, 100, 0, Math.PI * 2), ctx.fill())
    ctx.restore()
    ctx.fillStyle = fg
    ctx.font = `600 15px ${sans}`
    ctx.textAlign = 'center'
    ctx.fillText(initials, at.x + 22, at.y + 27.5)
    ctx.textAlign = 'left'
  }
  ctx.fillStyle = fg
  ctx.font = `600 16px ${sans}`
  ctx.fillText(card.account, at.x + text, at.y + 19)
  ctx.fillStyle = muted
  ctx.font = `14px ${sans}`
  ctx.fillText(card.said, at.x + text, at.y + 39)

  let y = PAD + 44 + 20
  if (card.quote) {
    ctx.fillStyle = tint
    ctx.strokeStyle = line
    ctx.beginPath()
    ctx.roundRect(PAD, y, inner, quoteBox, 12)
    ctx.fill()
    ctx.stroke()
    y += 18
  }
  for (const part of body) {
    ctx.font = part.font
    ctx.fillStyle = part.color
    for (const said of part.lines) {
      ctx.fillText(said, PAD + (card.quote ? 20 : 0), y + part.lead - 7)
      y += part.lead
    }
    y += 8
  }
  y -= 8
  if (card.quote && card.who) {
    ctx.font = `500 14px ${sans}`
    ctx.fillStyle = muted
    ctx.fillText(card.who, PAD + 20, y + 22)
    y += 28
  }
  if (card.quote) y += 18
  if (image) {
    y += 16
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(PAD, y, inner, pictureHeight, 14)
    ctx.clip()
    ctx.fillStyle = tint
    ctx.fillRect(PAD, y, inner, pictureHeight)
    const width = Math.min(inner, (pictureHeight / image.height) * image.width)
    ctx.drawImage(image, PAD + (inner - width) / 2, y, width, pictureHeight)
    ctx.restore()
    y += pictureHeight
  }
  // The foot: a hairline, and the app's name, small.
  y += 28
  ctx.fillStyle = line
  ctx.fillRect(PAD, y, inner, 1)
  y += 20 + 13
  ctx.fillStyle = muted
  ctx.font = `600 13px ${sans}`
  ctx.fillText('Haligtree', PAD, y)
  return canvas.toDataURL('image/png')
}

/** The words for X: a quote with its author, cut at a word to fit 280 with "…". */
export function xText(card: CardPost): string {
  const said = card.quote ? `“${(card.text || card.title).trim()}”${card.who ? ` ${card.who}` : ''}` : [card.title, card.text].filter(Boolean).join('\n\n').trim()
  if ([...said].length <= 280) return said
  if (card.quote && card.who) {
    const tail = `…” ${card.who}`
    let head = `“${(card.text || card.title).trim()}`
    while ([...head].length + [...tail].length > 280) head = head.replace(/\s*\S+$/, '')
    return head + tail
  }
  let cut = said.slice(0, 279)
  cut = cut.replace(/\s*\S*$/, '')
  return `${cut}…`
}
