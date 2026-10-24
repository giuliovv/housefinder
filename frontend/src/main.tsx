import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import BoardApp from './BoardApp.tsx'
import PrivacyPage from './PrivacyPage.tsx'
import { runHandoff } from './lib/handoff'

// Design experiments are lazy-loaded so they add nothing to the real app.
const Lab = lazy(() => import('./lab/Lab'))
const Demo = lazy(() => import('./demo/DemoApp'))
const labPath = /^\/ui(?:\d*|\/codex(?:\/[a-z0-9-]+)?)\/?$/.test(window.location.pathname) ? window.location.pathname : null
const privacyPath = /^\/privacy\/?$/.test(window.location.pathname)
const demoPath = /^\/demo\/?$/.test(window.location.pathname)

// On the old address this carries the visitor's saved data to houseswipe.uk and leaves; on the new address it takes a
// handed-over payload in before the app reads its storage (see lib/handoff.ts).
if (!runHandoff()) {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      {demoPath ? (
        <Suspense fallback={null}>
          <Demo />
        </Suspense>
      ) : privacyPath ? (
        <PrivacyPage />
      ) : labPath ? (
        <Suspense fallback={null}>
          <Lab path={labPath} />
        </Suspense>
      ) : (
        <BoardApp />
      )}
    </StrictMode>,
  )
}
