import { app, shell, BrowserWindow, clipboard, ClipboardItem, dialog, ipcMain, net, protocol } from 'electron'
/*
 * app - Control your application's event lifecycle.
 *     - app.on('window-all-closed', () => { app.quit() })
 *     - emits events like:
 *        - 'window-all-closed': Emitted when all windows have been closed.
 *        - 'did-become-active': Emitted when all windows have been closed.
 *        - Emitted when the application becomes active. This differs from the activate event in that did-become-active is emitted every time the app becomes active, not only when Dock icon is clicked or application is re-launched. It is also emitted when a user switches to the app via the macOS App Switcher.
 *
 * BrowserWindow: Create and control browser windows.
 *        - const { BrowserWindow } = require('electron')
 *        -   const win = new BrowserWindow({ width: 800, height: 600 })
 *        - Load a remote URL
 *        -   win.loadURL('https://github.com')
 *        - Or load a local HTML file
 *        -   win.loadFile('index.html')
 *
 * shell - The shell module provides functions related to desktop integration.
 *       - An example of opening a URL in the user's default browser:
 *       - shell.showItemInFolder(fullPath): Show the given file in a file manager. If possible, select the file.
 *       - shell.openPath(path): Open the given file in the desktop's default manner.
 *       - shell.trashItem(path): This moves a path to the OS-specific trash location (Trash on macOS, Recycle Bin on Windows, and a desktop-environment-specific location on Linux).
 *
 * net - Issue HTTP/HTTPS requests using Chromium's native networking library
 *     - The net module is a client-side API for issuing HTTP(S) requests.
 *     - It is similar to the HTTP and HTTPS modules of Node.js but uses Chromium's native networking library instead of the Node.js implementation, offering better support for web proxies.
 *     - It also supports checking network status.
*/

import { createHash, randomUUID } from 'crypto'
import { copyFile, mkdir, readFile, rename, writeFile } from 'fs/promises'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerNotes } from './notes'


/* The standard electron app file structure:
 * One folder, named after your app
 `app.getPath('userData')` - That is the only place you write. It resolves per machine:
        macos - `~/Library/Application Support/mindflow`
        linux - `~/.config/mindflow`
        windows - `%APPDATA%\mindflow`
 `userData` is a label you ask for, not a folder name. The name on disk is your app's name from `package.json`.
 You share it with Chromium
 Chromium writes a bunch of its own housekeeping items/files into that same folder:
        `Cache`, `Cookies`, `Preferences`, `Local State`, `Local Storage`, `Session Storage`, `GPUCache`, `blob_storage` and friends. Your files sit beside them. There is no way around that, because there is one folder.

 rule of thumb:
 - One clearly-named entry per kind of thing.
 - Note: Renaming after you ship strands data.
```
 mindflow/
 ├── assets/          ← one entry, holds hundreds of images, audios etc
 ├── {any other custom folder e.g notes/, tasks/ }/           ← one entry, holds every note
 ├── app.db           ← one file, obviously yours
 └── Cache/  Cookies  Preferences  …Chromium's
 ```
 At some point folders stop being the right shape.
        One file per record works because a note stands alone.
        Once you have tasks that belong to projects, that carry labels, that reference each other, you start wanting questions like "every task due this week across all projects".
        Answering that by opening every file and checking it works until it does not.
 That is when a database takes over:
 ---
 mindflow/
 ├── app.db      ← tasks, projects, labels, notes, all of it
 ├── assets/     ← images stay as files
 └── Cache/  Cookies  …
        notes/ does not get renamed then.
        It disappears, and notes become rows alongside everything else.
        assets/ stays, because images are the one thing that does not belong in a database.
 ---
 A single file at the top is fine. Two hundred is not. A lone `app.db` needs no folder wrapped round it.
 The only hard part is never reusing a name Chromium already took, from the list above.
  Which label for which job:
        userData: database, settings, user files
        cache: thumbnails, downloaded previews
        temp: scratch files you delete yourself
 The system can clear `cache` without asking. Nothing you would miss goes there.
 ---
 Big files and databases
  A database is one file at the top of `userData`.
  Keep large binary things out of it. Save the image as a file in `assets/` and store only its name in the database, which is what mindflow already does. Past roughly 100KB a file beats a database row, and it keeps the database small enough to copy and back up.
 Two things that will bite you
  Never write next to the app itself.** On a Mac the app bundle is signed and read-only, and the code sits inside a sealed archive. It works while you develop and fails on a real install.
        Renaming the app orphans everyone's data.
        The folder is named after the app. Change the name and every user gets a fresh empty folder, with their old one stranded.

 Where mindflow stands:
       You have `assets/` and `notes/`, and nothing else. No database, no settings file.
       If you add either, they go at the top of the same folder as `app.db` and `config.json`, and nothing else moves.

 The escape hatch, for later
 ```app.setPath('sessionData', somewhereElse)```
        Those two dozen files in your folder are not yours.
        They belong to the browser engine inside Electron.
        Your app is a browser window, so it quietly builds up the things browsers build up: cookies, caches, local storage, preferences.
        Electron calls that whole pile the session data, and it has to live somewhere.
        By default, that somewhere is the same folder as your own files.
        That is the only reason Cookies and Cache sit next to notes/ and assets/.
        It is a default, not a law.
**/
// Where dropped and pasted images live.
const assetsDir = (): string => join(app.getPath('userData'), 'assets')

/**
 * Images are addressed by the hash of their bytes, not by name.
 *
 * A pasted image has no filename at all, and the same screenshot dropped into
 * three notes should not be stored three times. The hash solves both, and makes
 * the write idempotent: the same bytes always produce the same file.
 */
const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'image/apng': 'png',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico'
}

// invents custom 'scheme' (address type) like https:// but private to mindflow
// allows app to point to assets without specififying absolute locations on disc
// instead of file:///Users/{username}/Library/Application Support/mindflow/assets/abc.png this allows for
// mindflow://assets/abc.png
// obviously the 'file://' path would only work on my machine
// when the window asks for an address, app will look up where its data folder lives and read the file
// `standard: true` - dicates that address is shaped like a normal web address, e.g mindflow://assets/abc.png splits into a part before the slash and a part after
//                    without it, the string is treated like one lump of text
// `secure: true` - says treat it as trustworthy (like https) , without it browser will refuse and not trust files from this scheme
// needs to run before the app (outside of app.whenReady()) is ready because, the browser engine builds its list of known address types once, as it starts
protocol.registerSchemesAsPrivileged([
  { scheme: 'mindflow', privileges: { standard: true, secure: true } }
])

/** The capture box, and the roomier one the toolbar's expander swaps to. */
const SIZES = {
  compact: { width: 625, height: 400 },
  expanded: { width: 900, height: 680 }
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    ...SIZES.compact,
    // minHeight: 400,
    // minWidth: 600,
    width: 725,
    height: 550,

    resizable: false,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    backgroundColor: 'rgba(0,0,0,0)',

    show: false,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // the ready-to-show event on the BrowserWindow class will be emitted when the renderer process has rendered the page for the first time if the window has not been shown yet.
  // Showing the window after this event will have no visual flash:
  mainWindow.on('ready-to-show', () => {
    // still see a view of app before app fully paints, so will wait 1 sec before show.
    setTimeout((): void => mainWindow.show(), 1000)
  })

  // A file dropped outside the editable would otherwise navigate the window to
  // it, and nothing here is saved.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) event.preventDefault()
  })

  // Editor content reaches this through window.open, so file: and whatever else
  // the OS would happily launch is dropped. The list mirrors the editor's own
  // isAllowedUri, minus the schemes nothing can open.
  const OPENABLE = ['http:', 'https:', 'mailto:', 'tel:', 'sms:', 'callto:', 'ftp:', 'ftps:']
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (OPENABLE.includes(URL.parse(url)?.protocol ?? '')) shell.openExternal(url)
    return { action: 'deny' }
  })


  // macOS-only: kill the traffic lights that titleBarStyle:'hidden' leaves behind
  if (process.platform === 'darwin') {
    mainWindow.setWindowButtonVisibility(false);
  }

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Every web request carries a short line saying what browser is asking. This edits that line to stop announcing Electron.
// What the line looks like. Electron's default, on your machine:
// Mozilla/5.0 (Macintosh; …) Chrome/152.0.7977.78 mindflow/1.0.0 Electron/44.3.0 Safari/537.36
//                                                 └─ cut ─┘        └──── cut ────┘
// The two marked pieces come off. What is left is what I measured in the running app:
// Mozilla/5.0 (Macintosh; …) Chrome/152.0.7977.78 Safari/537.36
// Indistinguishable from ordinary Chrome.
// Why bother. Plenty of sites read that line and decide what to send back. A name they do not recognise often gets a stripped page, or a block. Since the link preview fetch sends this exact string, a bookmark card is the thing that quietly comes back empty.
// The two replaces.
// .replace(/ Electron\/[\d.]+/, '')
// Finds a space, then Electron/, then a run of digits and dots, and deletes it. [\d.]+ is the version number, whatever it happens to be, so this keeps working after an upgrade.
//
// .replace(new RegExp(` ${app.getName()}\\/[\\d.]+`, 'i'), '')
// Same shape, but the name has to be built while the app is running, because it comes from package.json and this file cannot know it in advance. That is the only reason one is written as a plain pattern and the other is assembled. The \\/ is an escaped slash, awkward only because it lives inside a string first. The 'i' makes it case-insensitive, so Mindflow and mindflow both go.
//
// Two details worth knowing. Each replace hits only the first match, which is fine since each token appears once. And this must run before the app is ready, like the scheme registration, or requests have already started going out with the old line.
app.userAgentFallback = app.userAgentFallback
  .replace(/ Electron\/[\d.]+/, '')
  .replace(new RegExp(` ${app.getName()}\\/[\\d.]+`, 'i'), '')

app.whenReady().then(() => {
  registerNotes()

  // Serve the asset store. The pathname is the only thing trusted: anything
  // with a separator in it is refused, so a crafted src cannot walk the disk.
  protocol.handle('mindflow', async (request) => {
    // A standard scheme parses `mindflow://assets/x.png` as host `assets` and
    // path `/x.png`, so the store name is the host, not part of the path.
    const { host, pathname } = new URL(request.url)
    const name = pathname.replace(/^\/+/, '')

    // Only a bare hash and extension. Anything with a separator in it, or any
    // attempt to walk out of the store, fails this and is refused.
    if (host !== 'assets' || !/^[a-f0-9]{64}\.[a-z0-9]+$/.test(name)) {
      return new Response('not found', { status: 404 })
    }
    try {
      // Awaited inside the try: a missing asset rejects, and letting that
      // escape prints a stack instead of the 404 the line above returns.
      return await net.fetch(pathToFileURL(join(assetsDir(), name)).toString())
    } catch {
      return new Response('not found', { status: 404 })
    }
  })

  // Save bytes dropped or pasted into the editor, and hand back the URL that
  // reads them again.
  // Grows and shrinks around the window's own centre, so expanding does not
  // walk the window across the screen. macOS animates the move itself, but it
  // will not resize a window pinned non-resizable, hence the two calls around.
  ipcMain.handle('window:expand', (event, expanded: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return false
    const size = expanded ? SIZES.expanded : SIZES.compact
    const bounds = win.getBounds()

    win.setResizable(true)
    win.setBounds(
      {
        x: Math.round(bounds.x + (bounds.width - size.width) / 2),
        y: Math.round(bounds.y + (bounds.height - size.height) / 2),
        ...size
      },
      true
    )
    win.setResizable(false)
    return Boolean(expanded)
  })

  ipcMain.handle('save-image', async (_event, mime: unknown, bytes: unknown) => {
    if (typeof mime !== 'string' || !(bytes instanceof Uint8Array)) return ''

    const extension = EXTENSIONS[mime]
    if (!extension) return ''
    if (!bytes.byteLength) return ''

    const hash = createHash('sha256').update(bytes).digest('hex')
    const destination = join(assetsDir(), `${hash}.${extension}`)

    await mkdir(assetsDir(), { recursive: true })
    // Same bytes, same file, so writing it again is harmless - but writing it
    // in place truncates the copy the open document is already showing. Write
    // beside it and rename, which is atomic, and whose temporary name cannot
    // pass the guard above while it is half written.
    const temporary = `${destination}.${randomUUID()}.tmp`
    await writeFile(temporary, bytes)
    await rename(temporary, destination)

    return `mindflow://assets/${hash}.${extension}`
  })

  // The same store, for files that are not pictures. The extension is taken
  // from the name rather than a mime type, because a dropped file carries no
  // trustworthy one, and anything unrecognised is stored as .bin.
  ipcMain.handle('save-file', async (_event, name: unknown, bytes: unknown) => {
    if (typeof name !== 'string' || !(bytes instanceof Uint8Array)) return ''
    if (!bytes.byteLength) return ''

    const extension = (name.split('.').pop() ?? '').toLowerCase()
    const suffix = /^[a-z0-9]{1,12}$/.test(extension) ? extension : 'bin'
    const hash = createHash('sha256').update(bytes).digest('hex')
    const destination = join(assetsDir(), `${hash}.${suffix}`)

    await mkdir(assetsDir(), { recursive: true })
    const temporary = `${destination}.${randomUUID()}.tmp`
    await writeFile(temporary, bytes)
    await rename(temporary, destination)

    return `mindflow://assets/${hash}.${suffix}`
  })

  // Write text the renderer produced to a file the user picks: JSON, markdown
  // or HTML. The renderer does the converting; this only puts bytes on disk.
  ipcMain.handle('export-text', async (_event, name: unknown, text: unknown) => {
    if (typeof name !== 'string' || typeof text !== 'string') return false

    const { canceled, filePath } = await dialog.showSaveDialog({ defaultPath: name })
    if (canceled || !filePath) return false

    await writeFile(filePath, text, 'utf8')
    return true
  })

  // A PDF, laid out by the same engine that drew the document on screen. An
  // offscreen window rather than the real one, so printing cannot disturb what
  // is on the page, and a small sheet because the editor's own styles are not
  // loaded in it.
  ipcMain.handle('export-pdf', async (_event, name: unknown, html: unknown) => {
    if (typeof name !== 'string' || typeof html !== 'string') return false

    const { canceled, filePath } = await dialog.showSaveDialog({ defaultPath: name })
    if (canceled || !filePath) return false

    const sheet = `body{font:14px/1.6 -apple-system,system-ui,sans-serif;margin:0;color:#111}
      img{max-width:100%}pre{background:#f4f4f5;padding:.75em;border-radius:6px;overflow:auto}
      blockquote{margin:0 0 0 1em;padding-left:1em;border-left:3px solid #ddd;color:#555}
      table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:.35em .6em}`

    const printer = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
    try {
      await printer.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(
          `<meta charset="utf-8"><style>${sheet}</style>${html}`
        )}`
      )
      const pdf = await printer.webContents.printToPDF({
        printBackground: true,
        margins: { top: 0.6, bottom: 0.6, left: 0.6, right: 0.6 }
      })
      await writeFile(filePath, pdf)
      return true
    } finally {
      printer.destroy()
    }
  })

  // Copy a stored file somewhere the user picks. The store names everything by
  // its hash, so the original name has to be handed back in for the dialog.
  ipcMain.handle('save-file-as', async (_event, src: unknown, name: unknown) => {
    const stored = typeof src === 'string' ? src.replace('mindflow://assets/', '') : ''
    if (!/^[a-f0-9]{64}\.[a-z0-9]+$/.test(stored)) return false

    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: typeof name === 'string' && name ? name : stored
    })
    if (canceled || !filePath) return false

    await copyFile(join(assetsDir(), stored), filePath)
    return true
  })

  // Hand a stored file to whatever the system opens it with.
  ipcMain.handle('open-file', async (_event, src: unknown) => {
    const name = typeof src === 'string' ? src.replace('mindflow://assets/', '') : ''
    if (!/^[a-f0-9]{64}\.[a-z0-9]+$/.test(name)) return false

    const problem = await shell.openPath(join(assetsDir(), name))
    return problem === ''
  })

  // Put a stored image on the system clipboard, so it can be pasted into any
  // app rather than only back into this one. Done here because the renderer
  // cannot read the store: its own content policy forbids fetching a custom
  // scheme, and the file is not reachable any other way.
  ipcMain.handle('copy-image', async (_event, src: unknown) => {
    const name = typeof src === 'string' ? src.replace('mindflow://assets/', '') : ''
    const extension = name.split('.').pop()
    const mime = Object.keys(EXTENSIONS).find((type) => EXTENSIONS[type] === extension)
    if (!/^[a-f0-9]{64}\.[a-z0-9]+$/.test(name) || !mime) return false

    try {
      const bytes = await readFile(join(assetsDir(), name))
      await clipboard.write([new ClipboardItem({ [mime]: new Blob([bytes], { type: mime }) })])
      return true
    } catch {
      return false
    }
  })

  // An image dragged or copied from a web page arrives as a link. Fetching it
  // here rather than in the renderer, which its own content policy forbids,
  // is what lets the note keep a copy instead of a remote dependency.
  ipcMain.handle('fetch-image', async (_event, href: unknown) => {
    if (typeof href !== 'string' || !/^https?:\/\//i.test(href)) return null

    try {
      const response = await net.fetch(href)
      const mime = (response.headers.get('content-type') ?? '').split(';')[0].trim()
      if (!response.ok || !EXTENSIONS[mime]) return null

      const bytes = new Uint8Array(await response.arrayBuffer())
      return bytes.byteLength ? { mime, bytes } : null
    } catch {
      return null
    }
  })

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    // Without this the toolkit blocks Cmd+- outright, so zooming only works
    // one way. See @electron-toolkit/utils watchWindowShortcuts.
    optimizer.watchWindowShortcuts(window, { zoom: true })
  })

  // Link previews are fetched here: the renderer cannot, being subject to CORS
  // and its own content policy.
  ipcMain.handle('fetch-link-metadata', async (_event, url: unknown) => {
    const empty = { href: '', title: '', description: '', image: '', icon: '', site: '' }
    if (typeof url !== 'string') return empty

    const target = URL.parse(url)
    if (!target || !['http:', 'https:'].includes(target.protocol)) return empty

    const fallback = {
      ...empty,
      href: target.href,
      title: target.href,
      icon: new URL('/favicon.ico', target.origin).href,
      site: target.hostname
    }

    // YouTube builds its page in the browser, so the HTML that arrives holds
    // an empty title and no og:image: a card made from it comes out blank.
    // Its oEmbed endpoint needs no key and answers with both. The page does
    // not advertise the endpoint, so there is nothing to discover and the
    // address has to be named.
    //
    // oEmbed carries no description. The channel is the next most useful thing
    // to put under a video's title, and it is the one field that is there.
    const fromOembed = async (): Promise<{ title: string; description: string; image: string } | null> => {
      if (!/(^|\.)(youtube\.com|youtu\.be)$/i.test(target.hostname)) return null
      try {
        const response = await fetch(
          `https://www.youtube.com/oembed?url=${encodeURIComponent(target.href)}&format=json`,
          { signal: AbortSignal.timeout(8000) }
        )
        if (!response.ok) return null

        const data: unknown = await response.json()
        const field = (name: string): string => {
          const value = (data as Record<string, unknown>)?.[name]
          return typeof value === 'string' ? value : ''
        }
        return { title: field('title'), description: field('author_name'), image: field('thumbnail_url') }
      } catch {
        return null
      }
    }

    try {
      const response = await fetch(target, {
        headers: { 'user-agent': app.userAgentFallback },
        signal: AbortSignal.timeout(8000)
      })
      // Only read the body once it is known to be a page of a sane size -
      // otherwise a link to a video or an archive is downloaded in full to
      // find no tags.
      if (!/text\/html|application\/xhtml/i.test(response.headers.get('content-type') ?? '')) {
        return fallback
      }
      if (Number(response.headers.get('content-length')) > 1_500_000) return fallback

      const html = await response.text()
      // Redirects are followed, so relative URLs belong to wherever we landed.
      const base = new URL(response.url || target.href)

      const decode = (text: string): string =>
        text
          .replace(/&quot;/g, '"')
          .replace(/&#0?39;|&apos;/g, "'")
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          // Last, so that an escaped entity such as `&amp;lt;` stays text.
          .replace(/&amp;/g, '&')
          .trim()

      // Match the whole tag, then pull the value with the quote character
      // back-referenced: one pattern covers either attribute order, and a
      // value is free to contain the other kind of quote. Quoted runs are
      // skipped whole, so a `>` inside a value does not end the tag, and the
      // name has to start an attribute - `content` must not match
      // `data-content`.
      // The `[^>"']` is load-bearing: allowing quotes in the last branch makes
      // the alternation ambiguous, and a page can then hang this process for
      // minutes on a few dozen bytes of quotes.
      const TAG_BODY = `(?:"[^"]*"|'[^']*'|[^>"'])*`

      const attr = (tag: string | undefined, name: string): string =>
        decode(
          tag?.match(new RegExp(`[\\s"'/]${name}\\s*=\\s*(["'])([^]*?)\\1`, 'i'))?.[2] ?? ''
        )

      const meta = (property: string): string =>
        attr(
          html.match(
            new RegExp(
              `<meta${TAG_BODY}(?:property|name)=["']${property}["']${TAG_BODY}>`,
              'i'
            )
          )?.[0],
          'content'
        )

      const resolve = (value: string): string =>
        value ? (URL.parse(value, base)?.href ?? '') : ''

      const scraped = {
        href: target.href,
        title:
          meta('og:title') ||
          decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '') ||
          target.href,
        description: meta('og:description'),
        image: resolve(meta('og:image')),
        icon:
          resolve(
            attr(
              html.match(new RegExp(`<link${TAG_BODY}rel=["'][^"']*icon[^"']*["']${TAG_BODY}>`, 'i'))?.[0],
              'href'
            )
          ) ||
          new URL('/favicon.ico', base).href,
        site: meta('og:site_name') || base.hostname
      }

      // Only where the page left a gap, so a site that does answer properly
      // keeps its own words.
      const extra = await fromOembed()
      if (!extra) return scraped
      return {
        ...scraped,
        title: extra.title || scraped.title,
        description: scraped.description || extra.description,
        image: scraped.image || extra.image
      }
    } catch {
      // The page may be unreachable while oEmbed still answers.
      const extra = await fromOembed()
      return extra
        ? { ...fallback, title: extra.title || fallback.title, description: extra.description, image: extra.image }
        : fallback
    }
  })

  createWindow()

  app.on('activate', function() {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
