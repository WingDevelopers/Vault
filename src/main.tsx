import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './styles.css'
import { ensureSettings, runRecurring, seedCategoriesIfNeeded } from './db/repo'
import { requestPersistence } from './db/db'
import { refreshRate } from './rates'

// Offline support: the service worker caches the whole app after the first visit.
registerSW({ immediate: true })

async function boot() {
  await ensureSettings()
  await seedCategoriesIfNeeded()
  await runRecurring()
  requestPersistence()
  refreshRate() // keeps ₡/$ current; runs in the background, silently skips when offline
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

boot().catch((e) => {
  document.getElementById('root')!.innerHTML =
    `<div style="padding:40px 24px;color:#F4F7FC;font-family:-apple-system,system-ui">
      <h2>Couldn't open local storage</h2>
      <p style="color:#8A9BB3">Private Browsing blocks the database this app needs. Open it in a normal Safari tab or from your Home Screen.</p>
      <pre style="color:#8A9BB3;white-space:pre-wrap">${String(e?.message ?? e)}</pre></div>`
})
