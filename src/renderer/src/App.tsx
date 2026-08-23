import { SimpleEditor } from './components/tiptap-templates/simple/simple-editor'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { Excalidraw } from "@excalidraw/excalidraw";
import { Tldraw } from 'tldraw'
import { getAssetUrlsByImport } from '@tldraw/assets/imports.vite'
import 'tldraw/tldraw.css'
const assetUrls = getAssetUrlsByImport()
import "@excalidraw/excalidraw/index.css";

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
