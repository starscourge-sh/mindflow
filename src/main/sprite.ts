import { nativeImage } from 'electron'
import { open, readFile } from 'fs/promises'
import { extname } from 'path'

/**
 * Whether a picture is a sprite: a figure on a see-through background, so a
 * celebration can let it walk on by itself instead of cropping it into a
 * card. The file's header says whether it can be see-through at all; one that
 * can is then checked at its corners, since a screenshot or a meme GIF often
 * says it has alpha and uses none.
 */

/** A PNG's header: an alpha channel, or a see-through colour named before the picture data. */
function pngCan(bytes: Buffer): boolean {
  if (bytes.length < 33 || bytes.readUInt32BE(0) !== 0x89504e47) return false
  // Colour types 4 and 6 carry alpha with every pixel.
  if (bytes[25] === 4 || bytes[25] === 6) return true
  for (let at = 8; at + 8 <= bytes.length;) {
    const type = bytes.toString('latin1', at + 4, at + 8)
    if (type === 'tRNS') return true
    if (type === 'IDAT' || type === 'IEND') return false
    at += 12 + bytes.readUInt32BE(at)
  }
  return false
}

/** A PNG with a see-through corner, read by the system's own decoder. */
function pngCorner(path: string): boolean {
  const image = nativeImage.createFromPath(path)
  if (image.isEmpty()) return false
  const { width, height } = image.getSize()
  const pixels = image.toBitmap()
  const alpha = (x: number, y: number): number => pixels[(y * width + x) * 4 + 3]
  return [alpha(0, 0), alpha(width - 1, 0), alpha(0, height - 1), alpha(width - 1, height - 1)].some((a) => a < 250)
}

/**
 * A GIF whose first frame leaves a corner see-through: the frame does not
 * reach it, or the pixel there is the see-through colour. The frame is
 * unpacked (it is LZW, as every GIF is) only when that is the way to know.
 */
function gifCorner(bytes: Buffer): boolean {
  if (bytes.length < 13 || bytes.toString('latin1', 0, 3) !== 'GIF') return false
  const canvasW = bytes.readUInt16LE(6)
  const canvasH = bytes.readUInt16LE(8)
  const flags = bytes[10]
  let at = 13 + (flags & 0x80 ? 3 * 2 ** ((flags & 7) + 1) : 0)
  let clear: number | null = null
  // Up to the first frame, noting the see-through colour if one comes before it.
  while (at < bytes.length && bytes[at] === 0x21) {
    if (bytes[at + 1] === 0xf9 && bytes[at + 3] & 1) clear = bytes[at + 6]
    at += 2
    while (at < bytes.length && bytes[at]) at += bytes[at] + 1
    at++
  }
  if (bytes[at] !== 0x2c || at + 10 > bytes.length) return false
  const left = bytes.readUInt16LE(at + 1)
  const top = bytes.readUInt16LE(at + 3)
  const w = bytes.readUInt16LE(at + 5)
  const h = bytes.readUInt16LE(at + 7)
  const frame = bytes[at + 9]
  // A corner the first frame does not cover shows as nothing at all.
  if (left > 0 || top > 0 || left + w < canvasW || top + h < canvasH) return true
  if (clear === null || !w || !h) return false
  at += 10 + (frame & 0x80 ? 3 * 2 ** ((frame & 7) + 1) : 0)
  // The frame's data, joined from its sub-blocks.
  const min = bytes[at++]
  if (min < 2 || min > 11) return false
  const parts: Buffer[] = []
  while (at < bytes.length && bytes[at]) {
    parts.push(bytes.subarray(at + 1, at + 1 + bytes[at]))
    at += bytes[at] + 1
  }
  const pixels = lzw(Buffer.concat(parts), min, w * h)
  // An interlaced frame comes in four passes; the last row arrives in one of them.
  const rows = frame & 0x40 ? [[0, 8], [4, 8], [2, 4], [1, 2]].flatMap(([from, step]) => Array.from({ length: Math.ceil(Math.max(0, h - from) / step) }, (_, i) => from + i * step)) : null
  const lastRow = rows ? rows.indexOf(h - 1) : h - 1
  return [pixels[0], pixels[w - 1], pixels[lastRow * w], pixels[lastRow * w + w - 1]].some((index) => index === clear)
}

/** A GIF frame's colour numbers, unpacked from its LZW codes. */
function lzw(data: Buffer, min: number, total: number): Uint8Array {
  const out = new Uint8Array(total)
  const prefix = new Uint16Array(4096)
  const suffix = new Uint8Array(4096)
  const first = new Uint8Array(4096)
  const length = new Uint16Array(4096)
  const reset = 1 << min
  const end = reset + 1
  for (let code = 0; code < reset; code++) {
    suffix[code] = first[code] = code
    length[code] = 1
  }
  let size = min + 1
  let next = end + 1
  let prev = -1
  let n = 0
  let bits = 0
  let held = 0
  let at = 0
  const write = (code: number): void => {
    const len = length[code]
    let c = code
    for (let i = len - 1; i >= 0; i--) {
      if (n + i < total) out[n + i] = suffix[c]
      c = prefix[c]
    }
    n += len
  }
  while (n < total) {
    while (bits < size && at < data.length) {
      held |= data[at++] << bits
      bits += 8
    }
    if (bits < size) break
    const code = held & ((1 << size) - 1)
    held >>>= size
    bits -= size
    if (code === reset) {
      size = min + 1
      next = end + 1
      prev = -1
      continue
    }
    if (code === end) break
    if (prev === -1) {
      if (code >= reset) break
      write(code)
      prev = code
      continue
    }
    if (code > next) break
    // The one code not yet in the table is the last string and its own first colour.
    const known = code < next
    if (known) write(code)
    else {
      write(prev)
      if (n < total) out[n] = first[prev]
      n++
    }
    if (next < 4096) {
      prefix[next] = prev
      suffix[next] = first[known ? code : prev]
      first[next] = first[prev]
      length[next] = length[prev] + 1
      next++
      if (next === 1 << size && size < 12) size++
    }
    prev = code
  }
  return out
}

/** A WebP that says it uses alpha: lossless with alpha in use, or extended with the alpha flag. */
function webpCan(bytes: Buffer): boolean {
  if (bytes.length < 30 || bytes.toString('latin1', 0, 4) !== 'RIFF' || bytes.toString('latin1', 8, 12) !== 'WEBP') return false
  const chunk = bytes.toString('latin1', 12, 16)
  if (chunk === 'VP8X') return (bytes[20] & 0x10) !== 0
  if (chunk === 'VP8L') return ((bytes.readUInt32LE(21) >>> 28) & 1) === 1
  return false
}

/** Whether these bytes of a file of this kind are a sprite. */
function spriteBytes(ext: string, bytes: Buffer): boolean {
  if (ext === '.svg') return true
  if (ext === '.gif') return gifCorner(bytes)
  // A WebP's alpha is taken at its word: few say so without using it.
  if (ext === '.webp') return webpCan(bytes)
  return false
}

/** Whether a picture on disk is a sprite. One that cannot be read is not. */
export async function isSprite(path: string): Promise<boolean> {
  const ext = extname(path).toLowerCase()
  if (ext === '.svg') return true
  if (!['.png', '.gif', '.webp'].includes(ext)) return false
  try {
    // A PNG's header is all that is read before it is opened to look at its corners.
    if (ext === '.png') return pngCan(await head(path)) && pngCorner(path)
    return spriteBytes(ext, await readFile(path))
  } catch {
    return false
  }
}

/** The first 64 KB of a file: enough to reach a PNG's picture data. */
async function head(path: string): Promise<Buffer> {
  const file = await open(path, 'r')
  try {
    const bytes = Buffer.alloc(64 * 1024)
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0)
    return bytes.subarray(0, bytesRead)
  } finally {
    await file.close()
  }
}
