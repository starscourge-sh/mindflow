import type {
  ForwardRefExoticComponent,
  PropsWithoutRef,
  RefAttributes,
} from "react"
import { ReactRenderer } from "@tiptap/react"
import { chime, click } from "@/lib/sound"
import { listDirection } from "@/lib/menu-keys"
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
    let caret: (() => DOMRect | null) | null | undefined = null

    // The line it was opened on scrolled out of sight: the menu goes, as Notion's does, rather than
    // hang on at the box's edge pointing at nothing. Typing there again brings it back. Scrolling the
    // menu's own list, or the page while its line is still in view, keeps it: a menu taller than a
    // short box (the Journal's) always reaches past that box's edge, so that was never a reason to go.
    const onScroll = (event: Event) => {
      if (!renderer) return
      if (event.target instanceof Node && renderer.element.contains(event.target)) return
      let clip: HTMLElement | null = renderer.editor.view.dom.parentElement
      while (clip && !/(auto|scroll)/.test(getComputedStyle(clip).overflowY)) clip = clip.parentElement
      // What of the scroller is on screen: a scroller can itself ride off with the page.
      const box = clip?.getBoundingClientRect()
      const top = Math.max(0, box?.top ?? 0)
      const bottom = Math.min(window.innerHeight, box?.bottom ?? window.innerHeight)
      const rect = caret?.()
      if (!rect || (rect.bottom > top && rect.top < bottom)) return
      exitSuggestion(renderer.editor.view, pluginKey)
    }

    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !renderer) return
      // Only ours while the editor still holds focus: a popup that has handed
      // focus to its own input handles its own Escape. When nothing matched the
      // list draws nothing, but the plugin is still running the query behind it
      // and still has to be told to stand down.
      if (!renderer.editor.view.hasFocus()) return
      event.preventDefault()
      event.stopPropagation()

      // A lone `/` or `@` goes with it: backing out of a menu should not leave
      // the character to delete by hand. Anything typed after it stays, since
      // "#proj" or "@hey" is your words and Escape only closes the menu.
      const { editor } = renderer
      const { view } = editor
      const state = pluginKey.getState(view.state)
      if (state?.range && !state.query) editor.chain().focus().deleteRange(state.range).run()

      // Tells the plugin to stand down, so it stops matching the query behind
      // the popup; that in turn fires `onExit` and tears this down.
      exitSuggestion(view, pluginKey)
    }

    return {
      onStart: (props) => {
        renderer = new ReactRenderer(List, {
          props,
          editor: props.editor,
          className: "tiptap-suggestion-popup",
        })
        unmount = props.mount(renderer.element)
        caret = props.clientRect
        window.addEventListener("keydown", onEscape, true)
        window.addEventListener("scroll", onScroll, true)
        chime("open")
      },
      onUpdate: (props) => ((caret = props.clientRect), renderer?.updateProps(props)),
      // Moving through the menu ticks; choosing lands with the pickers' chord.
      onKeyDown: (props) => {
        const handled = renderer?.ref?.onKeyDown(props) ?? false
        if (handled) {
          const key = props.event.key
          if (key === "Enter" || key === "Tab") chime("settled")
          else if (listDirection(props.event)) click("soft")
        }
        return handled
      },
      onExit: () => {
        window.removeEventListener("keydown", onEscape, true)
        window.removeEventListener("scroll", onScroll, true)
        unmount?.()
        renderer?.destroy()
        unmount = null
        renderer = null
      },
    }
  }
}
