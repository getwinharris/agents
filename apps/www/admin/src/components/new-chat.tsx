import { useNavigate } from '@tanstack/react-router'
import { ChevronDown, GitBranch, Plus, Sparkles } from 'lucide-react'
import { Composer } from '@/components/chat/composer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { parseAgentUrl } from '@/lib/bapX-client'
import { operatingSurface } from '@/lib/operating-surface.mjs'
import { useConversations } from '@/state/conversations'
import { useSettings } from '@/state/settings'

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

  const suggestions = [
    'Set up project environment',
    'Investigate failing signup and auth routes',
    'Create Razorpay billing issue with acceptance checks',
    'Review PRs and propose merge blockers',
    'Map missing docs and ecosystem pages',
  ]

  return (
    <div className="relative flex h-svh flex-1 flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-14 h-72 bg-[radial-gradient(circle_at_65%_10%,rgba(20,184,166,0.32),transparent_42%),radial-gradient(circle_at_25%_30%,rgba(124,58,237,0.16),transparent_36%)]" />
      <header className="relative z-10 flex h-14 shrink-0 items-center px-3">
        <SidebarTrigger />
        <div className="ml-3 flex items-center gap-2 text-sm text-muted-foreground">
          <span>Dashboard</span>
          <span>/</span>
          <span className="text-foreground">bapX agent</span>
        </div>
      </header>
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-4">
        <div className="w-full max-w-3xl">
          <div className="mx-auto mb-5 flex items-baseline justify-center gap-2">
            <img className="h-9 w-auto" src="/brand/bapx-logo-main.svg" alt="bapX" />
            <span className="font-serif text-2xl italic tracking-tight text-foreground/90">{operatingSurface.label}</span>
          </div>
          <div className="text-center">
            <Badge variant="outline" className="mb-3 gap-1">
              <Sparkles className="size-3" />
              Human + agent coordination cockpit
            </Badge>
            <h2 className="mb-1 text-3xl font-semibold tracking-tight">Ask the bapX agent</h2>
          </div>
          {agentName ? (
            <p className="mb-5 text-center text-sm text-muted-foreground">
              The central agent coordinates specialists, tools, browser/search, PRs, automations, and project context through{' '}
              <span className="font-mono font-medium text-foreground">{agentName}</span>.
            </p>
          ) : (
            <p className="mb-5 text-center text-sm text-muted-foreground">
              The main bapX agent is not connected yet. Open settings and select its agent URL.
            </p>
          )}
          <div className="overflow-hidden rounded-xl border bg-background/90 shadow-2xl shadow-black/30">
            <Composer
              onSend={start}
              autoFocus
              disabled={!agentName}
              placeholder={
                agentName
                  ? 'Describe the work for the bapX agent…'
                  : 'Connect the main bapX agent in settings first…'
              }
            />
            <div className="flex flex-wrap items-center gap-2 border-t bg-muted/50 px-3 py-2 text-xs">
              <Button variant="ghost" size="sm" className="h-7 gap-1 px-2">
                <Plus className="size-3.5" />
                Attach
              </Button>
              <Button variant="ghost" size="sm" className="h-7 gap-1 px-2">
                bapX agent
                <ChevronDown className="size-3.5" />
              </Button>
              <Button variant="ghost" size="sm" className="h-7 gap-1 px-2">
                Specialists
                <ChevronDown className="size-3.5" />
              </Button>
              <span className="ml-auto flex items-center gap-1 text-muted-foreground">
                <GitBranch className="size-3.5" />
                main
              </span>
              <span className="hidden max-w-[14rem] truncate font-mono text-muted-foreground sm:inline">{baseUrl}</span>
            </div>
          </div>
          <div className="mx-auto mt-6 grid max-w-3xl divide-y rounded-lg border bg-background/75">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="flex items-center gap-3 px-4 py-3 text-left text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground"
                onClick={() => agentName && start(suggestion)}
                disabled={!agentName}
              >
                <span className="size-1.5 rounded-full bg-primary" />
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
