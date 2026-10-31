import * as React from "react"
import { stepTap } from "@/lib/haptics"
import { FLOAT } from "@/lib/float"
import { cn } from "@/lib/cn"
import { hideForMenus, menuShowing } from "@/lib/menu-showing"
import { pdfCover } from "./pdf-cover"
import { usePaperPages } from "./paper"
import { loadPdf } from "./pdf-pages"
import { openPdf } from "./pdf-reader"

/** How wide the card draws a page: small, as the card is, and sharp on a Retina screen. */
const CARD = 132
/** Pages already drawn for the card, kept for the window's life: scrubbing back is instant. */
const drawn = new Map<string, string | null>()
/** The page wanted most now, and pages to draw while nothing is wanted (a ladder across the book). */
let wantedNow: { src: string; page: number } | null = null
const ladder: { src: string; page: number }[] = []
const waiting = new Map<string, ((image: string | null) => void)[]>()
let drawing = false

/** One page drawn small. Only ever one at a time: pdf.js would otherwise queue every page the pointer passed. */
async function draw(src: string, page: number): Promise<string | null> {
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
}

/** The one drawing lane: the page wanted now first (pages passed on the way are skipped), then the ladder. */
async function pump(): Promise<void> {
  if (drawing) return
  drawing = true
  try {
    for (;;) {
      const next = wantedNow && !drawn.has(`${wantedNow.src}#${wantedNow.page}`) ? wantedNow : ladder.shift()
      if (!next) break
      const key = `${next.src}#${next.page}`
      if (drawn.has(key)) continue
      const image = await draw(next.src, next.page).catch(() => null)
      drawn.set(key, image)
      for (const done of waiting.get(key) ?? []) done(image)
      waiting.delete(key)
    }
  } finally {
    drawing = false
  }
}

/** One page of a PDF as a small picture: at once if drawn, else when the lane reaches it (it goes to the front). */
function pageImage(src: string, page: number): Promise<string | null> {
  const key = `${src}#${page}`
  if (drawn.has(key)) return Promise.resolve(drawn.get(key)!)
  wantedNow = { src, page }
  const made = new Promise<string | null>((done) => waiting.set(key, [...(waiting.get(key) ?? []), done]))
  void pump()
  return made
}

/** The nearest page already drawn, shown while the one asked for is drawn, so the card moves with the pointer. */
function nearestDrawn(src: string, page: number, count: number): string | null {
  for (let step = 1; step < count; step += 1) {
    for (const at of [page - step, page + step]) {
      const image = at >= 1 && at <= count ? drawn.get(`${src}#${at}`) : undefined
      if (image) return image
    }
  }
  return null
}

/** On first sight of a book, a ladder of pages across it is drawn in turn, so a sweep anywhere lands near one. */
function climb(src: string, count: number, from: number): void {
  if (ladder.some((one) => one.src === src)) return
  const rungs = Math.min(count, 24)
  for (let k = 0; k < rungs; k += 1) {
    const page = Math.max(1, Math.min(count, Math.round(from + (k / rungs) * (count - from + 1)) || 1))
    if (!drawn.has(`${src}#${page}`)) ladder.push({ src, page })
  }
  void pump()
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

type Peek = { src: string; name: string; x: number; top: number; bottom: number; count: number; first: number; page: number; image: string | null; ratio: number }

/**
 * A PDF's pages, previewed where it is pointed at: any element carrying
 * `data-pdf-peek` (its file) shows a small card above it, the cover first
 * (kept, so it is there at once). Moving the pointer across the card turns
 * the pages, "8 / 17" in its corner; leaving it hides it. A click on the card
 * opens the reader at the page on show; a click on the link opens its own page. Mounted once, as the tips are, so every
 * surface that names a PDF (a note's PDF and "(p. N)", Media, the library,
 * link cards, ⌘K) gets it by carrying the attribute.
 */
export function PdfPeek(): React.JSX.Element | null {
  const [peek, setPeek] = React.useState<Peek | null>(null)
  // "Paper pages" tints the preview as it does the pages, so a page reads one way everywhere.
  const [paper] = usePaperPages()
  const card = React.useRef<HTMLDivElement>(null)
  const on = React.useRef<Element | null>(null)
  const wanted = React.useRef(0)
  /** What the card is placed against: a PDF's whole card in a note, else the link itself. */
  const around = React.useRef<Element | null>(null)

  React.useEffect(() => {

    const show = (target: HTMLElement, { src, name, first }: Named): void => {
      // A PDF's card in a note: above or below the whole card, never over its title; elsewhere the link itself.
      const anchor = target.closest<HTMLElement>(".tiptap-pdf-card") ?? target
      const r = anchor.getBoundingClientRect()
      const t = target.getBoundingClientRect()
      on.current = target
      around.current = anchor
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
        setPeek({ src, name, x: t.left + t.width / 2, top: r.top, bottom: r.bottom, count: doc.numPages, first, page: first, image: first === 1 ? (cover?.image ?? null) : null, ratio })
        climb(src, doc.numPages, first)
        if (first !== 1) void turn(src, first)
      })
    }
    const over = (event: PointerEvent): void => {
      // Never over a menu: one open is what is being read (lib/menu-showing.ts).
      if (menuShowing()) return
      // A button held down is a press or the start of a drag: no card comes up under it.
      if (event.buttons) return away()
      const found = pdfAt(event.target as Element | null)
      if (found && found.target !== on.current && !card.current?.contains(found.target)) show(found.target, found)
    }
    const out = (event: PointerEvent): void => {
      if (!on.current) return
      const next = event.relatedTarget as Node | null
      // The card reaches down to the link (a clear strip between), so the pointer crosses straight onto it.
      if (next && (on.current.contains(next) || around.current?.contains(next) || card.current?.contains(next))) return
      away()
    }
    const away = (): void => ((on.current = null), setPeek(null))
    // Along the link's own words the pages turn too, no need to move onto the
    // card: its left edge is the link's own page (or the cover), its right the last.
    const along = (event: PointerEvent): void => {
      const target = on.current
      const now = shown.current
      if (!target || !now || !target.contains(event.target as Node)) return
      const r = target.getBoundingClientRect()
      const page = Math.min(now.count, Math.max(now.first, now.first + Math.floor(((event.clientX - r.left) / r.width) * (now.count - now.first + 1))))
      if (page !== now.page) (stepTap(page, now.first, now.count), void turn(now.src, page))
    }
    // A click on the link itself opens at its own page (or where you left the book), never the page the
    // pointer happened to turn to on the way: that page opens from a click on the card, which names it.
    addEventListener("pointerover", over, true)
    addEventListener("pointerout", out, true)
    addEventListener("pointermove", along, true)
    addEventListener("keydown", away, true)
    addEventListener("blur", away)
    const stop = hideForMenus(away)
    return () => {
      stop()
      removeEventListener("pointerover", over, true)
      removeEventListener("pointerout", out, true)
      removeEventListener("pointermove", along, true)
      removeEventListener("keydown", away, true)
      removeEventListener("blur", away)
    }
  }, [])
  // The card as it is now, for the listeners above, which are made once.
  const shown = React.useRef<Peek | null>(null)
  shown.current = peek

  /** The page on show: its picture once drawn, the last one staying until then, so the card never jumps. */
  const turn = async (src: string, page: number): Promise<void> => {
    wanted.current = page
    // The nearest page already drawn stands in, so the picture follows the pointer even before this one is drawn.
    setPeek((now) => (now && now.src === src ? { ...now, page, image: page === 1 ? now.image : (drawn.get(`${src}#${page}`) ?? nearestDrawn(src, page, now.count) ?? now.image) } : now))
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
        className={cn(FLOAT, "pdf-peek-face", paper && "is-paper", "relative size-full cursor-pointer overflow-hidden rounded-md animate-in fade-in-0 zoom-in-95 duration-100")}
        onPointerMove={(event) => {
          const r = event.currentTarget.getBoundingClientRect()
          const page = Math.min(peek.count, Math.max(1, Math.floor(((event.clientX - r.left) / r.width) * peek.count) + 1))
          if (page !== peek.page) (stepTap(page, peek.first, peek.count), void turn(peek.src, page))
        }}
        onClick={() => (openPdf(peek.src, peek.name, peek.page), (on.current = null), setPeek(null))}
      >
        {peek.image ? <img src={peek.image} alt="" draggable={false} className={cn("block size-full object-cover object-top", !paper && "bg-white")} /> : <div className={cn("size-full", !paper && "bg-white")} />}
        <span data-pdf-peek-page className="absolute right-1.5 bottom-1.5 rounded bg-background px-1.5 py-0.5 text-[0.6875rem] font-medium tabular-nums text-foreground shadow-sm">
          {peek.page} / {peek.count}
        </span>
      </div>
    </div>
  )
}
