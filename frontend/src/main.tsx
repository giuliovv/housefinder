import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { runHandoff } from './lib/handoff'

// Design experiments are lazy-loaded so they add nothing to the real app.
const Lab = lazy(() => import('./lab/Lab'))
const labPath = /^\/ui(?:\d*|\/codex(?:\/[a-z-]+)?)\/?$/.test(window.location.pathname) ? window.location.pathname : null

// On the old address this carries the visitor's saved data to houseswipe.uk and leaves; on the new address it takes a
// handed-over payload in before the app reads its storage (see lib/handoff.ts).
if (!runHandoff()) {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      {labPath ? (
        <Suspense fallback={null}>
          <Lab path={labPath} />
        </Suspense>
      ) : (
        <App />
      )}
    </StrictMode>,
  )
}
