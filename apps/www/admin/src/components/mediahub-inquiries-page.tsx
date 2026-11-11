import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, Loader2, RefreshCw } from 'lucide-react'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'

type Inquiry = {
  id: string; name: string; email: string; phone?: string; organisation: string; service: string; budget: string; timeline: string; brief: string;
  status: 'new' | 'contacted' | 'qualified' | 'closed'; createdAt: string;
  source?: { referrer?: string; utmSource?: string; utmMedium?: string; utmCampaign?: string; device?: string }
}
type Summary = { total: number; byStatus: Record<string, number>; byService: Record<string, number>; bySource: Record<string, number>; byDevice: Record<string, number> }

export function MediaHubInquiriesPage() {
  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [summary, setSummary] = useState<Summary>({ total: 0, byStatus: {}, byService: {}, bySource: {}, byDevice: {} })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true); setError('')
    try {
      const response = await fetch('/api/mediahub/inquiries', { credentials: 'same-origin' })
      const body = await response.json()
      if (!response.ok) throw new Error(body.message || body.error || 'Inquiries could not be loaded')
      setInquiries(body.inquiries || []); setSummary(body.summary || {})
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Inquiries could not be loaded') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])
  const newest = useMemo(() => inquiries[0]?.createdAt ? new Date(inquiries[0].createdAt).toLocaleString() : 'No submissions', [inquiries])
  const updateStatus = async (id: string, status: Inquiry['status']) => {
    const response = await fetch('/api/mediahub/inquiries', { method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) })
    const body = await response.json()
    if (!response.ok) { setError(body.message || 'Status could not be updated'); return }
    setInquiries((items) => items.map((item) => item.id === id ? body.inquiry : item)); void load()
  }
  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center justify-between border-b px-3"><SidebarTrigger /><Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className="size-4" /> Refresh</Button></header>
      <main className="min-h-0 flex-1 overflow-y-auto px-5 py-8 sm:px-8">
        <div className="mx-auto w-full max-w-6xl">
          <p className="text-sm font-medium text-muted-foreground">Private lead operations</p><h1 className="mt-1 text-4xl font-semibold tracking-tight">MediaHub inquiries</h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">Server-confirmed project briefs from mediahub.bapx.in. A CTA click or validation attempt is not counted here.</p>
          <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Submitted" value={summary.total} /><Metric label="New" value={summary.byStatus?.new || 0} /><Metric label="Qualified" value={summary.byStatus?.qualified || 0} /><Metric label="Latest" value={newest} compact />
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-3"><Breakdown title="Services" values={summary.byService} /><Breakdown title="Source" values={summary.bySource} /><Breakdown title="Device" values={summary.byDevice} /></div>
          {error ? <p role="alert" className="mt-5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
          <div className="mt-8 space-y-4">
            {loading ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading inquiries…</div> : null}
            {!loading && inquiries.length === 0 ? <div className="rounded-xl border p-6"><p className="font-medium">No completed briefs yet.</p><p className="mt-2 text-sm text-muted-foreground">Only successful persisted submissions appear here.</p></div> : null}
            {inquiries.map((item) => <article key={item.id} className="rounded-xl border bg-card p-5 shadow-sm">
              <div className="flex flex-col justify-between gap-3 sm:flex-row"><div><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{item.service}</p><h2 className="mt-1 text-xl font-semibold">{item.name} · {item.organisation}</h2><p className="mt-1 text-sm text-muted-foreground">{new Date(item.createdAt).toLocaleString()} · {item.id}</p></div>
                <select aria-label={`Status for ${item.name}`} value={item.status} onChange={(event) => void updateStatus(item.id, event.target.value as Inquiry['status'])} className="h-10 rounded-md border bg-background px-3 text-sm"><option value="new">New</option><option value="contacted">Contacted</option><option value="qualified">Qualified</option><option value="closed">Closed</option></select></div>
              <div className="mt-4 grid gap-4 md:grid-cols-[1fr_2fr]"><div className="text-sm"><a className="underline" href={`mailto:${item.email}`}>{item.email}</a>{item.phone ? <p className="mt-1"><a className="underline" href={`tel:${item.phone}`}>{item.phone}</a></p> : null}<p className="mt-3"><span className="text-muted-foreground">Budget:</span> {item.budget}</p><p><span className="text-muted-foreground">Timeline:</span> {item.timeline}</p></div><p className="whitespace-pre-wrap text-sm leading-6">{item.brief}</p></div>
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t pt-3 text-xs text-muted-foreground"><span>Device: {item.source?.device || 'unknown'}</span><span>UTM: {[item.source?.utmSource,item.source?.utmMedium,item.source?.utmCampaign].filter(Boolean).join(' / ') || 'none'}</span>{item.source?.referrer ? <a className="inline-flex items-center gap-1 underline" href={item.source.referrer} target="_blank" rel="noreferrer">Referrer <ExternalLink className="size-3" /></a> : <span>Direct</span>}</div>
            </article>)}
          </div>
        </div>
      </main>
    </div>
  )
}

function Metric({ label, value, compact = false }: { label: string; value: string | number; compact?: boolean }) { return <div className="rounded-xl border bg-card p-4"><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p><p className={`mt-2 font-semibold ${compact ? 'text-sm' : 'text-3xl'}`}>{value}</p></div> }
function Breakdown({ title, values = {} }: { title: string; values?: Record<string, number> }) { const rows = Object.entries(values).sort((a,b) => b[1]-a[1]).slice(0,5); return <div className="rounded-xl border bg-card p-4"><h2 className="font-medium">{title}</h2>{rows.length ? <ul className="mt-3 space-y-2 text-sm">{rows.map(([label,count]) => <li key={label} className="flex justify-between gap-4"><span className="truncate text-muted-foreground">{label}</span><strong>{count}</strong></li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">No data yet.</p>}</div> }
