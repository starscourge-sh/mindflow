import { useLayoutEffect, useRef, useSyncExternalStore, type HTMLAttributes, type ReactNode } from "react"
import { createContentComponent, type Editor } from "@tiptap/react"
import { domOf } from "@/lib/editor-dom"

/** Where an editor's React blocks (a callout, a diagram) are drawn from: TipTap's own store of them. */
type Views = ReturnType<typeof createContentComponent>
type Held = Editor & { contentComponent?: Views | null; isEditorContentInitialized?: boolean }

/**
 * A note is drawn once.
 *
 * TipTap's own <EditorContent> drew every note twice to open it and once more
 * to close it: the editor builds its page as it is made, with nowhere yet for
 * its React blocks to be drawn from, so on reaching the page it was handed
 * its block kinds again and ProseMirror threw the whole page away and built
 * it a second time (7,000 blocks, twice); on leaving, it was handed no block
 * kinds at all and built it a third time, plain, to be thrown away. In a
 * development run (StrictMode leaves and comes back once) that made five.
 *
 * Here the place its React blocks are drawn from is there before the editor
 * builds anything (`holdViews`, from the editor's onBeforeCreate), so the
 * first page it builds is the one kept: on reaching the page its elements
 * are moved in as they are, and on leaving nothing is rebuilt (the editor is
 * taken down whole by useEditor).
 */
export function holdViews(editor: Editor): void {
  const held = editor as Held
  held.contentComponent ??= createContentComponent()
}

/** The editor's React blocks, each drawn into its own element inside the note. */
function Views({ views }: { views: Views }): ReactNode {
  const drawn = useSyncExternalStore(views.subscribe, views.getSnapshot, views.getServerSnapshot)
  return <>{Object.values(drawn)}</>
}

export function EditorSurface({ editor, innerRef, ...rest }: { editor: Editor | null; innerRef?: (box: HTMLDivElement | null) => void } & HTMLAttributes<HTMLDivElement>): ReactNode {
  const box = useRef<HTMLDivElement | null>(null)
  const held = editor as Held | null
  // Before the frame is painted: the note's words are on the page in the frame it opens in.
  useLayoutEffect(() => {
    const element = box.current
    const from = domOf(editor)?.parentNode
    if (!editor || !element || !from) return
    if (from !== element) {
      element.append(...from.childNodes)
      editor.setOptions({ element })
    }
    // From here a new React block (one typed, pasted or brought back) is drawn in the same breath as its place.
    ;(editor as Held).isEditorContentInitialized = true
  }, [editor])
  return (
    <>
      <div
        ref={(node) => {
          box.current = node
          innerRef?.(node)
        }}
        {...rest}
      />
      {held?.contentComponent ? <Views views={held.contentComponent} /> : null}
    </>
  )
}
