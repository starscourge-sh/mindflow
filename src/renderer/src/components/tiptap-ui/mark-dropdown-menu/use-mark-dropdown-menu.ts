"use client"

import { useEffect, useState } from "react"
import type { Editor } from "@tiptap/react"

// --- Hooks ---
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"

// --- Icons ---
import { CaseSensitiveIcon } from "@/components/tiptap-icons/case-sensitive-icon"

// --- Tiptap UI ---
import {
  markIcons,
  type Mark,
  canToggleMark,
  isMarkActive,
  shouldShowButton,
} from "@/components/tiptap-ui/mark-button"

/**
 * The marks shown in the dropdown when no `types` are given.
 */
export const DEFAULT_MARK_TYPES: Mark[] = [
  "bold",
  "italic",
  "strike",
  "code",
  "underline",
]

export const markLabels: Record<Mark, string> = {
  bold: "Bold",
  italic: "Italic",
  strike: "Strikethrough",
  code: "Code",
  underline: "Underline",
  superscript: "Superscript",
  subscript: "Subscript",
}

/**
 * Configuration for the mark dropdown menu functionality
 */
export interface UseMarkDropdownMenuConfig {
  /**
   * The Tiptap editor instance.
   */
  editor?: Editor | null
  /**
   * Available marks to show in the dropdown
   * @default ["bold", "italic", "strike", "code", "underline"]
   */
  types?: Mark[]
  /**
   * Whether the dropdown should hide when none of the marks are available.
   * @default false
   */
  hideWhenUnavailable?: boolean
}

/**
 * Gets the first active mark from the available types
 */
export function getActiveMarkType(
  editor: Editor | null,
  types: Mark[] = DEFAULT_MARK_TYPES
): Mark | undefined {
  if (!editor || !editor.isEditable) return undefined
  return types.find((type) => isMarkActive(editor, type))
}

/**
 * Custom hook that provides mark dropdown menu functionality for Tiptap editor
 */
export function useMarkDropdownMenu(config?: UseMarkDropdownMenuConfig) {
  const {
    editor: providedEditor,
    types = DEFAULT_MARK_TYPES,
    hideWhenUnavailable = false,
  } = config || {}

  const { editor } = useTiptapEditor(providedEditor)
  const [isVisible, setIsVisible] = useState(true)
  const [activeType, setActiveType] = useState<Mark | undefined>(undefined)

  const canToggleState = types.some((type) => canToggleMark(editor, type))

  useEffect(() => {
    if (!editor) return

    const handleUpdate = () => {
      setIsVisible(
        types.some((type) =>
          shouldShowButton({ editor, type, hideWhenUnavailable })
        )
      )
      setActiveType(getActiveMarkType(editor, types))
    }

    handleUpdate()

    editor.on("selectionUpdate", handleUpdate)
    editor.on("transaction", handleUpdate)

    return () => {
      editor.off("selectionUpdate", handleUpdate)
      editor.off("transaction", handleUpdate)
    }
  }, [editor, hideWhenUnavailable, types])

  return {
    isVisible,
    activeType,
    isActive: activeType !== undefined,
    canToggle: canToggleState,
    types,
    label: "Format text",
    Icon: activeType ? markIcons[activeType] : CaseSensitiveIcon,
  }
}
