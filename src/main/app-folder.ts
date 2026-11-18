import { app, shell } from 'electron'
import { realpathSync } from 'fs'
import { isAbsolute, join, relative } from 'path'
import { realRoot } from './sandbox'

/**
 * Haligtree's own folder is never opened or shown in Finder: a person who
 * moves, renames or edits a file in there by hand can break the book. Every
 * reveal and every open of a path goes through here, and one inside the
 * app's folder (the data folder, every book, the sandbox, the folder an
 * older build used) is refused with the reason. Stored files reach other
 * apps only as copies placed outside it (index.ts, `copyOut`).
 */

/** Every name the app's folder had before: an older build's is kept as a backup and is just as much the app's. */
const OLD_NAMES = ['mindflow', 'vigil']

const real = (path: string): string => {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

/** Whether `path` is the app's own folder or anything inside it. On a Mac the disk ignores case, so the test does too. */
export function insideAppFolder(path: string): boolean {
  const roots = [realRoot(), app.getPath('userData'), ...OLD_NAMES.map((name) => join(app.getPath('appData'), name))]
  const fold = (one: string): string => (process.platform === 'darwin' ? real(one).toLowerCase() : real(one))
  const at = fold(path)
  return roots.some((root) => {
    const rel = relative(fold(root), at)
    return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
  })
}

export const REFUSED = "Haligtree's own folder is never opened outside the app"

/** A folder or file of the person's own opened in Finder or its app: '' when it opened, otherwise why not. */
export async function openOutside(path: string): Promise<string> {
  return insideAppFolder(path) ? REFUSED : shell.openPath(path)
}

/** A file of the person's own picked out in a Finder window: '' when shown, otherwise why not. */
export function showOutside(path: string): string {
  if (insideAppFolder(path)) return REFUSED
  shell.showItemInFolder(path)
  return ''
}
