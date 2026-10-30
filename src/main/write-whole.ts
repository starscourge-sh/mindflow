import { renameSync, writeFileSync } from 'fs'
import { rename, writeFile } from 'fs/promises'

let count = 0
const partOf = (file: string): string => `${file}.${process.pid}-${++count}.part`

/**
 * A small state file written whole under another name, then named: the app
 * killed mid-write (a hard quit, a crash, the power) leaves the last whole
 * file, never half of a new one that would read as nothing at the next start.
 */
export async function writeWhole(file: string, text: string): Promise<void> {
  const part = partOf(file)
  await writeFile(part, text)
  await rename(part, file)
}

/** The same, at once, for the moments that cannot wait (on the way out). */
export function writeWholeSync(file: string, text: string): void {
  const part = partOf(file)
  writeFileSync(part, text)
  renameSync(part, file)
}
