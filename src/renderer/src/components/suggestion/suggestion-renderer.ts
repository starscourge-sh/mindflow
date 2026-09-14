import type {
  ForwardRefExoticComponent,
  PropsWithoutRef,
  RefAttributes,
} from "react"
import { ReactRenderer } from "@tiptap/react"
import type { PluginKey } from "@tiptap/pm/state"
import {
  SuggestionPluginKey,
  exitSuggestion,
  type SuggestionKeyDownProps,
  type SuggestionOptions,
  type SuggestionProps,
} from "@tiptap/suggestion"

/** What a suggestion list hands back to the plugin. */
export interface SuggestionListHandle {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean
}

type SuggestionList<I> = ForwardRefExoticComponent<
  PropsWithoutRef<SuggestionProps<I>> & RefAttributes<SuggestionListHandle>
>

/**
 * The popup half of a suggestion menu, shared by `/` and `:`.
 *
 * The plugin mounts the element and keeps it anchored to the caret, so all
 * this has to do is render the list and forward keys. Escape is the exception:
 * vim mode claims it before the plugin is offered it, so a capture listener
 * has to get there first and stop it going any further - otherwise one Escape
 * closes the popup *and* drops you into normal mode, leaving the trigger
 * character behind in the document.
 */
export function createSuggestionRenderer<I>(
  List: SuggestionList<I>,
  pluginKey: PluginKey = SuggestionPluginKey
): NonNullable<SuggestionOptions<I>["render"]> {
  return () => {
    let renderer: ReactRenderer<SuggestionListHandle> | null = null
    let unmount: (() => void) | null = null

    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !renderer) return
      // Only ours while the editor still holds focus: a popup that has handed
      // focus to its own input handles its own Escape. When nothing matched the
      // list draws nothing, but the plugin is still running the query behind it
      // and still has to be told to stand down.
      if (!renderer.editor.view.hasFocus()) return
      event.preventDefault()
      event.stopPropagation()
      // Tells the plugin to stand down, so it stops matching the query behind
      // the popup; that in turn fires `onExit` and tears this down.
      exitSuggestion(renderer.editor.view, pluginKey)
    }

    return {
      onStart: (props) => {
        renderer = new ReactRenderer(List, {
          props,
          editor: props.editor,
          className: "tiptap-suggestion-popup",
        })
        unmount = props.mount(renderer.element)
        window.addEventListener("keydown", onEscape, true)
      },
      onUpdate: (props) => renderer?.updateProps(props),
      onKeyDown: (props) => renderer?.ref?.onKeyDown(props) ?? false,
      onExit: () => {
        window.removeEventListener("keydown", onEscape, true)
        unmount?.()
        renderer?.destroy()
        unmount = null
        renderer = null
      },
    }
  }
}
