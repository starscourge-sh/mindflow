/**
 * What the editor needs from whatever it is running inside.
 *
 * Storing a dropped picture, fetching what a link is about, handing a file to
 * the system: none of that is an editor's job, and none of it has one answer.
 * Electron does it over IPC, a web app does it over HTTP, a demo does it with
 * a blob URL. So the editor asks the host instead of reaching for a global.
 *
 * Every member is optional. Left out, the feature that needs it goes quiet
 * rather than throwing: no bookmark card, no PDF export, no "copy image".
 */
export interface MindflowHost {
  /** Store image bytes and return a URL that reads them again. */
  saveImage?: (mime: string, bytes: Uint8Array) => Promise<string>
  /** Store any file and return a URL that reads it again. */
  saveFile?: (name: string, bytes: Uint8Array) => Promise<string>
  /** Read a linked image the page's own content policy will not fetch. */
  fetchImage?: (href: string) => Promise<{ mime: string; bytes: Uint8Array } | null>
  /** Title, description and picture for a link, for the bookmark card. */
  fetchLinkMetadata?: (url: string) => Promise<LinkMetadata>
  /** Write text to a file the user picks. */
  exportText?: (name: string, text: string) => Promise<boolean>
  /** Render HTML to a PDF at a path the user picks. */
  exportPdf?: (name: string, html: string) => Promise<boolean>
  /** Copy a stored file somewhere the user picks, under its original name. */
  saveFileAs?: (src: string, name: string) => Promise<boolean>
  /** Open a stored file with whatever the system uses for it. */
  openFile?: (src: string) => Promise<boolean>
  /** Put a stored image on the system clipboard. */
  copyImage?: (src: string) => Promise<boolean>
}

/** What a bookmark card is built from. */
export interface LinkMetadata {
  href: string
  title: string
  description: string
  image: string
  icon: string
  site: string
}

/**
 * A browser's own answers, for a host that supplies none.
 *
 * Enough that the editor works when it is dropped into a plain web page: a
 * dropped picture becomes a data URL, an export downloads. What a browser
 * genuinely cannot do - read another origin's page for a link preview, print
 * to a PDF the user names - is left out, and those features stay quiet.
 */
const BROWSER: MindflowHost = {
  saveImage: (mime, bytes) => toDataUrl(new Blob([bytes as BlobPart], { type: mime })),
  saveFile: (name, bytes) =>
    toDataUrl(new File([bytes as BlobPart], name, { type: "application/octet-stream" })),

  fetchImage: async (href) => {
    const response = await fetch(href)
    if (!response.ok) return null
    const buffer = await response.arrayBuffer()
    return {
      mime: response.headers.get("content-type") ?? "image/png",
      bytes: new Uint8Array(buffer),
    }
  },

  exportText: async (name, text) => {
    download(name, new Blob([text], { type: "text/plain" }))
    return true
  },

  saveFileAs: async (src, name) => {
    download(name, await (await fetch(src)).blob())
    return true
  },

  openFile: async (src) => {
    window.open(src, "_blank", "noopener")
    return true
  },

  copyImage: async (src) => {
    const blob = await (await fetch(src)).blob()
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
    return true
  },
}

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

function download(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const link = Object.assign(document.createElement("a"), { href: url, download: name })
  link.click()
  URL.revokeObjectURL(url)
}

let current: MindflowHost = BROWSER

/**
 * Point the editor at a host.
 *
 * A module rather than React context, because the things that ask are input
 * rules, paste handlers and plain functions, none of which sit in a component
 * and none of which can call a hook. One host per page, which is the number
 * every app has had so far.
 */
export function setHost(host: MindflowHost | undefined): void {
  current = { ...BROWSER, ...host }
}

/** What the host offers. A missing member means that feature is off. */
export function host(): MindflowHost {
  return current
}
