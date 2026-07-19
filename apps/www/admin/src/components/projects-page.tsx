import { FormEvent, useEffect, useState } from 'react'
import { ExternalLink, FolderGit2, Loader2 } from 'lucide-react'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'

type Project = {
  slug: string
  name: string
  path: string
  repository: { fullName: string } | null
  commitSha: string | null
}

type ImportResult = {
  project?: Project
  error?: string
  message?: string
}

export function ProjectsPage() {
  const [repositoryUrl, setRepositoryUrl] = useState('')
  const [projects, setProjects] = useState<Project[]>([])
  const [status, setStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const loadProjects = async () => {
    const response = await fetch('/api/projects', { credentials: 'same-origin' })
    const body = await response.json()
    if (!response.ok) throw new Error(body.message || body.error || 'Projects could not be loaded')
    setProjects(body.projects || [])
  }

  useEffect(() => {
    void loadProjects().catch((error) => setStatus(error.message))
  }, [])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setStatus('Resolving and importing repository…')
    try {
      const response = await fetch('/api/projects/import', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repositoryUrl }),
      })
      const body = (await response.json()) as ImportResult
      if (!response.ok) throw new Error(body.message || body.error || 'Repository import failed')
      setRepositoryUrl('')
      setStatus(`Imported ${body.project?.name || 'repository'} successfully.`)
      await loadProjects()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Repository import failed')
    } finally {
      setLoading(false)
    }
  }

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
            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
              <input
                id="repository-url"
                value={repositoryUrl}
                onChange={(event) => setRepositoryUrl(event.target.value)}
                required
                placeholder="https://github.com/owner/repository"
                className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Button type="submit" disabled={loading || !repositoryUrl.trim()}>
                {loading ? <Loader2 className="size-4 animate-spin" /> : <FolderGit2 className="size-4" />}
                Import repository
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Supported now: public GitHub HTTPS and SSH repository references. Existing project directories are never overwritten.
            </p>
            {status ? <p className="mt-3 text-sm" role="status">{status}</p> : null}
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
                        {project.commitSha ? <p className="mt-1 font-mono text-xs text-muted-foreground">{project.commitSha.slice(0, 12)}</p> : null}
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
