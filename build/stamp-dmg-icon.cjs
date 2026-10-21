// After the build: each .dmg gets Haligtree's icon in Finder, as the app has.
// electron-builder's dmg.icon is the icon of the disk once opened; the file
// itself would otherwise show the plain disk-image icon. macOS keeps a file's
// own icon beside it, so it holds on this Mac and in a copy made by Finder,
// though a download from the web shows the plain one again.
const { execFileSync } = require('child_process')
const path = require('path')

exports.default = async function stamp({ artifactPaths }) {
  if (process.platform !== 'darwin') return []
  const icon = path.join(__dirname, 'icon.icns')
  for (const file of artifactPaths.filter((one) => one.endsWith('.dmg'))) {
    const script = `ObjC.import('AppKit'); $.NSWorkspace.sharedWorkspace.setIconForFileOptions($.NSImage.alloc.initWithContentsOfFile(${JSON.stringify(icon)}), ${JSON.stringify(file)}, 0)`
    const ok = execFileSync('osascript', ['-l', 'JavaScript', '-e', script]).toString().trim()
    console.log(`  • Haligtree's icon on ${path.basename(file)}: ${ok === 'true' ? 'set' : 'not set'}`)
  }
  return []
}
