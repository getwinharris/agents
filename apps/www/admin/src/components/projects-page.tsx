import { useEffect, useState, type FormEvent } from 'react'
import { ExternalLink, FolderGit2, Loader2, Search } from 'lucide-react'
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

type ResolvedRepository = {
  repository: {
    owner: string
    repository: string
    fullName: string
    httpsUrl: string
    sshUrl: string
  }
  metadata: {
    repositoryId: number
    fullName: string
    ownerType: string
    defaultBranch: string
    visibility: 'public' | 'private' | 'internal'
    private: boolean
    archived: boolean
    status: string
  }
  project: {
    slug: string
    path: string
  }
}

type ResolveResult = Partial<ResolvedRepository> & {
  error?: string
  message?: string
}

type StatusState = {
  kind: 'progress' | 'success' | 'error'
  message: string
}

export function ProjectsPage() {
  const [repositoryUrl, setRepositoryUrl] = useState('')
  const [projectSlug, setProjectSlug] = useState('')
  const [resolved, setResolved] = useState<ResolvedRepository | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [projectsLoadError, setProjectsLoadError] = useState<string | null>(null)
  const [status, setStatus] = useState<StatusState | null>(null)
  const [resolving, setResolving] = useState(false)
  const [loading, setLoading] = useState(false)

  const loadProjects = async () => {
    setProjectsLoading(true)
    setProjectsLoadError(null)
    try {
      const response = await fetch('/api/projects', { credentials: 'same-origin' })
      const body = await response.json()
      if (!response.ok) throw new Error(body.message || body.error || 'Projects could not be loaded')
      setProjects(body.projects || [])
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Projects could not be loaded'
      setProjectsLoadError(message)
      throw error
    } finally {
      setProjectsLoading(false)
    }
  }

  useEffect(() => {
    void loadProjects().catch(() => undefined)
  }, [])

  const updateRepositoryUrl = (value: string) => {
    setRepositoryUrl(value)
    setResolved(null)
    setProjectSlug('')
    setConfirmed(false)
    setStatus(null)
  }

  const resolveRepository = async () => {
    if (resolving || loading || !repositoryUrl.trim()) return
    setResolving(true)
    setResolved(null)
    setConfirmed(false)
    setStatus({ kind: 'progress', message: 'Resolving repository through the configured GitHub App…' })
    try {
      const response = await fetch('/api/projects/resolve', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repositoryUrl }),
      })
      const body = (await response.json()) as ResolveResult
      if (!response.ok || !body.repository || !body.metadata || !body.project) {
        throw new Error(body.message || body.error || 'Repository could not be resolved')
      }
      const next = body as ResolvedRepository
      setResolved(next)
      setProjectSlug(next.project.slug)
      setStatus({
        kind: 'success',
        message: `Resolved ${next.repository.fullName} as a ${next.metadata.visibility} repository on ${next.metadata.defaultBranch}.`,
      })
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Repository could not be resolved' })
    } finally {
      setResolving(false)
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (loading || !resolved || !projectSlug.trim() || !confirmed) {
      setStatus({ kind: 'error', message: 'Resolve and confirm the displayed repository and destination before importing.' })
      return
    }
    if (resolved.metadata.private) {
      setStatus({ kind: 'error', message: 'Private repository cloning is not enabled in this Admin slice yet.' })
      return
    }
    setLoading(true)
    setStatus({ kind: 'progress', message: 'Importing the resolved repository…' })
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
      setResolved(null)
      setConfirmed(false)
      setStatus({
        kind: 'success',
        message: `Imported ${body.project?.name || 'repository'} successfully${body.project?.operationId ? ` (operation ${body.project.operationId})` : ''}.`,
      })
      void loadProjects().catch(() => undefined)
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Repository import failed' })
    } finally {
      setLoading(false)
    }
  }

  const canonicalRepository = resolved?.repository.fullName || 'Resolve a supported repository URL'
  const destinationPath = resolved && projectSlug ? `projects/${projectSlug}` : 'Resolve a supported repository URL'
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
              Resolve a GitHub repository through the configured GitHub App, confirm its canonical identity and destination, then import it into the existing Admin workspace.
            </p>
          </div>

          <form onSubmit={submit} className="mt-8 rounded-xl border bg-card p-5 shadow-sm">
            <label htmlFor="repository-url" className="text-sm font-medium">GitHub repository URL</label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                id="repository-url"
                value={repositoryUrl}
                onChange={(event) => updateRepositoryUrl(event.target.value)}
                required
                placeholder="https://github.com/owner/repository"
                className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Button type="button" variant="outline" onClick={resolveRepository} disabled={resolving || loading || !repositoryUrl.trim()}>
                {resolving ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                Resolve
              </Button>
            </div>

            <label htmlFor="project-slug" className="mt-4 block text-sm font-medium">Project slug</label>
            <input
              id="project-slug"
              value={projectSlug}
              onChange={(event) => { setProjectSlug(event.target.value.toLowerCase()); setConfirmed(false) }}
              required
              disabled={!resolved}
              pattern="[a-z0-9][a-z0-9._-]{0,98}[a-z0-9]|[a-z0-9]"
              maxLength={100}
              placeholder="owner-repository"
              className="mt-2 h-10 w-full rounded-md border bg-background px-3 font-mono text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
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
                {resolved ? (
                  <>
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Visibility</dt>
                      <dd className="mt-2 text-sm">{resolved.metadata.visibility}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Default branch</dt>
                      <dd className="mt-2 break-all font-mono text-sm">{resolved.metadata.defaultBranch}</dd>
                    </div>
                  </>
                ) : null}
              </dl>
              <label className="mt-4 flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={!resolved || resolved.metadata.private}
                  onChange={(event) => setConfirmed(event.target.checked)}
                  className="mt-0.5 size-4"
                />
                <span>
                  {resolved?.metadata.private
                    ? 'Private repository metadata is authorized, but private clone wiring remains unavailable in this slice.'
                    : 'I confirm this resolved public repository may be cloned into the displayed Admin project path.'}
                </span>
              </label>
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                Resolution is server-authorized. Existing project directories are never overwritten.
              </p>
              <Button type="submit" disabled={loading || resolving || !resolved || resolved.metadata.private || !projectSlug.trim() || !confirmed}>
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

          <section className="mt-10" aria-busy={projectsLoading}>
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold">Imported projects</h2>
              <Button asChild variant="outline" size="sm">
                <a href="/editor/">Open workspace editor <ExternalLink className="size-4" /></a>
              </Button>
            </div>
            {projectsLoading ? (
              <div className="mt-4 rounded-lg border p-6 text-sm text-muted-foreground" role="status" aria-live="polite" data-state="loading">
                <Loader2 className="mr-2 inline size-4 animate-spin" aria-hidden="true" />
                Loading imported projects…
              </div>
            ) : projectsLoadError ? (
              <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive" role="alert" data-state="error">
                Imported projects could not be loaded: {projectsLoadError}
              </div>
            ) : projects.length === 0 ? (
              <div className="mt-4 rounded-lg border border-dashed p-6 text-sm text-muted-foreground" data-state="empty">
                No imported projects yet. Resolve a repository above.
              </div>
            ) : (
              <div className="mt-4 grid gap-3" data-state="ready">
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
