"use client"

import { useEffect, useState } from "react"
import type { Editor } from "@tiptap/react"

// --- Hooks ---
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"

// --- Tiptap UI ---
import {
  textAlignIcons,
  textAlignLabels,
  type TextAlign,
  canSetTextAlign,
  isTextAlignActive,
  shouldShowButton,
} from "@/components/tiptap-ui/text-align-button"

/**
 * The alignments shown in the dropdown when no `aligns` are given.
 */
export const DEFAULT_TEXT_ALIGNS: TextAlign[] = [
  "left",
  "center",
  "right",
  "justify",
]

/**
 * Configuration for the text align dropdown menu functionality
 */
export interface UseTextAlignDropdownMenuConfig {
  /**
   * The Tiptap editor instance.
   */
  editor?: Editor | null
  /**
   * Available alignments to show in the dropdown
   * @default ["left", "center", "right", "justify"]
   */
  aligns?: TextAlign[]
  /**
   * Whether the dropdown should hide when alignment is not available.
   * @default false
   */
  hideWhenUnavailable?: boolean
}

/**
 * Gets the currently active alignment from the available alignments
 */
export function getActiveTextAlign(
  editor: Editor | null,
  aligns: TextAlign[] = DEFAULT_TEXT_ALIGNS
): TextAlign | undefined {
  if (!editor || !editor.isEditable) return undefined
  return aligns.find((align) => isTextAlignActive(editor, align))
}

/**
 * Custom hook that provides text align dropdown menu functionality for Tiptap editor
 */
export function useTextAlignDropdownMenu(
  config?: UseTextAlignDropdownMenuConfig
) {
  const {
    editor: providedEditor,
    aligns = DEFAULT_TEXT_ALIGNS,
    hideWhenUnavailable = false,
  } = config || {}

  const { editor } = useTiptapEditor(providedEditor)
  const [isVisible, setIsVisible] = useState(true)
  const [activeAlign, setActiveAlign] = useState<TextAlign | undefined>(
    undefined
  )

  const canSetState = aligns.some((align) => canSetTextAlign(editor, align))

  useEffect(() => {
    if (!editor) return

    const handleUpdate = () => {
      setIsVisible(
        aligns.some((align) =>
          shouldShowButton({ editor, align, hideWhenUnavailable })
        )
      )
      setActiveAlign(getActiveTextAlign(editor, aligns))
    }

    handleUpdate()

    editor.on("selectionUpdate", handleUpdate)
    editor.on("transaction", handleUpdate)

    return () => {
      editor.off("selectionUpdate", handleUpdate)
      editor.off("transaction", handleUpdate)
    }
  }, [editor, hideWhenUnavailable, aligns])

  return {
    isVisible,
    activeAlign,
    isActive: activeAlign !== undefined,
    canSet: canSetState,
    aligns,
    label: "Text align",
    labels: textAlignLabels,
    Icon: textAlignIcons[activeAlign ?? "left"],
  }
}
