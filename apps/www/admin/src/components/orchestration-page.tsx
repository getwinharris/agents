import { useEffect, useState } from 'react'
import { CheckCircle2, Clock3, ShieldAlert } from 'lucide-react'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { operatingSurface } from '@/lib/operating-surface.mjs'

type Task = { id: string; version: number; objective: string; profile: string; state: string; approval: { state: string }; result?: { verification?: { state?: string }; evidence?: unknown[] } }

export function OrchestrationPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [error, setError] = useState('')
  const load = async () => {
    const response = await fetch('/api/orchestration/tasks', { credentials: 'same-origin' })
    if (!response.ok) throw new Error('Task state is temporarily unavailable.')
    setTasks((await response.json()).tasks)
  }
  useEffect(() => { if (operatingSurface.kind === 'agents') void load().catch((cause) => setError(cause.message)) }, [])
  const decide = async (task: Task, decision: 'approved' | 'rejected') => {
    const response = await fetch(`/api/orchestration/tasks/${task.id}/approval`, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ version: task.version, decision, actor: 'workspace-owner' }) })
    if (!response.ok) { setError('The approval changed; reload the task state.'); return }
    await load()
  }
  return <div className="flex h-svh flex-col"><header className="flex h-14 items-center border-b px-3"><SidebarTrigger /></header><main className="mx-auto w-full max-w-4xl flex-1 overflow-auto px-6 py-12">
    <h1 className="text-4xl font-semibold tracking-tight">Tasks and approvals</h1>
    <p className="mt-3 text-muted-foreground">Durable specialist work, verification evidence, and decisions for the current workspace.</p>
    {operatingSurface.kind === 'admin' ? <div className="mt-8 rounded-lg border p-5"><div className="flex items-center gap-2 font-medium"><ShieldAlert className="size-4" />Customer evidence is tenant-scoped</div><p className="mt-2 text-sm text-muted-foreground">Admin does not inherit customer task contents or approvals. Operational oversight is limited to separately authorized, redacted service evidence.</p></div> : null}
    {error ? <p className="mt-6 text-sm text-destructive" role="alert">{error}</p> : null}
    <div className="mt-8 space-y-3">{tasks.map((task) => <article key={task.id} className="rounded-lg border p-5"><div className="flex items-start justify-between gap-4"><div><p className="font-medium">{task.objective}</p><p className="mt-1 text-xs text-muted-foreground">{task.profile} · {task.id}</p></div><span className="flex items-center gap-1 rounded-full border px-2 py-1 text-xs">{task.state === 'succeeded' ? <CheckCircle2 className="size-3" /> : <Clock3 className="size-3" />}{task.state}</span></div>
      {task.result ? <p className="mt-3 text-sm">Verification: {task.result.verification?.state ?? 'unverified'} · Evidence: {task.result.evidence?.length ?? 0}</p> : null}
      {task.state === 'waiting_approval' ? <div className="mt-4 flex gap-2"><Button size="sm" onClick={() => void decide(task, 'approved')}>Approve</Button><Button size="sm" variant="outline" onClick={() => void decide(task, 'rejected')}>Reject</Button></div> : null}
    </article>)}</div>
    {operatingSurface.kind === 'agents' && tasks.length === 0 && !error ? <p className="mt-8 rounded-lg border p-5 text-sm text-muted-foreground">No delegated tasks yet.</p> : null}
  </main></div>
}
