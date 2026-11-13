import { copyFile, readdir, rename } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'

/**
 * The files in `from` not yet in `to`, each copied beside its place and renamed in (a copy cut short, Haligtree quit
 * mid-way, would otherwise count as copied and never be copied again). A file still being written (`name.<id>.tmp`,
 * renamed in when whole) is not one yet: its whole self is copied under its own name, this run or the next. Copying
 * it, a backup failed whenever it was renamed mid-copy, and every file after it in the list went uncopied (the user's
 * dev log, 13 Nov: "Backup failed: Error: ENOENT … .tmp"). One gone since the list was read is skipped, never the
 * whole run failed for it. `names`: the list to go through (read from `from` when not given).
 */
export async function copyNew(from: string, to: string, have: Set<string>, names?: string[]): Promise<void> {
  for (const name of names ?? (existsSync(from) ? await readdir(from) : [])) {
    if (/\.(tmp|part)$/.test(name) || have.has(name)) continue
    await copyFile(join(from, name), join(to, `${name}.part`)).then(() => rename(join(to, `${name}.part`), join(to, name)), (error: NodeJS.ErrnoException) => {
      if (error?.code === 'ENOENT' && !existsSync(join(from, name))) return
      throw error
    })
  }
}
