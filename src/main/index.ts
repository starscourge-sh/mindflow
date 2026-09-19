import { app, shell, BrowserWindow, clipboard, ClipboardItem, ipcMain, net, protocol } from 'electron'
import { createHash, randomUUID } from 'crypto'
import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerNotes } from './notes'

/** Where dropped and pasted images live. */
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

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 625,
    height: 400,
    // minWidth: 625,
    resizable: false,
    show: false,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    backgroundColor: 'black',
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

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
// YouTube refuses to serve embeds to anything it reads as automation, and the
// default user agent announces both Electron and the app name.
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

      return {
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
    } catch {
      return fallback
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
