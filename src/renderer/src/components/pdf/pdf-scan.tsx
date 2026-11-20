import { useEffect, useState } from "react"
import type { PDFDocumentProxy } from "pdfjs-dist"
import { Minus, ScanText } from "lucide-react"
import { call } from "@/lib/haligtree"
import { chime } from "@/lib/sound"
import { Orb } from "@/components/haligtree/orb"
import { toast } from "@/components/haligtree/ui"
import { num, plural } from "../../../../main/dates"

/**
 * A scanned book: pages that are only pictures of words, so nothing in them
 * can be found, picked, highlighted or read aloud. Said once, under the bar,
 * with the one thing to do about it: "Read the text on these pages" (Vision,
 * on this Mac, main/pdf-text.ts). Its pages are then read in the background,
 * page by page, with a Stop; done, the book opens again with its words on it,
 * and the copy is kept with the book. "Not now" puts the line away for this
 * book for good; the same reading stays in Details ("Read the text on these pages").
 */

type State = { reading: { page: number; of: number } } | { read: boolean }

/** Whether a book's first pages carry no words at all: a scan. */
export async function isScanned(doc: PDFDocumentProxy): Promise<boolean> {
  let words = 0
  for (let n = 1; n <= Math.min(3, doc.numPages); n++) {
    const content = await (await doc.getPage(n)).getTextContent()
    words += content.items.reduce((sum, item) => sum + ("str" in item ? item.str.trim().length : 0), 0)
  }
  return words < 8
}

const hiddenKey = (src: string): string => `pdf-scan-hidden:${src}`

/** Reading a book's pages, from anywhere: the line under the bar and Details both start it. */
export async function readPages(src: string): Promise<boolean> {
  const started = await call<{ started: true } | { error: string }>("pdf:read-text", src)
  if ("error" in started) toast(started.error, undefined, "error")
  else chime("tap")
  return !("error" in started)
}

/** Where a book's reading has got to, kept as main says it. */
export function useReadState(src: string): State | null {
  const [state, setState] = useState<State | null>(null)
  useEffect(() => {
    let live = true
    void call<State>("pdf:read-state", src).then((now) => live && setState(now))
    const stop = window.api.onPdfReading((said) => {
      if (said.src !== src) return
      if (said.page) setState({ reading: { page: said.page, of: said.of ?? 0 } })
      else setState({ read: !!said.done })
    })
    return () => void ((live = false), stop())
  }, [src])
  return state
}

export function ScanLine({ src, doc, onRead }: { src: string; doc: PDFDocumentProxy | null; onRead: () => void }): React.JSX.Element | null {
  const [scanned, setScanned] = useState(false)
  const [hidden, setHidden] = useState(() => localStorage.getItem(hiddenKey(src)) === "1")
  const known = useReadState(src)
  // Pressed: the orb at once, before main has read a page (a short book is read before the first word would show).
  const [asked, setAsked] = useState(false)
  const state: State | null = known && "reading" in known ? known : asked && !(known && "read" in known && known.read) ? { reading: { page: 0, of: doc?.numPages ?? 0 } } : known
  useEffect(() => {
    if (known && "read" in known && known.read) setAsked(false)
  }, [known])
  useEffect(() => {
    let live = true
    if (doc) void isScanned(doc).then((yes) => live && setScanned(yes)).catch(() => {})
    return () => void (live = false)
  }, [doc])
  // Done while this book is open: it opens again with its words, and says what it can now do.
  useEffect(() => {
    return window.api.onPdfReading((said) => {
      if (said.src !== src) return
      if (said.done) {
        chime("done")
        toast(`Read ${plural(said.pages ?? 0, "page")}: find, highlight and “Read aloud” now work in this book`)
        onRead()
      } else if (said.error) {
        setAsked(false)
        if (said.error !== "Stopped") toast(said.error, undefined, "error")
      }
    })
  }, [src, onRead])
  const reading = state && "reading" in state ? state.reading : null
  if (!reading && (!scanned || hidden || (state && "read" in state && state.read))) return null
  return (
    <div data-pdf-scan className="pdf-scan-line">
      {reading ? (
        <Orb label={reading.page ? `Reading page ${num(reading.page)} of ${num(reading.of)}…` : "Reading the pages…"} stop={() => void call("pdf:read-stop", src)} />
      ) : (
        <>
          <ScanText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span data-pdf-scan-words className="pdf-scan-words"><b className="font-medium text-foreground"><span className="pdf-scan-long">This book is a scan: its pages are photos.</span><span className="pdf-scan-short">A scanned book.</span></b><span className="pdf-scan-more"> Read the words on them to search, highlight and hear it.</span></span>
          <button type="button" data-pdf-scan-read className="pdf-scan-button" onClick={() => (setAsked(true), void readPages(src).then((ok) => ok || setAsked(false)))} aria-label="Read the words on the pages"><span className="pdf-scan-long">Read the words on the pages</span><span className="pdf-scan-short">Read the words</span></button>
          <button type="button" aria-label="Not now" title="Not now: it stays in Details" className="pdf-scan-close" onClick={() => (chime("fold"), localStorage.setItem(hiddenKey(src), "1"), setHidden(true))}>
            <Minus className="size-3.5" />
          </button>
        </>
      )}
    </div>
  )
}

/**
 * The same, in a book's Details: a scan says it can be read (even after "Not now"),
 * a read book says so and can go back to the scan as it came.
 */
export function ScanDetail({ src, doc, onRead }: { src: string; doc: PDFDocumentProxy | null; onRead: () => void }): React.JSX.Element | null {
  const state = useReadState(src)
  const [scanned, setScanned] = useState(false)
  useEffect(() => {
    let live = true
    if (doc) void isScanned(doc).then((yes) => live && setScanned(yes)).catch(() => {})
    return () => void (live = false)
  }, [doc])
  if (!state) return null
  if ("reading" in state) return <p data-pdf-scan-detail className="mt-3 text-meta"><Orb label={`Reading page ${num(state.reading.page)} of ${num(state.reading.of)}…`} /></p>
  if (state.read)
    return (
      <p data-pdf-scan-detail className="mt-3 flex items-center gap-2 text-meta text-muted-foreground">
        <ScanText className="size-3.5 shrink-0" aria-hidden />
        <span className="flex-1">A scan, its words read on this Mac so you can search, select and highlight them.</span>
        <button type="button" data-pdf-scan-forget className="cursor-pointer rounded-sm font-medium text-(--mf-muted-strong) hover:text-foreground hover:underline active:scale-[0.97]"
          onClick={() => void call<boolean>("pdf:read-forget", src).then((gone) => gone && (chime("fold"), toast("The words read from this scan are forgotten: it is photos again", () => void readPages(src)), onRead()))}>Forget the words</button>
      </p>
    )
  if (!scanned) return null
  return (
    <p data-pdf-scan-detail className="mt-3 flex items-center gap-2 text-meta text-muted-foreground">
      <ScanText className="size-3.5 shrink-0" aria-hidden />
      <span className="flex-1">A scan: its pages are photos.</span>
      <button type="button" className="cursor-pointer rounded-sm font-medium text-(--mf-muted-strong) hover:text-foreground hover:underline active:scale-[0.97]" onClick={() => void readPages(src)}>Read the text on these pages</button>
    </p>
  )
}
