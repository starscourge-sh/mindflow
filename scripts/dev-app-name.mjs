// In development the Mac names the app after the Electron binary's bundle
// ("Electron" in bold in the menu bar), which app.setName cannot change. This
// renames that bundle Haligtree after every install; reinstalling Electron
// undoes it. The built app is named by electron-builder.yml's productName.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const plist = join(import.meta.dirname, '..', 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'Info.plist')
if (process.platform === 'darwin' && existsSync(plist)) {
  for (const key of ['CFBundleName', 'CFBundleDisplayName']) execFileSync('plutil', ['-replace', key, '-string', 'Haligtree', plist])
}
