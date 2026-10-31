import * as React from "react"
import { FLOAT } from "@/lib/float"
import { cn } from "@/lib/cn"
import { pdfCover } from "./pdf-cover"
import { loadPdf } from "./pdf-pages"
import { openPdf } from "./pdf-reader"

/** How wide the card draws a page: small, as the card is, and sharp on a Retina screen. */
const CARD = 132
/** Pages already drawn for the card, kept for the window's life: scrubbing back is instant. */
const pages = new Map<string, Promise<string | null>>()

/** One page of a PDF as a small picture, drawn the first time it is asked for. */
function pageImage(src: string, page: number): Promise<string | null> {
  const key = `${src}#${page}`
  let made = pages.get(key)
  if (!made) {
    made = (async () => {
      const doc = await loadPdf(src)
      const one = await doc.getPage(page)
      const flat = one.getViewport({ scale: 1 })
      const viewport = one.getViewport({ scale: (CARD * 2) / flat.width })
      const canvas = document.createElement("canvas")
      canvas.width = Math.round(viewport.width)
      canvas.height = Math.round(viewport.height)
      const ink = canvas.getContext("2d")
      if (!ink) return null
      ink.fillStyle = "#fff"
      ink.fillRect(0, 0, canvas.width, canvas.height)
      await one.render({ canvasContext: ink, viewport, canvas }).promise
      return canvas.toDataURL("image/jpeg", 0.8)
    })().catch(() => null)
    pages.set(key, made)
  }
  return made
}

/** A PDF named by what is pointed at: its file, its name and the page to start on. */
type Named = { src: string; name: string; first: number }

/** A link into one of the book's PDFs, as notes and gems keep them: `haligtree://assets/….pdf#page=3&name=…`. */
const PDF_LINK = /^((?:haligtree|mindflow):\/\/assets\/[^#?]+\.pdf)(?:#(.*))?$/i

/**
 * The PDF an element names, if any: one tagged with `data-pdf-peek`, or a
 * link into a PDF (read from its address, never by changing the link, which
 * inside a note would make the editor redraw it).
 */
function pdfAt(element: Element | null): (Named & { target: HTMLElement }) | null {
  const tagged = element?.closest?.<HTMLElement>("[data-pdf-peek]")
  if (tagged?.dataset.pdfPeek) return { target: tagged, src: tagged.dataset.pdfPeek, name: tagged.dataset.pdfPeekName ?? "", first: Number(tagged.dataset.pdfPeekPage) || 1 }
  const link = element?.closest?.<HTMLAnchorElement>("a[href]")
  const found = link ? PDF_LINK.exec(link.getAttribute("href") ?? "") : null
  if (!link || !found) return null
  const hash = new URLSearchParams(found[2] ?? "")
  return { target: link, src: found[1], name: hash.get("name") ?? "", first: Number(hash.get("page")) || 1 }
}

type Peek = { src: string; name: string; x: number; top: number; bottom: number; count: number; page: number; image: string | null; ratio: number }

/**
 * A PDF's pages, previewed where it is pointed at: any element carrying
 * `data-pdf-peek` (its file) shows a small card above it, the cover first
 * (kept, so it is there at once). Moving the pointer across the card turns
 * the pages, "8 / 17" in its corner; leaving it hides it, and a click opens
 * the reader at the page on show. Mounted once, as the tips are, so every
 * surface that names a PDF (a note's PDF and "(p. N)", Media, the library,
 * link cards, ⌘K) gets it by carrying the attribute.
 */
export function PdfPeek(): React.JSX.Element | null {
  const [peek, setPeek] = React.useState<Peek | null>(null)
  const card = React.useRef<HTMLDivElement>(null)
  const on = React.useRef<Element | null>(null)
  const wanted = React.useRef(0)

  React.useEffect(() => {

    const show = (target: HTMLElement, { src, name, first }: Named): void => {
      const r = target.getBoundingClientRect()
      on.current = target
      void pdfCover(src, name).then(async (cover) => {
        if (on.current !== target) return
        const doc = await loadPdf(src).catch(() => null)
        if (!doc || on.current !== target) return
        const probe = new Image()
        const ratio = await new Promise<number>((done) => {
          if (!cover) return done(1.3)
          probe.onload = () => done(probe.naturalHeight / probe.naturalWidth || 1.3)
          probe.onerror = () => done(1.3)
          probe.src = cover.image
        })
        if (on.current !== target) return
        setPeek({ src, name, x: r.left + r.width / 2, top: r.top, bottom: r.bottom, count: doc.numPages, page: first, image: first === 1 ? (cover?.image ?? null) : null, ratio })
        if (first !== 1) void turn(src, first)
      })
    }
    const over = (event: PointerEvent): void => {
      const found = pdfAt(event.target as Element | null)
      if (found && found.target !== on.current && !card.current?.contains(found.target)) show(found.target, found)
    }
    const out = (event: PointerEvent): void => {
      if (!on.current) return
      const next = event.relatedTarget as Node | null
      // The card reaches down to the link (a clear strip between), so the pointer crosses straight onto it.
      if (next && (on.current.contains(next) || card.current?.contains(next))) return
      away()
    }
    const away = (): void => ((on.current = null), setPeek(null))
    addEventListener("pointerover", over, true)
    addEventListener("pointerout", out, true)
    addEventListener("keydown", away, true)
    addEventListener("blur", away)
    return () => {
      removeEventListener("pointerover", over, true)
      removeEventListener("pointerout", out, true)
      removeEventListener("keydown", away, true)
      removeEventListener("blur", away)
    }
  }, [])

  /** The page on show: its picture once drawn, the last one staying until then, so the card never jumps. */
  const turn = async (src: string, page: number): Promise<void> => {
    wanted.current = page
    setPeek((now) => (now && now.src === src ? { ...now, page } : now))
    const image = page === 1 ? ((await pdfCover(src))?.image ?? null) : await pageImage(src, page)
    if (wanted.current !== page) return
    setPeek((now) => (now && now.src === src && now.page === page ? { ...now, image } : now))
  }

  if (!peek) return null
  const height = Math.round(CARD * peek.ratio)
  const above = peek.top - height - 16 > 8
  // A clear strip of GAP between card and link belongs to the card, so the
  // pointer crosses from one to the other without leaving either.
  const GAP = 8
  return (
    <div
      ref={card}
      data-pdf-peek-card
      className="fixed z-[90]"
      style={{ left: Math.min(Math.max(peek.x - CARD / 2, 8), innerWidth - CARD - 8), top: above ? peek.top - height - GAP : peek.bottom, width: CARD, height: height + GAP, [above ? "paddingBottom" : "paddingTop"]: GAP }}
    >
      <div
        role="button"
        aria-label={`Open ${peek.name || "the PDF"} at page ${peek.page}`}
        className={cn(FLOAT, "relative size-full cursor-pointer overflow-hidden rounded-md animate-in fade-in-0 zoom-in-95 duration-100")}
        onPointerMove={(event) => {
          const r = event.currentTarget.getBoundingClientRect()
          const page = Math.min(peek.count, Math.max(1, Math.floor(((event.clientX - r.left) / r.width) * peek.count) + 1))
          if (page !== peek.page) void turn(peek.src, page)
        }}
        onClick={() => (openPdf(peek.src, peek.name, peek.page), (on.current = null), setPeek(null))}
      >
        {peek.image ? <img src={peek.image} alt="" draggable={false} className="block size-full bg-white object-cover object-top" /> : <div className="size-full bg-white" />}
        <span data-pdf-peek-page className="absolute right-1.5 bottom-1.5 rounded bg-background px-1.5 py-0.5 text-[0.6875rem] font-medium tabular-nums text-foreground shadow-sm">
          {peek.page} / {peek.count}
        </span>
      </div>
    </div>
  )
}
