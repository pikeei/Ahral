import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '../renderer/src/App'
import { createWebApi } from './web-api'
import '../renderer/src/index.css'

// The website version: the same screens as the desktop app, with a browser backend.
window.api = createWebApi({
  fontsUrl: new URL('standard_fonts/', document.baseURI).href,
  dictionaryUrl: new URL('dictionary.txt', document.baseURI).href,
  appVersion: __APP_VERSION__
})

// Ask the browser to keep this site's storage even when the disk fills up. Browsers may
// grant this silently, ask, or decline; Ahral works either way.
void navigator.storage?.persist?.().catch(() => false)

const root = document.getElementById('root')
if (!root) throw new Error('Root element #root not found')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
)
