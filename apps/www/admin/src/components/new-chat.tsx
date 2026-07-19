import { useNavigate } from '@tanstack/react-router'
import { Composer } from '@/components/chat/composer'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { parseAgentUrl } from '@/lib/bapX-client'
import { useConversations } from '@/state/conversations'
import { useSettings } from '@/state/settings'
import { ModelSelector } from './model-selector'
import { WorkspacePanel } from './workspace-panel'

export function NewChat() {
  const navigate = useNavigate()
  const conversations = useConversations()
  const { connection, agentName } = useSettings()
  const { baseUrl } = parseAgentUrl(connection.agentUrl)

  const start = (message: string) => {
    const conversation = conversations.create(agentName)
    conversations.setPending(conversation.id, message)
    void navigate({ to: '/c/$chatId', params: { chatId: conversation.id } })
  }

  return (
    <div className="flex h-svh min-h-0 flex-1 overflow-hidden">
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b px-3">
          <SidebarTrigger />
          <ModelSelector />
        </header>
        <div className="flex flex-1 flex-col items-center justify-center px-4">
          <div className="w-full max-w-2xl text-center">
            <img className="mx-auto mb-5 h-9 w-auto" src="/brand/bapx-logo-main.svg" alt="bapX" />
            <h2 className="mb-1 text-2xl font-semibold">What should bapX work on?</h2>
            {agentName ? (
              <p className="mb-8 text-sm text-muted-foreground">
                Talking to{' '}
                <span className="font-mono font-medium text-foreground">{agentName}</span> at{' '}
                <span className="font-mono">{baseUrl}</span>
              </p>
            ) : (
              <p className="mb-8 text-sm text-muted-foreground">
                The main bapX agent is not connected yet. Open settings and select its agent URL.
              </p>
            )}
            <Composer
              onSend={start}
              autoFocus
              disabled={!agentName}
              placeholder={
                agentName
                  ? 'Describe the work for the main agent…'
                  : 'Connect the main bapX agent in settings first…'
              }
            />
          </div>
        </div>
      </section>
      <WorkspacePanel />
    </div>
  )
}
