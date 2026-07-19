import { useEffect, useState, type FormEvent } from 'react'
import { ExternalLink, FolderGit2, Loader2 } from 'lucide-react'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'

type Project = {
  slug: string
  name: string
  path: string
  repository: { fullName: string } | null
  commitSha: string | null
  operationId?: string
  status?: string
}

type ImportResult = {
  project?: Project
  error?: string
  message?: string
}

type StatusState = {
  kind: 'progress' | 'success' | 'error'
  message: string
}

function repositoryIdentity(repositoryUrl: string) {
  const trimmed = repositoryUrl.trim().replace(/\.git$/, '')
  const match = trimmed.match(/github\.com[/:]([^/]+)\/([^/?#]+)$/i)
  if (!match) return ''
  return `${match[1]}/${match[2]}`
}

function suggestedSlug(repositoryUrl: string) {
  const identity = repositoryIdentity(repositoryUrl)
  if (!identity) return ''
  return identity
    .replace('/', '-')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function ProjectsPage() {
  const [repositoryUrl, setRepositoryUrl] = useState('')
  const [projectSlug, setProjectSlug] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
  const [status, setStatus] = useState<StatusState | null>(null)
  const [loading, setLoading] = useState(false)

  const loadProjects = async () => {
    const response = await fetch('/api/projects', { credentials: 'same-origin' })
    const body = await response.json()
    if (!response.ok) throw new Error(body.message || body.error || 'Projects could not be loaded')
    setProjects(body.projects || [])
  }

  useEffect(() => {
    void loadProjects().catch((error) => setStatus({ kind: 'error', message: error.message }))
  }, [])

  const updateRepositoryUrl = (value: string) => {
    setRepositoryUrl(value)
    setConfirmed(false)
    if (!projectSlug || projectSlug === suggestedSlug(repositoryUrl)) setProjectSlug(suggestedSlug(value))
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (loading || !repositoryUrl.trim() || !projectSlug.trim() || !confirmed) {
      setStatus({ kind: 'error', message: 'Confirm the displayed repository and destination before importing.' })
      return
    }
    setLoading(true)
    setStatus({ kind: 'progress', message: 'Resolving and importing repository…' })
    try {
      const response = await fetch('/api/projects/import', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repositoryUrl: { repositoryUrl, projectSlug, confirmed } }),
      })
      const body = (await response.json()) as ImportResult
      if (!response.ok) throw new Error(body.message || body.error || 'Repository import failed')
      setRepositoryUrl('')
      setProjectSlug('')
      setConfirmed(false)
      setStatus({
        kind: 'success',
        message: `Imported ${body.project?.name || 'repository'} successfully${body.project?.operationId ? ` (operation ${body.project.operationId})` : ''}.`,
      })
      await loadProjects()
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Repository import failed' })
    } finally {
      setLoading(false)
    }
  }

  const canonicalRepository = repositoryIdentity(repositoryUrl) || 'Enter a supported repository URL'
  const destinationPath = projectSlug ? `projects/${projectSlug}` : 'Enter a supported repository URL'
  const statusClassName = status?.kind === 'error'
    ? 'border-destructive/40 bg-destructive/10 text-destructive'
    : status?.kind === 'success'
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
      : 'border-border bg-muted/40 text-foreground'

  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center border-b px-3">
        <SidebarTrigger />
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto w-full max-w-5xl">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Admin workspace</p>
            <h1 className="mt-1 text-4xl font-semibold tracking-tight">Projects</h1>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              Import a public GitHub repository into the existing bapX Admin workspace, then open it in the existing file editor.
            </p>
          </div>

          <form onSubmit={submit} className="mt-8 rounded-xl border bg-card p-5 shadow-sm">
            <label htmlFor="repository-url" className="text-sm font-medium">GitHub repository URL</label>
            <input
              id="repository-url"
              value={repositoryUrl}
              onChange={(event) => updateRepositoryUrl(event.target.value)}
              required
              placeholder="https://github.com/owner/repository"
              className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            />

            <label htmlFor="project-slug" className="mt-4 block text-sm font-medium">Project slug</label>
            <input
              id="project-slug"
              value={projectSlug}
              onChange={(event) => { setProjectSlug(event.target.value.toLowerCase()); setConfirmed(false) }}
              required
              pattern="[a-z0-9][a-z0-9._-]{0,98}[a-z0-9]|[a-z0-9]"
              maxLength={100}
              placeholder="owner-repository"
              className="mt-2 h-10 w-full rounded-md border bg-background px-3 font-mono text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            />

            <div className="mt-4 rounded-lg border bg-muted/30 p-4">
              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Canonical repository before mutation</dt>
                  <dd className="mt-2 break-all font-mono text-sm">{canonicalRepository}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Destination before mutation</dt>
                  <dd className="mt-2 break-all font-mono text-sm">{destinationPath}</dd>
                </div>
              </dl>
              <label className="mt-4 flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                  className="mt-0.5 size-4"
                />
                <span>I confirm this public repository may be cloned into the displayed Admin project path.</span>
              </label>
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                Supported now: public GitHub HTTPS and SSH repository references. Existing project directories are never overwritten.
              </p>
              <Button type="submit" disabled={loading || !repositoryUrl.trim() || !projectSlug.trim() || !confirmed}>
                {loading ? <Loader2 className="size-4 animate-spin" /> : <FolderGit2 className="size-4" />}
                Confirm import
              </Button>
            </div>
            {status ? (
              <div
                className={`mt-4 rounded-md border px-3 py-2 text-sm ${statusClassName}`}
                role={status.kind === 'error' ? 'alert' : 'status'}
                aria-live={status.kind === 'error' ? 'assertive' : 'polite'}
                data-state={status.kind}
              >
                {status.kind === 'progress' ? <Loader2 className="mr-2 inline size-4 animate-spin" aria-hidden="true" /> : null}
                {status.message}
              </div>
            ) : null}
          </form>

          <section className="mt-10">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold">Imported projects</h2>
              <Button asChild variant="outline" size="sm">
                <a href="/editor/">Open workspace editor <ExternalLink className="size-4" /></a>
              </Button>
            </div>
            {projects.length === 0 ? (
              <div className="mt-4 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                No imported projects yet. Submit a public repository above.
              </div>
            ) : (
              <div className="mt-4 grid gap-3">
                {projects.map((project) => (
                  <article key={project.slug} className="rounded-lg border p-4">
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                      <div className="min-w-0">
                        <h3 className="truncate font-medium">{project.name}</h3>
                        <p className="mt-1 truncate text-sm text-muted-foreground">{project.path}</p>
                        <dl className="mt-3 grid gap-1 text-xs text-muted-foreground sm:grid-cols-3">
                          <div>
                            <dt className="font-medium text-foreground">Status</dt>
                            <dd>{project.status || 'unknown'}</dd>
                          </div>
                          <div>
                            <dt className="font-medium text-foreground">Operation</dt>
                            <dd className="break-all font-mono">{project.operationId || 'not recorded'}</dd>
                          </div>
                          <div>
                            <dt className="font-medium text-foreground">Commit</dt>
                            <dd className="break-all font-mono">{project.commitSha || 'not recorded'}</dd>
                          </div>
                        </dl>
                      </div>
                      <Button asChild variant="outline" size="sm">
                        <a href={`/editor/?path=${encodeURIComponent(project.path)}`}>Open files</a>
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}
