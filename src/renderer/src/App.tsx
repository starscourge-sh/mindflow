import { SimpleEditor } from './components/tiptap-templates/simple/simple-editor'
import { ResizablePanelGroup } from "@/components/ui/resizable"
// import {
//   ResizableHandle,
//   ResizablePanel,
//   ResizablePanelGroup,
// } from "@/components/ui/resizable"
// import { Excalidraw } from "@excalidraw/excalidraw";
// import { Tldraw } from 'tldraw'
// import { getAssetUrlsByImport } from '@tldraw/assets/imports.vite'
import 'tldraw/tldraw.css'
// const assetUrls = getAssetUrlsByImport()
// Excalidraw 0.17 bundles its own styles; the separate index.css only
// exists from 0.18 onwards. Re-add it if i bring back component comes back.
// import TiptapEditor from "./components/tiptap/tiptap";
// import Tiptap from '@/components/tiptap/Tiptap.tsx'

//
// type CaptureKind = 'note' | 'excerpt' | 'quote' | 'question' | 'decision' | 'bit'
//
// interface Capture {
//   id: string
//   body: string
//   kind: CaptureKind
//   sourceId: string | null
//   capturedAt: string
// }
//
// interface Nugget {
//   id: string
//   body: string
//   kind: CaptureKind
//   originCaptureId: string | null
//   sourceId: string | null
//   private: boolean
//   lastVisitedAt: string
//   createdAt: string
//   surfacingWeight: number
//   context: string
// }

export default function App() {
  return (
    <div className='relative flex flex-col h-full w-full'>
      <div className="w-full backdrop-blur-3xl fixed z-10 top-0 left-0 right-0 border-1 text-muted-foreground text-xs flex justify-between items-center gap-2 py-2 px-4" style={{ WebkitAppRegion: 'drag' }} >
        <span className="flex-1 flex">
        </span>
        <span className="flex-1 flex justify-center">
          Site of Grace
        </span>
        <div className="flex-1 flex justify-end" style={{ WebkitAppRegion: 'no-drag' }} >
        </div>
      </div>
      <ResizablePanelGroup orientation="horizontal" className="h-full w-full">
        <SimpleEditor />
      </ResizablePanelGroup>
    </div>
  )
}











{
  /**

export default function App() {
  return (
    <div className='relative flex flex-col h-full w-full'>
      <div className="h-[40px] bg-black-900 border-b w-full">
      </div>
      <ResizablePanelGroup orientation="horizontal" className="h-full w-full">
        <ResizablePanel defaultSize="50%" minSize="50%">
          <SimpleEditor />
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize="50%">
          <Tldraw assetUrls={assetUrls} />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
**/
}
