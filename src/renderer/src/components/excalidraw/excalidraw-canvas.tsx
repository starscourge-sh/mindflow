import { memo, useRef } from 'react'
import { Excalidraw, getSceneVersion } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'

import type { DiagramScene } from '@/extensions/excalidraw'

/**
 * The drawing surface itself, kept in its own module so the 2 MB editor is
 * fetched only when a note actually holds a diagram.
 */
function ExcalidrawCanvas({
  scene,
  onChange
}: {
  scene: DiagramScene | null
  onChange: (scene: DiagramScene) => void
}): React.JSX.Element {
  // Excalidraw reports a change on mount and after every pointer move. The
  // version only moves when a shape does, so an idle canvas writes nothing.
  const version = useRef(getSceneVersion(scene?.elements ?? []))

  return (
    <Excalidraw
      // The app has no light theme; the window sits on a dark desktop.
      theme="dark"
      initialData={{
        elements: scene?.elements ?? [],
        files: scene?.files,
        // The note's own background shows through, so a drawing reads as part
        // of the page rather than a white card dropped onto it.
        appState: { viewBackgroundColor: 'transparent' },
        scrollToContent: true
      }}
      onChange={(elements, _appState, files) => {
        const next = getSceneVersion(elements)
        if (next === version.current) return
        version.current = next
        // Deleted shapes are kept only so undo can bring them back; they are
        // the editor's business, not the note's.
        onChange({ elements: elements.filter((element) => !element.isDeleted), files })
      }}
      UIOptions={{
        canvasActions: {
          // Themes, files and sharing all belong to the note, not the canvas.
          toggleTheme: false,
          loadScene: false,
          saveToActiveFile: false,
          export: false
        }
      }}
    />
  )
}

// Dragging the block's resize grip re-renders the view on every pointer move.
// Both props above are stable, so this keeps a whole editor from re-rendering
// sixty times a second alongside it.
export default memo(ExcalidrawCanvas)
