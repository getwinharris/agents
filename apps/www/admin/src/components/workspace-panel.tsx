import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Globe2,
  RefreshCw,
  Search,
  ShieldCheck,
  TerminalSquare,
} from 'lucide-react'
import { type FormEvent, type PointerEvent, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type WorkspaceTab = 'browser' | 'terminal' | 'review'

const tabs: Array<{ id: WorkspaceTab; label: string }> = [
  { id: 'browser', label: 'Browser' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'review', label: 'Review' },
]

function normalizeUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return 'https://bapx.in'
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

function BrowserSurface() {
  const [url, setUrl] = useState('https://bapx.in')
  const [draft, setDraft] = useState(url)
  const [frameKey, setFrameKey] = useState(0)

  const navigate = (event: FormEvent) => {
    event.preventDefault()
    const next = normalizeUrl(draft)
    setUrl(next)
    setDraft(next)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center gap-1.5 border-b px-2">
        <Button size="icon" variant="ghost" className="size-8" aria-label="Back">
          <ArrowLeft className="size-4" />
        </Button>
        <Button size="icon" variant="ghost" className="size-8" aria-label="Forward">
          <ArrowRight className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-8"
          aria-label="Reload"
          onClick={() => setFrameKey((value) => value + 1)}
        >
          <RefreshCw className="size-4" />
        </Button>
        <form onSubmit={navigate} className="flex min-w-0 flex-1 items-center">
          <div className="relative w-full">
            <ShieldCheck className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-emerald-600" />
            <Input
              aria-label="Browser address"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="h-8 rounded-md bg-muted/55 pl-8 pr-8 text-xs"
            />
            <Search className="absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          </div>
        </form>
        <Button asChild size="icon" variant="ghost" className="size-8">
          <a href={url} target="_blank" rel="noreferrer" aria-label="Open in browser">
            <ExternalLink className="size-4" />
          </a>
        </Button>
      </div>
      <div className="relative min-h-0 flex-1 bg-white">
        <iframe
          key={frameKey}
          title="bapX browser workspace"
          src={url}
          className="h-full w-full border-0 bg-white"
          sandbox="allow-forms allow-modals allow-popups allow-same-origin allow-scripts"
        />
      </div>
      <div className="flex h-7 shrink-0 items-center justify-between border-t bg-muted/35 px-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><Globe2 className="size-3" /> Isolated browser session</span>
        <span>Viewport: responsive</span>
      </div>
    </div>
  )
}

function TerminalSurface() {
  const [lines, setLines] = useState(['bapX workspace connected', 'Ready for a project-scoped command.'])
  const [command, setCommand] = useState('')

  const run = (event: FormEvent) => {
    event.preventDefault()
    if (!command.trim()) return
    setLines((current) => [...current, `$ ${command.trim()}`, 'Command queued for the authorized workspace.'])
    setCommand('')
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#111318] text-slate-200">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3 text-xs text-slate-400">
        <TerminalSquare className="size-4" /> project shell · main
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4 font-mono text-xs leading-6">
        {lines.map((line, index) => <div key={`${line}-${index}`}>{line}</div>)}
      </div>
      <form onSubmit={run} className="flex items-center gap-2 border-t border-white/10 p-3 font-mono text-xs">
        <span className="text-emerald-400">$</span>
        <input
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          aria-label="Terminal command"
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-slate-600"
          placeholder="Enter a project command"
        />
      </form>
    </div>
  )
}

function ReviewSurface() {
  return (
    <div className="min-h-0 flex-1 overflow-auto bg-background p-5">
      <h2 className="text-sm font-semibold">Change review</h2>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">Review agent changes before they are committed or published.</p>
      <div className="mt-5 divide-y rounded-lg border">
        {[
          ['Webhook route', 'apps/www/server.mjs', 'Verified GitHub event ingress'],
          ['Browser workspace', 'apps/www/admin', 'Browser, terminal, and review shell'],
          ['Browser skill', '.agents/skills/browser', 'Project-local capability contract'],
        ].map(([title, file, detail]) => (
          <div key={file} className="p-3.5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium">{title}</p>
              <span className="text-[10px] font-medium text-emerald-600">Ready</span>
            </div>
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">{file}</p>
            <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export function WorkspacePanel() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('browser')
  const [width, setWidth] = useState(520)

  const startResize = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    const startX = event.clientX
    const startWidth = width
    const move = (moveEvent: globalThis.PointerEvent) => {
      setWidth(Math.min(760, Math.max(360, startWidth + startX - moveEvent.clientX)))
    }
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }

  return (
    <aside className="relative hidden h-svh min-h-0 shrink-0 border-l bg-background xl:flex xl:flex-col" style={{ width }}>
      <div
        role="separator"
        aria-label="Resize workspace panel"
        aria-orientation="vertical"
        onPointerDown={startResize}
        className="absolute inset-y-0 -left-1 z-20 w-2 cursor-col-resize touch-none hover:bg-indigo-500/20"
      />
      <div className="flex h-14 shrink-0 items-end border-b px-3">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'relative h-11 px-4 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground',
              activeTab === tab.id && 'text-indigo-600 after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:bg-indigo-600',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="flex min-h-0 flex-1">
        {activeTab === 'browser' ? <BrowserSurface /> : null}
        {activeTab === 'terminal' ? <TerminalSurface /> : null}
        {activeTab === 'review' ? <ReviewSurface /> : null}
      </div>
    </aside>
  )
}
