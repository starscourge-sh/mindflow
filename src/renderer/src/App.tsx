import type { CSSProperties } from 'react'
import { MindflowEditor } from './components/mindflow/mindflow-editor'
import sampleContent from './components/mindflow/data/content.json'
import { ResizablePanelGroup } from "@/components/ui/resizable"
import { TitleEditor } from './components/title/title-editor'

export default function App() {
  return (
    <div className='relative flex flex-col h-full w-full'>
      <div className="w-full backdrop-blur-3xl fixed z-0 top-0 left-0 right-0 text-muted-foreground text-xs flex justify-between items-center gap-2 py-2 px-4"
        style={{ WebkitAppRegion: 'drag' } as CSSProperties} >
        {
          /**
           <>
           <span className="flex-1 flex">
           </span>
           <span className="flex-1 flex justify-center">
           Site of Grace
           </span>
           <div className="flex-1 flex justify-end" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties} >
           </div>
           </>
          **/
        }
      </div>

      {/* The title stacks above the body and shares its column: the editor
          centres at 648px inside 4.75rem of padding, so these line up. */}
      <div className="w-full max-w-[648px] mx-auto px-[4.75rem] pt-12 pb-4 shrink-0">
        <TitleEditor placeholder="Untitled" />
      </div>

      <ResizablePanelGroup orientation="horizontal" className="h-full w-full min-h-0">
        {/* The sample is passed in rather than defaulted to. The editor starts
            empty now, so a note that has not loaded yet cannot be written over
            by the first keystroke. */}
        <MindflowEditor defaultContent={sampleContent} />
      </ResizablePanelGroup>
    </div>
  )
}
