import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/react'

/**
 * The editor's words on the page, once it is there. An editor is made before
 * its page is drawn (and is taken off it as a day is left), and in between
 * tiptap's `view.dom` throws; `'dom' in view` asks without the throw.
 */
export const domOf = (editor: Editor | null | undefined): HTMLElement | null =>
  editor && !editor.isDestroyed && 'dom' in editor.view ? (editor.view.dom as HTMLElement) : null

/** `domOf` as a hook: null until the editor is on the page, then its words, again on every mount and unmount. */
export function useEditorDom(editor: Editor | null): HTMLElement | null {
  const [dom, setDom] = useState(() => domOf(editor))
  useEffect(() => {
    const read = (): void => setDom(domOf(editor))
    read()
    if (!editor) return
    editor.on('mount', read)
    editor.on('unmount', read)
    editor.on('destroy', read)
    return () => void (editor.off('mount', read), editor.off('unmount', read), editor.off('destroy', read))
  }, [editor])
  return dom
}
