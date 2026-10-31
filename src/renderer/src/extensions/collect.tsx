import { Extension, type Editor } from "@tiptap/core"
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"
import { useEffect, useSyncExternalStore } from "react"
import { createPortal } from "react-dom"

import { cue } from "@/lib/cues"
import { host } from "@/lib/host"
import { FLOAT } from "@/lib/float"

/**
 * Collect what you copy (Mote's way): while it is on, everything copied
 * anywhere on the Mac lands in the note at its caret, each copy in its own
 * quote with where it came from under it. The main process watches the
 * clipboard (main/collect.ts) and passes over anything a password manager
 * marked as secret.
 */

/** A copy as the main process hands it over. */
interface Copied {
  text: string
  html: string
  image: { mime: string; bytes: Uint8Array } | null
  app: string | null
  url: string | null
  title: string | null
}

type Api = { collect?: { start: () => Promise<boolean>; stop: () => Promise<void> } }
const api = (): Api => (window as unknown as { api?: Api }).api ?? {}

const views = new Set<EditorView>()
let last: EditorView | null = null

/** Which note is collecting, and how many copies it has taken. */
let state: { view: EditorView; count: number } | null = null
const listeners = new Set<() => void>()
const tell = (): void => listeners.forEach((one) => one())
const subscribe = (listener: () => void): (() => void) => (listeners.add(listener), () => void listeners.delete(listener))

/** The note in front: the editor last typed in, or the newest one open. */
const front = (): EditorView | null => (last && views.has(last) ? last : ([...views].at(-1) ?? null))

export const isCollecting = (): boolean => !!state

/** Start collecting into the note in front. False when there is no note to collect into. */
export function startCollect(): boolean {
  const view = front()
  if (!view || !view.editable || !api().collect) return false
  state = { view, count: 0 }
  void api().collect!.start()
  cue("collect-start")
  tell()
  return true
}

export function stopCollect(): void {
  if (!state) return
  state = null
  void api().collect?.stop()
  cue("collect-stop")
  tell()
}

/** Put one copy in the note at its caret: a quote of its words or its picture, and where it came from. */
async function land(copied: Copied): Promise<void> {
  if (!state) return
  const { view } = state
  if (!views.has(view)) return stopCollect()
  const { schema } = view.state
  const inside: ReturnType<typeof schema.node>[] = []
  if (copied.image) {
    const src = await host().saveImage?.(copied.image.mime, copied.image.bytes)
    if (src && schema.nodes.image) inside.push(schema.nodes.image.create({ src }))
  }
  if (!inside.length)
    for (const line of copied.text.replace(/\r\n?/g, "\n").split(/\n{2,}/)) {
      const words = line.trim()
      if (words) inside.push(schema.nodes.paragraph.create(null, schema.text(words)))
    }
  if (!inside.length || !state) return
  // Where it came from, under it: "From Safari · The page's title", the link kept on the title.
  const site = copied.url ? copied.title || new URL(copied.url).hostname.replace(/^www\./, "") : null
  if (copied.app || site) {
    const parts = [schema.text(`From ${[copied.app, site && ""].filter((one) => one !== null).join(" · ")}`)]
    if (site) parts.push(schema.text(site, schema.marks.link ? [schema.marks.link.create({ href: copied.url })] : []))
    inside.push(schema.nodes.paragraph.create(null, parts))
  }
  const block = schema.nodes.blockquote ? schema.nodes.blockquote.create(null, inside) : inside
  const { tr } = view.state
  // After the block the caret is in, so a copy never splits a line in two; the caret moves past it for the next.
  const $at = tr.selection.$to
  const after = $at.depth ? $at.after(1) : $at.pos
  tr.insert(after, block)
  const end = after + (Array.isArray(block) ? block.reduce((sum, one) => sum + one.nodeSize, 0) : block.nodeSize)
  tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(end, tr.doc.content.size))))
  tr.scrollIntoView()
  view.dispatch(tr)
  state = { view, count: state.count + 1 }
  cue("collect-item")
  pulse()
  tell()
}

/** The window's edge lights for a moment, so a copy arriving is seen from the corner of the eye. */
function pulse(): void {
  const glow = document.createElement("div")
  glow.className = "mf-glow mf-glow-collect"
  glow.setAttribute("aria-hidden", "true")
  glow.addEventListener("animationend", () => glow.remove(), { once: true })
  document.body.append(glow)
}

window.addEventListener("haligtree:collect-item", (event) => void land((event as CustomEvent<Copied>).detail))
window.addEventListener("haligtree:collect-state", (event) => {
  if (!(event as CustomEvent<boolean>).detail && state) (state = null), tell()
})

export const Collect = Extension.create({
  name: "collect",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("collect"),
        view: (view) => {
          views.add(view)
          return {
            destroy: () => {
              views.delete(view)
              if (last === view) last = null
              if (state?.view === view) stopCollect()
            },
          }
        },
        props: {
          handleDOMEvents: {
            focus: (view) => void (last = view),
          },
        },
      }),
    ]
  },
})

/** The quiet "Collecting" pill: how many copies came in, and Stop. Esc stops it too. */
export function CollectPill({ editor }: { editor: Editor | null }): React.JSX.Element | null {
  const now = useSyncExternalStore(subscribe, () => state)
  const mine = !!now && !!editor && now.view === editor.view
  useEffect(() => {
    if (!mine) return
    const onKey = (event: KeyboardEvent): void => {
      // A menu or a dialog open is the nearer layer: Esc closes that first.
      if (event.key !== "Escape" || event.defaultPrevented) return
      if (document.querySelector('[role="menu"], [role="dialog"], [role="listbox"]')) return
      event.preventDefault()
      event.stopPropagation()
      stopCollect()
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [mine])
  if (!mine || !now) return null
  return createPortal(
    <div data-collecting="" role="status" className={`fixed bottom-24 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full py-1.5 pr-1.5 pl-4 text-[13px] ${FLOAT}`}>
      <span aria-hidden className="size-2 rounded-full bg-primary motion-safe:animate-pulse" />
      <span>
        Collecting what you copy{now.count ? <span className="text-muted-foreground"> · {now.count} so far</span> : null}
      </span>
      <button type="button" className="cursor-pointer rounded-full bg-foreground/[0.06] px-3 py-1 font-medium transition-transform hover:bg-foreground/10 active:scale-[0.97]" onMouseDown={(event) => event.preventDefault()} onClick={stopCollect}>
        Stop
      </button>
    </div>,
    document.body
  )
}
