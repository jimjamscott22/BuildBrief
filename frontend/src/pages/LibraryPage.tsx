import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteProject, listProjects, ProjectSummary } from '../api'

const PLATFORM_OPTIONS = ['all', 'web', 'mobile', 'desktop', 'cli'] as const

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function deliverableLabels(project: ProjectSummary) {
  return [
    project.has_spec ? 'spec' : null,
    project.has_implementation_plan ? 'plan' : null,
    project.has_agent_prompt ? 'prompt' : null,
  ].filter(Boolean) as string[]
}

const pad = (n: number) => n.toString().padStart(2, '0')

export default function LibraryPage() {
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [platform, setPlatform] = useState<(typeof PLATFORM_OPTIONS)[number]>('all')
  const [deletingId, setDeletingId] = useState('')

  useEffect(() => {
    let ignore = false
    setLoading(true)
    listProjects({ q: query, platform, limit: 100 })
      .then((items) => {
        if (!ignore) setProjects(items)
      })
      .catch(() => {
        if (!ignore) setError('Could not load your saved projects.')
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [platform, query])

  const filteredProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return projects.filter((project) => {
      const matchesQuery =
        !normalizedQuery ||
        project.title.toLowerCase().includes(normalizedQuery) ||
        project.description.toLowerCase().includes(normalizedQuery)
      const matchesPlatform = platform === 'all' || project.platform === platform
      return matchesQuery && matchesPlatform
    })
  }, [platform, projects, query])

  async function handleDelete(project: ProjectSummary) {
    const confirmed = window.confirm(`Delete "${project.title}" from your library?`)
    if (!confirmed) return

    setDeletingId(project.id)
    setError('')
    try {
      await deleteProject(project.id)
      setProjects((current) => current.filter((item) => item.id !== project.id))
    } catch {
      setError('Could not delete that project.')
    } finally {
      setDeletingId('')
    }
  }

  return (
    <div className="flex flex-col gap-10">
      {/* Hero */}
      <header className="flex flex-col gap-4 pt-2">
        <div className="flex items-center gap-3">
          <span className="caption text-cyan-400">INDEX</span>
          <span className="h-px w-10 bg-cyan-400/50" />
          <span className="caption text-paper-dim">
            {loading ? '—' : `${projects.length} ${projects.length === 1 ? 'BRIEF' : 'BRIEFS'} ON FILE`}
          </span>
        </div>
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <h2 className="font-display italic text-[3rem] sm:text-[3.5rem] leading-[0.95] tracking-tighter-2 text-paper">
            Library
          </h2>
          <Link to="/wizard" className="btn-primary">
            New Brief +
          </Link>
        </div>
      </header>

      {/* Toolbar */}
      <div className="flex flex-col gap-5 border-y border-ink-700 py-5">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-cyan-400 shrink-0">
            FIND /
          </span>
          <input
            type="search"
            className="field py-1.5 border-b-0"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="search titles and descriptions…"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="caption text-paper-mute mr-1">FILTER</span>
          {PLATFORM_OPTIONS.map((option) => {
            const active = platform === option
            return (
              <button
                key={option}
                onClick={() => setPlatform(option)}
                className={[
                  'font-mono text-[10px] uppercase tracking-[0.2em] px-2.5 py-1 rounded-sm border transition-colors duration-150',
                  active
                    ? 'border-cyan-400 text-paper bg-cyan-400/10'
                    : 'border-ink-700 text-paper-mute hover:border-ink-500 hover:text-paper-dim',
                ].join(' ')}
              >
                {option}
              </button>
            )
          })}
        </div>
      </div>

      {error && (
        <div className="border-l-2 border-rose pl-4 py-2 text-[13px] text-rose">
          {error}
        </div>
      )}

      {/* Index list */}
      {loading ? (
        <div className="caption text-paper-mute animate-pulse">Loading saved projects…</div>
      ) : filteredProjects.length === 0 ? (
        <div className="py-16 text-center flex flex-col items-center gap-4">
          <span className="caption text-paper-mute">
            {projects.length === 0 ? 'No briefs on file' : 'No matches for these filters'}
          </span>
          {projects.length === 0 && (
            <Link to="/wizard" className="btn-link">
              Start your first brief
            </Link>
          )}
        </div>
      ) : (
        <ul className="border-t border-ink-700">
          {filteredProjects.map((project, idx) => {
            const labels = deliverableLabels(project)
            return (
              <li
                key={project.id}
                className="group relative border-b border-ink-800 hover:bg-ink-900/40 transition-colors duration-200"
              >
                <Link
                  to={`/results/${project.id}`}
                  className="grid grid-cols-12 gap-4 items-baseline py-5 px-2 sm:px-4"
                >
                  <div className="col-span-1 hidden sm:block">
                    <span className="caption text-paper-mute">{pad(idx + 1)}</span>
                  </div>
                  <div className="col-span-12 sm:col-span-7 min-w-0">
                    <h3 className="font-display text-2xl leading-tight text-paper truncate group-hover:text-cyan-200 transition-colors">
                      {project.title}
                    </h3>
                    <p className="text-[13px] text-paper-dim mt-1 line-clamp-1">
                      {project.description}
                    </p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2.5 items-center">
                      <span className="caption text-paper-mute">{project.platform}</span>
                      <span className="text-ink-600">·</span>
                      <span className="caption text-paper-mute">{project.complexity}</span>
                      {labels.length > 0 && (
                        <>
                          <span className="text-ink-600">·</span>
                          <span className="caption text-cyan-300">
                            {labels.join(' / ')}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="col-span-12 sm:col-span-4 flex items-center justify-between sm:justify-end gap-4">
                    <div className="flex flex-col items-start sm:items-end gap-0.5">
                      <span className="caption text-paper-mute">
                        UPD {formatDate(project.updated_at)}
                      </span>
                      <span className="caption text-ink-500">
                        CRT {formatDate(project.created_at)}
                      </span>
                    </div>
                  </div>
                </Link>
                <Link
                  to={`/wizard?edit=${project.id}`}
                  className="absolute top-1/2 right-20 -translate-y-1/2 font-mono text-[10px] uppercase tracking-[0.22em] text-paper-mute hover:text-cyan-300 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity duration-150 px-2 py-1"
                  aria-label={`Edit ${project.title}`}
                >
                  Edit
                </Link>
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    handleDelete(project)
                  }}
                  disabled={deletingId === project.id}
                  className="absolute top-1/2 right-3 -translate-y-1/2 font-mono text-[10px] uppercase tracking-[0.22em] text-paper-mute hover:text-rose opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity duration-150 px-2 py-1"
                  aria-label={`Delete ${project.title}`}
                >
                  {deletingId === project.id ? 'Deleting…' : '✕ Del'}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
