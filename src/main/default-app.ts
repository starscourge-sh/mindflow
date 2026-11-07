import { ipcMain } from 'electron'
import { execFile } from 'child_process'

/**
 * Haligtree as the Mac's app for Markdown files: what Finder opens a .md with on a double-click. Asked of
 * Launch Services through the Mac's own scripting (no helper of ours to ship), only when the person asks, from
 * Settings. Tests never change the Mac's real default: under HALIGTREE_QA_AWAY the asks are only counted.
 */
const TYPES = ['net.daringfireball.markdown']
const ME = 'com.starskourge.haligtree'
const asked: string[] = []
;(globalThis as { haligtreeDefaultAsks?: () => string[] }).haligtreeDefaultAsks = () => asked.slice()

const run = (script: string): Promise<string> =>
  new Promise((done) => execFile('osascript', ['-l', 'JavaScript', '-e', script], { timeout: 5000 }, (error, out) => done(error ? '' : String(out).trim())))

/** The bundle id of the app Markdown opens in now, '' when none or unknown. */
async function current(): Promise<string> {
  if (process.platform !== 'darwin') return ''
  if (process.env.HALIGTREE_QA_AWAY) return asked.includes('set') ? ME : 'com.example.other'
  return run(`ObjC.import('CoreServices'); var r = $.LSCopyDefaultRoleHandlerForContentType($('${TYPES[0]}'), 0xFFFFFFFF); r ? ObjC.castRefToObject(r).js : ''`)
}

export function registerDefaultApp(): void {
  ipcMain.handle('haligtree:markdown-default', async () => (await current()).toLowerCase() === ME)
  ipcMain.handle('haligtree:markdown-default:set', async () => {
    if (process.platform !== 'darwin') return false
    if (process.env.HALIGTREE_QA_AWAY) return void asked.push('set'), true
    for (const type of TYPES) await run(`ObjC.import('CoreServices'); $.LSSetDefaultRoleHandlerForContentType($('${type}'), 0xFFFFFFFF, $('${ME}'))`)
    return (await current()).toLowerCase() === ME
  })
}
