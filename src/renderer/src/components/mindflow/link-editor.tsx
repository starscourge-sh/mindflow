import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { posToDOMRect } from "@tiptap/core"
import { useEditorState, type Editor } from "@tiptap/react"

import { Button } from "@/components/tiptap-ui-primitive/button"
import { Pencil, Unlink } from "@/components/ui/icons"
import { hrefFor, linkAround, looksLikeAddress, refusedLinks } from "@/extensions/link-tidy"
import { chime } from "@/lib/sound"

/** Ask the editor's link box to open on the link at the caret. */
/** The link card's quieter buttons: a faint resting fill, so they read as buttons. */
const QUIET = "inline-flex min-h-7 items-center rounded-md bg-foreground/[0.06] px-2.5 text-control transition-[background-color,scale] hover:bg-accent active:scale-[0.97]"
const askToEdit = (editor: Editor): void => void editor.view.dom.dispatchEvent(new CustomEvent("mf:edit-link", { bubbles: true }))

/** Take the link off the words at the caret, keeping the words. One undo step. */
export function removeLink(editor: Editor): void {
  const link = linkAround(editor.state)
  if (!link) return
  chime("fold")
  editor.chain().focus().setTextSelection(link).unsetMark("link").setTextSelection(link.to).setMeta(refusedLinks, { from: link.from, to: link.to }).run()
}

/**
 * On a web link, the selection bar's two ways out: "Edit link" (⌘K) and
 * "Remove link". A word linked by mistake is never stuck that way.
 */
export function LinkButtons({ editor }: { editor: Editor }): React.JSX.Element | null {
  // A string, so this settles instead of drawing again on every key.
  const href = useEditorState({ editor, selector: ({ editor: instance }) => (instance && linkAround(instance.state) ? String(instance.getAttributes("link").href ?? "") : "") })
  if (!href) return null
  return (
    <>
      <Button type="button" variant="ghost" aria-label="Edit link" data-edit-link tooltip="Edit link" shortcutKeys="mod+k" onMouseDown={(event) => event.preventDefault()} onClick={() => askToEdit(editor)}>
        <Pencil className="tiptap-button-icon" />
      </Button>
      <Button type="button" variant="ghost" aria-label="Remove link" data-remove-link tooltip="Remove link" onMouseDown={(event) => event.preventDefault()} onClick={() => removeLink(editor)}>
        <Unlink className="tiptap-button-icon" />
      </Button>
    </>
  )
}

/**
 * The box a link is edited in, under its words: the address, ready to change.
 * Return keeps it, an empty box or "Remove link" takes the link off, Escape
 * leaves it as it was. Opened by ⌘K on a link or the bar's "Edit link".
 */
export function LinkEditor({ editor }: { editor: Editor | null }): React.JSX.Element | null {
  const [open, setOpen] = useState<{ from: number; to: number; href: string; left: number; top: number } | null>(null)
  const [value, setValue] = useState("")
  const [wrong, setWrong] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!editor) return
    const dom = editor.view.dom
    const show = (): void => {
      const link = linkAround(editor.state)
      if (!link) return
      const box = posToDOMRect(editor.view, link.from, link.to)
      const href = String(link.mark.attrs.href ?? "")
      chime("open")
      setValue(href)
      setWrong(false)
      setOpen({ from: link.from, to: link.to, href, left: Math.max(8, Math.min(box.left, window.innerWidth - 8 - 352)), top: box.bottom + 112 > window.innerHeight ? box.top - 6 - 96 : box.bottom + 6 })
    }
    dom.addEventListener("mf:edit-link", show)
    return () => dom.removeEventListener("mf:edit-link", show)
  }, [editor])
  useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(() => (input.current?.focus(), input.current?.select()))
    // A click anywhere else leaves the link as it was.
    const away = (event: MouseEvent): void => void (!(event.target as Element | null)?.closest?.("[data-link-editor]") && setOpen(null))
    window.addEventListener("mousedown", away, true)
    return () => (cancelAnimationFrame(id), window.removeEventListener("mousedown", away, true))
  }, [open])
  // Kept inside the window, by its real width: a big interface size makes it wider.
  useLayoutEffect(() => {
    const box = document.querySelector<HTMLElement>("[data-link-editor]")
    if (!open || !box) return
    const left = Math.max(8, Math.min(open.left, window.innerWidth - box.offsetWidth - 8))
    if (left !== open.left) setOpen({ ...open, left })
  }, [open])
  if (!editor || !open) return null
  const close = (): void => {
    setOpen(null)
    editor.commands.focus()
  }
  const keep = (): void => {
    const words = value.trim()
    if (!words) return void (removeLink(editor), setOpen(null))
    if (!looksLikeAddress(words) && !/^[a-z][a-z0-9+.-]*:/i.test(words)) return void (chime("nope"), setWrong(true))
    chime("settled")
    editor.chain().focus().setTextSelection(open).extendMarkRange("link").setLink({ href: hrefFor(words) }).setTextSelection(open.to).run()
    setOpen(null)
  }
  return createPortal(
    <div
      data-link-editor
      role="dialog"
      aria-label="Edit link"
      className="fixed z-[70] flex w-[22rem] max-w-[calc(100vw-1rem)] flex-col gap-2 rounded-lg border bg-popover p-2 shadow-(--mf-panel-shadow)"
      style={{ left: open.left, top: open.top }}
    >
      <input
        ref={input}
        value={value}
        aria-label="Web address"
        placeholder="A web address, like vigil.app"
        className="h-8 w-full rounded-md bg-foreground/[0.05] px-2.5 text-control text-foreground outline-none ring-1 ring-border focus:ring-[var(--tt-brand-color-400,var(--primary))]"
        onChange={(event) => (setValue(event.target.value), setWrong(false))}
        onKeyDown={(event) => {
          if (event.key === "Enter") (event.preventDefault(), keep())
          else if (event.key === "Escape") (event.preventDefault(), event.stopPropagation(), close())
        }}
      />
      {wrong && <p className="px-0.5 text-control text-foreground">That is not a web address. Try one like vigil.app.</p>}
      {/* A Mac sheet's row: the way to undo the link at the start, then Cancel and
          the one filled button, Save, at the end. Each has a resting fill, so none reads as plain words. */}
      <div className="flex items-center gap-1.5">
        <button type="button" data-link-remove className={`${QUIET} text-foreground`} onClick={() => (removeLink(editor), setOpen(null))}>
          Remove link
        </button>
        <span className="flex-1" />
        <button type="button" className={`${QUIET} text-muted-foreground hover:text-foreground`} onClick={close}>
          Cancel <kbd className="ml-1 text-meta">esc</kbd>
        </button>
        <button type="button" data-link-keep className="inline-flex min-h-7 items-center rounded-md bg-primary px-2.5 text-control font-medium text-primary-foreground transition-[background-color,scale] hover:bg-primary/90 active:scale-[0.97]" onClick={keep}>
          Save <kbd className="ml-1 text-meta opacity-80">↵</kbd>
        </button>
      </div>
    </div>,
    document.body,
  )
}
