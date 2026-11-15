/**
 * The four looks a wrap can take ("worlds"), their palettes, and the lines
 * each open picks from. Every colour a wrap card paints with lives here, so
 * no component carries a colour of its own.
 */

export const WORLDS = ['files', 'sticker', 'kinetic', 'night'] as const
export type World = (typeof WORLDS)[number]
export const WORLD_NAMES: Record<World, string> = { files: 'Files', sticker: 'Sticker', kinetic: 'Kinetic', night: 'Night' }

/** `bg` the card, `ink` its words, `accent` the one loud colour, `alt` a second, `soft` a quiet third. */
export type Palette = { bg: string; ink: string; accent: string; alt: string; soft: string; glow: [string, string] }

export const PALETTES: Record<World, Palette[]> = {
  files: [
    { bg: '#f1efe9', ink: '#1d1d1b', accent: '#8b7cf6', alt: '#1d1d1b', soft: '#dcd8cf', glow: ['#8b7cf6', '#f1efe9'] },
    { bg: '#232321', ink: '#f1efe9', accent: '#c6f24e', alt: '#f1efe9', soft: '#3a3a37', glow: ['#c6f24e', '#6f6f6a'] },
    { bg: '#f1efe9', ink: '#1d1d1b', accent: '#ff5a3c', alt: '#1d1d1b', soft: '#dcd8cf', glow: ['#ff5a3c', '#f6c945'] },
    { bg: '#232321', ink: '#f1efe9', accent: '#e8c547', alt: '#f1efe9', soft: '#3a3a37', glow: ['#e8c547', '#8b7cf6'] }
  ],
  sticker: [
    { bg: '#5b2bd6', ink: '#fff7d6', accent: '#f9e14b', alt: '#3ce07a', soft: '#ff7ac3', glow: ['#5b2bd6', '#f9e14b'] },
    { bg: '#1f8a4c', ink: '#fff7d6', accent: '#ffb3e6', alt: '#f9e14b', soft: '#5b2bd6', glow: ['#3ce07a', '#ffb3e6'] },
    { bg: '#ff5d2a', ink: '#1a0f3d', accent: '#fff07a', alt: '#5b2bd6', soft: '#ffd0b8', glow: ['#ff5d2a', '#5b2bd6'] }
  ],
  kinetic: [
    { bg: '#ff3b1f', ink: '#111111', accent: '#f4f1e8', alt: '#2246ff', soft: '#ffb199', glow: ['#ff3b1f', '#2246ff'] },
    { bg: '#2246ff', ink: '#f4f1e8', accent: '#d8ff3c', alt: '#111111', soft: '#7d93ff', glow: ['#2246ff', '#d8ff3c'] },
    { bg: '#111111', ink: '#f4f1e8', accent: '#ff3b1f', alt: '#d8ff3c', soft: '#444444', glow: ['#ff3b1f', '#111111'] }
  ],
  night: [
    { bg: '#07060c', ink: '#f3eefe', accent: '#b48cff', alt: '#4fd6ff', soft: '#2a2440', glow: ['#6d3cff', '#1fb6ff'] },
    { bg: '#050a08', ink: '#ecfff6', accent: '#55f0b0', alt: '#ffd36b', soft: '#16302a', glow: ['#16c47f', '#ffd36b'] },
    { bg: '#0b0508', ink: '#fff0f4', accent: '#ff6b9a', alt: '#ffb86b', soft: '#3a1626', glow: ['#ff3d7f', '#7a3cff'] }
  ]
}

/** The dimmed window behind the card, and the grain and shadow every world shares. */
export const STAGE = { dim: 'rgba(0, 0, 0, 0.72)', shadow: '0 40px 120px -20px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.06)', paper: '#fbfaf6', paperInk: '#1d1d1b', vignette: 'radial-gradient(ellipse at center, transparent 45%, rgba(0, 0, 0, 0.65) 100%)' }

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

/** First lines, in Haligtree's own voice; `{name}` is the month or week. */
export const INTROS = [
  'You kept a book all {name}. Here is what it held.',
  '{name}, in your own notes.',
  'Before {name} goes on the shelf, a look back.',
  'You caught things all {name}. We counted, gently.',
  'A few cards on {name}. Nothing to grade.'
]
export const OUTROS = [
  'That was {name}. Nothing here is a score.',
  'That was {name}, as you wrote it.',
  'On to the next page. {name} is kept.',
  'Thank you for writing it down.',
  'Same time next month? Your book will be here.'
]
export const FOLDER_LINES = ['We pulled some of your notes, just in case.', 'A few you might want again.', 'From the drawer this month.']
