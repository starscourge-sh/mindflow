import { execFile } from 'child_process'
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

/** Picture kinds a page cannot show, and what the Mac turns each into as it is stored: photos to JPEG, the rest to PNG. */
export const MAC_CONVERTS: Record<string, 'jpeg' | 'png'> = { 'image/heic': 'jpeg', 'image/heif': 'jpeg', 'image/heic-sequence': 'jpeg', 'image/heif-sequence': 'jpeg', 'image/tiff': 'png', 'image/x-tiff': 'png' }
/** The Mac's own picture tool (sips, in every macOS) turning these bytes into a JPEG or PNG, in a folder made and removed for it. */
export async function convertOnMac(bytes: Uint8Array, into: 'jpeg' | 'png'): Promise<Uint8Array> {
  const dir = await mkdtemp(join(tmpdir(), 'haligtree-convert-'))
  try {
    const from = join(dir, 'in')
    const to = join(dir, `out.${into === 'jpeg' ? 'jpg' : 'png'}`)
    await writeFile(from, bytes)
    await new Promise<void>((done, fail) => execFile('/usr/bin/sips', ['-s', 'format', into, from, '--out', to], { timeout: 20_000 }, (error) => (error ? fail(error) : done())))
    return new Uint8Array(await readFile(to))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
