import * as React from "react"
import { createPortal } from "react-dom"
import { stepTap } from "@/lib/haptics"
import { FLOAT } from "@/lib/float"
import { cn } from "@/lib/cn"
import { hideForMenus, menuShowing } from "@/lib/menu-showing"
import { pdfCover } from "./pdf-cover"
import { useDarkPages, usePaperPages } from "./paper"
import { loadPdf } from "./pdf-pages"
import { openPdf } from "./pdf-reader"

/** How wide the card draws a page: small, as the card is, and sharp on a Retina screen. */
const CARD = 132
/**
 * Pages already drawn small, shared by the card, a cover's scrub and a book's page strip (book-links.tsx): scrubbing
 * back is instant. The most recently seen are kept, up to `KEPT` (a page is a 264px JPEG, some 20 KB), so a sweep
 * across a 1,000-page book never holds the whole book in memory.
 */
const drawn = new Map<string, string | null>()
const KEPT = 160
const keep = (key: string, image: string | null): void => {
  drawn.delete(key)
  drawn.set(key, image)
  if (drawn.size > KEPT) drawn.delete(drawn.keys().next().value!)
}
/** A page already drawn small, or undefined: nothing is drawn by asking. Seen again, it is kept longer. */
export function drawnPage(src: string, page: number): string | null | undefined {
  const key = `${src}#${page}`
  const image = drawn.get(key)
  if (image !== undefined) keep(key, image)
  return image
}
/** The page wanted most now, and pages to draw while nothing is wanted (a ladder across the book). */
let wantedNow: { src: string; page: number } | null = null
const ladder: { src: string; page: number }[] = []
const waiting = new Map<string, ((image: string | null) => void)[]>()
let drawing = false

/**
 * One page drawn small, as it is printed: white paper and its own colours, whatever "Dark pages" is set to in the
 * reader. A small picture is for finding a page, not for reading it, and drawing it dark took a second pass over
 * every picture on the page (the user, 12 Nov: "you can show the pages as they are"). "Paper pages" still tints it,
 * in CSS, at no cost. Only ever one at a time: pdf.js would otherwise queue every page the pointer passed. */
async function draw(src: string, page: number): Promise<string | null> {
  const began = performance.now()
  try {
    return await drawn1(src, page)
  } finally {
    // Each drawing timed, for the probes that hold its cost down (qa/page-strip.mjs).
    performance.measure("pdf-page-small", { start: began, end: performance.now() })
  }
}
async function drawn1(src: string, page: number): Promise<string | null> {
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
      keep(key, image)
      for (const done of waiting.get(key) ?? []) done(image)
      waiting.delete(key)
    }
  } finally {
    drawing = false
  }
}

/** One page of a PDF as a small picture: at once if drawn, else when the lane reaches it (it goes to the front). */
export function pageImage(src: string, page: number): Promise<string | null> {
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

/** How long the pointer rests on a cover before sliding across it turns its pages: a sweep across a shelf of 500 books never sets one off. */
export const GRACE = 600
/** How far the pointer slides sideways, once rested, before the cover turns into a page. */
const SLIDE = 4

/**
 * A cover big enough to be a page itself (a book on the shelf, a Media tile):
 * the element inside the pointed-at one that carries `data-pdf-peek-scrub`.
 * Smaller covers (a PDF's card in a note, Continue reading) are too small to
 * read a page on, so they show the card, after the same rest.
 */
const scrubBoxOf = (target: HTMLElement): HTMLElement | null => (target.matches("[data-pdf-peek-scrub]") ? target : target.querySelector<HTMLElement>("[data-pdf-peek-scrub]"))
const isThumb = (target: HTMLElement): boolean => target.matches(".tiptap-pdf-cover, .continue-book-cover")

/** The page a cover is scrubbed to now, for a click on it to open there (the shelf's books): null when it is not being scrubbed. */
let scrubbedNow: { src: string; page: number } | null = null
export const scrubbedPage = (src: string): number | null => (scrubbedNow?.src === src ? scrubbedNow.page : null)

/** A cover turned into one of its pages in place, as a video's frame shows under the pointer. */
type Scrub = { box: HTMLElement; src: string; name: string; count: number; page: number; image: string | null; from: number; moved: boolean }

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
  const [paperKept] = usePaperPages()
  const [dark] = useDarkPages()
  const paper = paperKept && !dark
  const card = React.useRef<HTMLDivElement>(null)
  const on = React.useRef<Element | null>(null)
  const wanted = React.useRef(0)
  /** What the card is placed against: a PDF's whole card in a note, else the link itself. */
  const around = React.useRef<Element | null>(null)
  const [scrub, setScrub] = React.useState<Scrub | null>(null)
  const scrubbing = React.useRef<Scrub | null>(null)
  scrubbing.current = scrub
  const rest = React.useRef(0)

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
    // Where the pointer is, for a cover armed after its rest to start from.
    let pointerX = 0
    const track = (event: PointerEvent): void => void (pointerX = event.clientX)
    /** Rested on a big cover: it is armed, and the first slide sideways turns it into a page. Nothing shows before. */
    const arm = (target: HTMLElement, box: HTMLElement, { src, name }: Named): void => {
      on.current = target
      around.current = target
      scrubbedNow = null
      setScrub(null)
      clearTimeout(rest.current)
      rest.current = window.setTimeout(() => {
        if (on.current !== target) return
        const from = pointerX
        void loadPdf(src)
          .then((doc) => {
            if (on.current !== target) return
            setScrub({ box, src, name, count: doc.numPages, page: 1, image: null, from, moved: false })
            climb(src, doc.numPages, 1)
          })
          .catch(() => undefined)
      }, GRACE)
    }
    const over = (event: PointerEvent): void => {
      // A button held down is a press or the start of a drag: no card comes up under it.
      if (event.buttons) return away()
      const found = pdfAt(event.target as Element | null)
      if (!found || found.target === on.current || card.current?.contains(found.target)) return
      // Never over a menu: one open is what is being read (lib/menu-showing.ts). Asked only with a PDF under the
      // pointer: it looks through the whole page, and a long note scrolled under a still pointer sends an "over"
      // every frame (an eighth of the time a far wheel through a 7,017-block note took).
      if (menuShowing()) return
      const box = scrubBoxOf(found.target)
      if (box) return arm(found.target, box, found)
      // A small cover: the card, after the same rest, so a sweep past never brings one up.
      if (isThumb(found.target)) {
        clearTimeout(rest.current)
        on.current = found.target
        rest.current = window.setTimeout(() => void (on.current === found.target && ((on.current = null), show(found.target, found))), GRACE)
        return
      }
      show(found.target, found)
    }
    const out = (event: PointerEvent): void => {
      if (!on.current) return
      const next = event.relatedTarget as Node | null
      // The card reaches down to the link (a clear strip between), so the pointer crosses straight onto it.
      if (next && (on.current.contains(next) || around.current?.contains(next) || card.current?.contains(next))) return
      away()
    }
    const away = (): void => {
      clearTimeout(rest.current)
      scrubbedNow = null
      on.current = null
      setPeek(null)
      setScrub(null)
    }
    // Along the link's own words the pages turn too, no need to move onto the
    // card: its left edge is the link's own page (or the cover), its right the last.
    const along = (event: PointerEvent): void => {
      track(event)
      const turning = scrubbing.current
      if (turning) {
        if (!on.current?.contains(event.target as Node)) return
        if (!turning.moved && Math.abs(event.clientX - turning.from) < SLIDE) return
        const r = turning.box.getBoundingClientRect()
        const page = Math.min(turning.count, Math.max(1, Math.floor(((event.clientX - r.left) / r.width) * turning.count) + 1))
        if (turning.moved && page === turning.page) return
        const image = drawn.get(`${turning.src}#${page}`) ?? nearestDrawn(turning.src, page, turning.count) ?? turning.image
        // Nothing says "turning" before there is a page to show (the user, 12 Nov: "dont tell me im seeking until
        // everhitng is ready"): no tick, no number, and a click still opens the book where it was left. A big book
        // takes a second or two to open the first time; until then the cover is simply the cover.
        // Each page the pointer crosses on a cover is felt, as a scrubbed number is; not the first reading of where it came in.
        if (image && (turning.moved || page !== turning.page)) stepTap(page, 1, turning.count)
        const next = { ...turning, page, image, moved: true }
        scrubbing.current = next
        scrubbedNow = image ? { src: turning.src, page } : null
        setScrub(next)
        void (page === 1 ? pdfCover(turning.src).then((cover) => cover?.image ?? null) : pageImage(turning.src, page)).then((made) =>
          setScrub((now) => {
            if (!now || now.src !== turning.src || now.page !== page) return now
            // The first page to be ready: from here the cover is turning, and a click opens at the page on show.
            if (made) scrubbedNow = { src: now.src, page }
            return { ...now, image: made }
          }))
        return
      }
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
      clearTimeout(rest.current)
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

  // The cover itself as the page: its picture and "71 / 336" on it, over the cover's own box; leaving puts the cover back.
  // Only once there is a page to show: before that nothing is put over the cover, no blank sheet and no number.
  const inPlace = scrub?.moved && scrub.image
    ? createPortal(
        <span data-pdf-scrub className={cn("pdf-scrub", paper && "is-paper")} aria-hidden>
          <img src={scrub.image} alt="" draggable={false} />
          <span data-pdf-scrub-page className="pdf-scrub-page">
            {scrub.page} / {scrub.count}
          </span>
        </span>,
        scrub.box,
      )
    : null
  if (!peek) return inPlace
  const height = Math.round(CARD * peek.ratio)
  const above = peek.top - height - 16 > 8
  // A clear strip of GAP between card and link belongs to the card, so the
  // pointer crosses from one to the other without leaving either.
  const GAP = 8
  return (
    <>
    {inPlace}
    <div
      ref={card}
      data-pdf-peek-card
      className="fixed z-[90]"
      style={{ left: Math.min(Math.max(peek.x - CARD / 2, 8), innerWidth - CARD - 8), top: above ? peek.top - height - GAP : peek.bottom, width: CARD, height: height + GAP, [above ? "paddingBottom" : "paddingTop"]: GAP }}
    >
      <div
        role="button"
        aria-label={`Open ${peek.name || "the PDF"} at page ${peek.page}`}
        // In by `mf-pop` (main.css), as a popover is: grown out of the link's side by a clip, never faded (it is frosted).
        data-state="open" data-side={above ? "top" : "bottom"}
        className={cn(FLOAT, "pdf-peek-face", paper && "is-paper !bg-[#f4ecdb]", "mf-pop relative size-full cursor-pointer overflow-hidden rounded-float")}
        // A page is paper, never frosted glass: the frost's see-through fill would show through it.
        data-frost-off={paper ? "" : undefined}
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
    </>
  )
}
