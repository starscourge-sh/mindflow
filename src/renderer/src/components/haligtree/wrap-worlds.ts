/**
 * The two looks a wrap can take ("worlds"), their palettes, and the lines
 * each open picks from: Files (paper and ink, op-art framing your own
 * pictures) and Night (a slow silk of light). Every colour a wrap card
 * paints with lives here, so no component carries a colour of its own.
 * Sticker and Kinetic were cut (18 Nov): their sunbursts, tiled words and
 * echoed numbers said nothing about the month and covered its words.
 */

export const WORLDS = ['files', 'night'] as const
export type World = (typeof WORLDS)[number]
export const WORLD_NAMES: Record<World, string> = { files: 'Files', night: 'Night' }

/** `bg` the card, `ink` its words, `accent` the one loud colour, `alt` a second, `soft` a quiet third. */
export type Palette = { bg: string; ink: string; accent: string; alt: string; soft: string; glow: [string, string] }

export const PALETTES: Record<World, Palette[]> = {
  // Files: scrapbook paper and stamp ink (cream, sepia, date-stamp red, oak),
  // not purple-on-white dashboard chrome.
  files: [
    { bg: '#f1efe9', ink: '#1d1d1b', accent: '#8f5c0c', alt: '#1d1d1b', soft: '#dcd8cf', glow: ['#c4a35a', '#8f5c0c'] },
    { bg: '#232321', ink: '#f1efe9', accent: '#e0c27a', alt: '#f1efe9', soft: '#3a3a37', glow: ['#e0c27a', '#8f5c0c'] },
    { bg: '#f1efe9', ink: '#1d1d1b', accent: '#a33c28', alt: '#1d1d1b', soft: '#dcd8cf', glow: ['#c45a3c', '#e0c27a'] },
    { bg: '#232321', ink: '#f1efe9', accent: '#d4a574', alt: '#f1efe9', soft: '#3a3a37', glow: ['#d4a574', '#a33c28'] }
  ],
  night: [
    { bg: '#07060c', ink: '#f3eefe', accent: '#e0c27a', alt: '#c4a35a', soft: '#2a2440', glow: ['#e0c27a', '#8f5c0c'] },
    { bg: '#050a08', ink: '#ecfff6', accent: '#55f0b0', alt: '#ffd36b', soft: '#16302a', glow: ['#16c47f', '#ffd36b'] },
    { bg: '#0b0508', ink: '#fff0f4', accent: '#c45a3c', alt: '#e0c27a', soft: '#3a1626', glow: ['#c45a3c', '#e0c27a'] }
  ]
}

/** The dimmed window behind the card, its shadow and vignette, and the folder's papers: the same in every world. */
export const STAGE = { dim: 'rgba(0, 0, 0, 0.72)', shadow: '0 40px 120px -20px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.06)', paper: '#fbfaf6', paperInk: '#1d1d1b', vignette: 'radial-gradient(ellipse at center, transparent 45%, rgba(0, 0, 0, 0.65) 100%)' }

/**
 * How far the light behind and inside the card turns round the colour wheel on each card (radians, Silk's `hue`): never the same two in
 * a row, and never far from the look's own colours, so lime leans yellow, then teal, then back.
 */
export const HUES = [0, 0.55, -0.45, 0.9, -0.2, 0.35, -0.7, 0.15, 0.7, -0.35, 0.45, -0.6]

/** A small seeded random, so one seed always tells the same story. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export const pick = <T,>(rand: () => number, list: readonly T[]): T => list[Math.floor(rand() * list.length) % list.length]

const KEY = 'haligtree.wrapSeed'
/** A seed for this open, never the last one's, so the next open differs. */
export function nextSeed(): number {
  const last = Number(localStorage.getItem(KEY) || 0)
  let seed = Math.floor(Math.random() * 2 ** 31)
  if (seed === last) seed = (seed + 7919) % 2 ** 31
  localStorage.setItem(KEY, String(seed))
  return seed
}

/** First lines, in Haligtree's own voice; `{name}` is the month or week. Scrapbook, not a scorecard. */
export const INTROS = [
  'You kept a book all {name}. Here is what it held.',
  '{name}, pages from your own hand.',
  'Before {name} goes on the shelf, a look back.',
  'Quotes, gems, reading: what {name} left in the book.',
  'A few cards on {name}. Nothing to grade.'
]
export const OUTROS = [
  'That was {name}. Nothing here is a score.',
  'That was {name}, as you wrote it.',
  'On to the next page. {name} is kept.',
  'Thank you for writing it down.',
  'Same time next {period}? Your book will be here.'
]
export const FOLDER_LINES = ['We pulled some pages, just in case.', 'A few lines you might want again.', 'From the drawer this {period}.']
