import type { LinkMetadata } from '../../../preload/index.d'
import type { Cue } from './sound'
export type { LinkMetadata }
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
export interface HaligtreeHost {
  /** Store image bytes and return a URL that reads them again. */
  saveImage?: (mime: string, bytes: Uint8Array) => Promise<string>
  /** Store any file and return a URL that reads it again. */
  saveFile?: (name: string, bytes: Uint8Array) => Promise<string>
  /** The picture on the system clipboard, as PNG bytes, or null when there is none. */
  clipboardImage?: () => Promise<{ mime: string; bytes: Uint8Array } | null>
  /** Where a file lies on disk, '' for one that is only in memory (a picture copied from a page): a pasted file with a place there was copied in Finder. */
  pathOf?: (file: File) => string
  /** A PDF on the web, kept in the book's files once: where it is kept now, and its name. */
  fetchPdf?: (href: string) => Promise<{ src: string; name: string } | null>
  /** A web page read into an article and kept offline: its id, or why it could not be read. */
  fetchArticle?: (href: string, again?: boolean) => Promise<{ article: { id: string; href: string; title: string; byline: string; site: string; published: string; html: string; savedAt: string }; /** Its pictures still coming, told by this name (haligtree:article-picture). */ reading?: string; /** Read again and failed: why, over the copy kept. */ error?: string } | { error: string } | { stopped: true }>
  /** Read a linked image the page's own content policy will not fetch. */
  fetchImage?: (href: string) => Promise<{ mime: string; bytes: Uint8Array } | null>
  /**
   * Find the pictures and files a note copied out of Obsidian points at
   * (`![[name.png]]`, a path) and store them: each as what it became, or null.
   */
  bringEmbeds?: (refs: string[]) => Promise<({ src: string; name: string; size: number; image: boolean } | null)[]>
  /** Title, description and picture for a link, for the bookmark card. */
  fetchLinkMetadata?: (url: string) => Promise<LinkMetadata>
  /** Write text to a file the user picks. */
  exportText?: (name: string, text: string) => Promise<boolean>
  /** Render HTML to a PDF at a path the user picks. */
  exportPdf?: (name: string, html: string) => Promise<boolean>
  /** Copy a stored file somewhere the user picks, under its original name. */
  saveFileAs?: (src: string, name: string) => Promise<boolean>
  /** Open a copy of a stored file, under `name`, with whatever the system uses for it: never the stored file itself, and never shown in Finder. */
  openFile?: (src: string, name?: string) => Promise<boolean>
  /** Put a stored image on the system clipboard. */
  copyImage?: (src: string) => Promise<boolean>
  /** The words in a stored picture, read by the system: '' with none, null when it could not be read. */
  imageText?: (src: string) => Promise<string | null>
  /** Drag a stored picture or file out to another app, as the real file under `name`. */
  dragOut?: (src: string, name: string, face?: string) => void
  /** Whether the word at `start` in `text` is misspelt, what it might be, and the language the text was read as: asked, never waited on. */
  spelling?: (text: string, start: number, length: number) => Promise<{ flagged: boolean; guesses: string[]; language: string } | null>
  /** “Learn spelling”: the word is no longer misspelt, anywhere (`on` false takes that back). */
  learnSpelling?: (word: string, on?: boolean) => Promise<boolean>
  /** The window's own right-click menu, where it has one outside the page (a sticky's), for a right-click the words passed on. */
  ownMenu?: (x: number, y: number, picked: string) => void
  /**
   * Open a drawing in a window of its own, and keep it in step.
   *
   * The host owns the window; the editor only says which drawing and what is
   * in it. Whatever comes back through `onDrawingChange` is what the block
   * writes down, so the two views never argue about which is newer.
   *
   * Left out - a web page, which has no second window to give - and the
   * button is not offered at all.
   */
  openDrawing?: (id: string, scene: unknown, name?: string, picture?: string) => void
  /** Changes made in that window, for the block to write down. */
  onDrawingChange?: (listen: (id: string, scene: unknown) => void) => () => void
  /** Whether that window is open, so the block knows when it owns the drawing. */
  onDrawingWindow?: (listen: (id: string, open: boolean) => void) => () => void
}

/**
 * A browser's own answers, for a host that supplies none.
 *
 * Enough that the editor works when it is dropped into a plain web page: a
 * dropped picture becomes a data URL, an export downloads. What a browser
 * genuinely cannot do - read another origin's page for a link preview, print
 * to a PDF the user names - is left out, and those features stay quiet.
 */
const BROWSER: HaligtreeHost = {
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

let current: HaligtreeHost = BROWSER

/**
 * Point the editor at a host.
 *
 * A module rather than React context, because the things that ask are input
 * rules, paste handlers and plain functions, none of which sit in a component
 * and none of which can call a hook. One host per page, which is the number
 * every app has had so far.
 */
export function setHost(host: HaligtreeHost | undefined): void {
  // An editor that names none keeps the page's: otherwise the last plain one
  // drawn would take spelling and the rest from every editor beside it.
  if (host) current = { ...BROWSER, ...host }
}

/** What the host offers. A missing member means that feature is off. */
export function host(): HaligtreeHost {
  return current
}

/**
 * Something the editor did that has no mark of its own on the page (a copy):
 * said out loud for whatever app holds the editor to show. Haligtree turns it into
 * a toast and a sound (components/haligtree/ui.tsx); anywhere else it is quiet.
 * `also.cue` is the one sound it plays, for what was done (a gem kept: "saved"), in place of a copy's or a
 * refusal's; a cue played beside it as well made two for one act (18 Nov 2026). `also.undo` takes it back.
 */
export function said(text: string, ok = true, made?: { type: string; id: string; title?: string }, also?: { cue?: Cue; undo?: () => void }): void {
  window.dispatchEvent(new CustomEvent("haligtree:said", { detail: { text, ok, made, ...also } }))
}
