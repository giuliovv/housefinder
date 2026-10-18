import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { runHandoff } from './lib/handoff'

// On the old address this carries the visitor's saved data to houseswipe.uk and leaves; on the new address it takes a
// handed-over payload in before the app reads its storage (see lib/handoff.ts).
if (!runHandoff()) {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
