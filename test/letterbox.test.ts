// Run with: node --test test/letterbox.test.ts
// The pictures are made here, saved as real JPEGs by the Mac's own `sips` and
// read back, so the bands are tested with the noise compression leaves in them.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bandsOf } from '../src/main/letterbox.ts'

const sips = (() => {
  try {
    execFileSync('sips', ['--help'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()
const folder = mkdtempSync(join(tmpdir(), 'haligtree-letterbox-'))

/** A 24-bit BMP from a function of (x, y) to [r, g, b]. */
function bmp(width: number, height: number, colour: (x: number, y: number) => number[]): Buffer {
  const row = Math.ceil((width * 3) / 4) * 4
  const out = Buffer.alloc(54 + row * height)
  out.write('BM')
  out.writeUInt32LE(out.length, 2)
  out.writeUInt32LE(54, 10)
  out.writeUInt32LE(40, 14)
  out.writeInt32LE(width, 18)
  out.writeInt32LE(height, 22)
  out.writeUInt16LE(1, 26)
  out.writeUInt16LE(24, 28)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const [r, g, b] = colour(x, y).map((v) => Math.max(0, Math.min(255, Math.round(v))))
    out.set([b, g, r], 54 + (height - 1 - y) * row + x * 3)
  }
  return out
}

/** Through a JPEG and back: the pixels as RGBA, as the main process reads them. */
function throughJpeg(name: string, width: number, height: number, colour: (x: number, y: number) => number[]): Uint8Array {
  const from = join(folder, `${name}.bmp`)
  writeFileSync(from, bmp(width, height, colour))
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '70', from, '--out', join(folder, `${name}.jpg`)], { stdio: 'ignore' })
  execFileSync('sips', ['-s', 'format', 'bmp', join(folder, `${name}.jpg`), '--out', join(folder, `${name}-back.bmp`)], { stdio: 'ignore' })
  const back = readFileSync(join(folder, `${name}-back.bmp`))
  const start = back.readUInt32LE(10)
  const w = back.readInt32LE(18)
  const tall = back.readInt32LE(22)
  const h = Math.abs(tall)
  const bytes = back.readUInt16LE(28) / 8
  const row = Math.ceil((w * bytes) / 4) * 4
  assert.equal(w, width)
  const rgba = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const at = start + (tall > 0 ? h - 1 - y : y) * row + x * bytes
    rgba.set([back[at + 2], back[at + 1], back[at], 255], (y * w + x) * 4)
  }
  return rgba
}

// A 16:9 frame in a 4:3 thumbnail, as YouTube makes them: 45 black rows over and under 270.
test('a 4:3 thumbnail with a 16:9 picture in it gives its two bands', { skip: !sips && 'needs sips' }, () => {
  const rgba = throughJpeg('banded', 480, 360, (x, y) => (y < 45 || y >= 315 ? [2, 2, 2] : [40 + x / 3, 200 - y / 3, 120 + (x % 60)]))
  const bands = bandsOf(rgba, 480, 360)
  assert.ok(bands, 'found bands')
  assert.ok(Math.abs(bands.top - 0.125) < 0.01, `top ${bands.top}`)
  assert.ok(Math.abs(bands.bottom - 0.125) < 0.01, `bottom ${bands.bottom}`)
})

// A night street: black sky and black ground, symmetric, fading into the lit middle.
test('a dark photo with black sky and ground is never cropped', { skip: !sips && 'needs sips' }, () => {
  const rgba = throughJpeg('night', 480, 360, (x, y) => {
    const middle = 1 - Math.abs(y - 180) / 180
    const glow = Math.max(0, middle - 0.15) * 70
    const lamp = (x % 97 < 6 && Math.abs(y - 180) < 30) ? 180 : 0
    return [glow + lamp, glow * 0.8 + lamp, glow * 1.3 + lamp]
  })
  assert.equal(bandsOf(rgba, 480, 360), null)
})

test('a dark photo with only a black top is not banded', { skip: !sips && 'needs sips' }, () => {
  const rgba = throughJpeg('dusk', 480, 360, (x, y) => (y < 60 ? [3, 3, 3] : [30 + y / 4, 40, 60 + x / 10]))
  assert.equal(bandsOf(rgba, 480, 360), null)
})

/** A picture `width` by `height`, black rows over and under a plain lit middle. */
const plain = (width: number, height: number, top: number, bottom: number): Uint8Array => {
  const rgba = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const dark = y < top || y >= height - bottom
    rgba.set(dark ? [0, 0, 0, 255] : [200, 150, 90, 255], (y * width + x) * 4)
  }
  return rgba
}

test('bands too thin, too thick or uneven are left alone', () => {
  assert.ok(bandsOf(plain(100, 75, 9, 9), 100, 75))
  assert.equal(bandsOf(plain(100, 75, 2, 2), 100, 75), null)
  assert.equal(bandsOf(plain(100, 75, 15, 15), 100, 75), null)
  assert.equal(bandsOf(plain(100, 75, 9, 3), 100, 75), null)
})

// A film still in a 3:2 or 16:9 frame, or a square, black over and under: the bands are its own, kept.
test('a picture that is not 4:3 is never cropped, however clear its bands', () => {
  assert.equal(bandsOf(plain(120, 80, 10, 10), 120, 80), null)
  assert.equal(bandsOf(plain(160, 90, 11, 11), 160, 90), null)
  assert.equal(bandsOf(plain(100, 100, 12, 12), 100, 100), null)
})

test('the clear edges of a cut-out are not bands', () => {
  const rgba = new Uint8Array(100 * 75 * 4)
  for (let y = 0; y < 75; y++) for (let x = 0; x < 100; x++) rgba.set(y < 9 || y >= 66 ? [0, 0, 0, 0] : [200, 150, 90, 255], (y * 100 + x) * 4)
  assert.equal(bandsOf(rgba, 100, 75), null)
})
