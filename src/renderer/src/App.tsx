import Versions from './components/Versions'
import electronLogo from './assets/electron.svg'

function App(): React.JSX.Element {
  const ipcHandle = (): void => window.electron.ipcRenderer.send('ping')

  return (
    <div style={{
      display: 'flex',
    }}>
      <div style={{background:'#111', height: '100%'}}>
      v
      </div>


      <div style={{background:'#111', height: '100%'}}>
      a
      </div>

    </div>
  )
}

export default App
