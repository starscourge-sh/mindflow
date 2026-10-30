// QA only: the app built with React's development build, so StrictMode runs every effect twice as in `npm run dev`.
import config from './electron.vite.config'
const c = config as any
c.renderer.define = { ...(c.renderer.define ?? {}), 'process.env.NODE_ENV': '"development"' }
c.renderer.build.minify = false
export default c
