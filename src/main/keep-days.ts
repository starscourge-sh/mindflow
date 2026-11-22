import { readdir, rm } from 'fs/promises'
import { join } from 'path'

/** How many daily copies of each book are kept: the newest five days (22 Nov 2026; was 30). */
export const KEEP_DAYS = 5

/** A book's daily copies past the newest KEEP_DAYS removed, oldest first. One-off copies (haligtree-before-folders-…) are left alone. */
export async function keepNewest(dir: string): Promise<void> {
  const copies = (await readdir(dir).catch(() => [] as string[])).filter((name) => /^haligtree-\d{4}-\d{2}-\d{2}\.db$/.test(name))
  for (const name of copies.sort().slice(0, -KEEP_DAYS)) await rm(join(dir, name), { force: true })
}
