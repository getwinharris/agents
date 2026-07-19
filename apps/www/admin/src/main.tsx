import { BapxProvider } from '@bapX/react'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { router } from './router'
import { ConversationsProvider } from './state/conversations'
import { PreferencesProvider } from './state/preferences'
import { SettingsProvider, useSettings } from './state/settings'

// The shadcn chat components are styled by the Luma `cn-*` classes, which are
// scoped under `.style-luma`. Apply it once at the document root.
document.documentElement.classList.add('style-luma')

function BapxClientBridge({ children }: { children: ReactNode }) {
  const { client } = useSettings()
  return <BapxProvider client={client}>{children}</BapxProvider>
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SettingsProvider>
      <BapxClientBridge>
        <ConversationsProvider>
          <PreferencesProvider>
            <RouterProvider router={router} />
          </PreferencesProvider>
        </ConversationsProvider>
      </BapxClientBridge>
    </SettingsProvider>
  </StrictMode>,
)
