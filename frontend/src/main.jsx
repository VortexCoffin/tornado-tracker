import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { inject } from '@vercel/analytics'
import './index.css'
import App from './App.jsx'

// Web Analytics (main entry — resolves reliably with Vite/Rolldown)
inject()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Clear any old service worker left from earlier builds (sw.js is not shipped)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations?.().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister().catch(() => {})
    }
  }).catch(() => {})
}
