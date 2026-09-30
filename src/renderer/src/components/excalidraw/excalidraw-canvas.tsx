import { memo, useRef } from 'react'
import { Excalidraw, MainMenu, getSceneVersion } from '@excalidraw/excalidraw'
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
        appState: {
          // The note's own background shows through, so a drawing reads as
          // part of the page rather than a white card dropped onto it.
          viewBackgroundColor: 'transparent',
          // Both on by default. A diagram in a note is boxes and arrows, and
          // lining them up by eye in a block a few hundred pixels tall is most
          // of the work: the grid gives them somewhere to land, and snapping
          // lines them up with each other rather than with the grid. Toggled
          // per drawing from the canvas menu, as before.
          gridModeEnabled: true,
          objectsSnapModeEnabled: true
        },
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
    >
      {/* Our own menu, because the default one has no way to drop an item. It
          is the default list minus three: the links and Help answer "how do I
          use Excalidraw" rather than anything a note is asking, and clearing
          the canvas is select-all and backspace. */}
      <MainMenu>
        <MainMenu.DefaultItems.SearchMenu />
        <MainMenu.DefaultItems.SaveAsImage />
        <MainMenu.DefaultItems.ChangeCanvasBackground />
      </MainMenu>
    </Excalidraw>
  )
}

// Dragging the block's resize grip re-renders the view on every pointer move.
// Both props above are stable, so this keeps a whole editor from re-rendering
// sixty times a second alongside it.
export default memo(ExcalidrawCanvas)
