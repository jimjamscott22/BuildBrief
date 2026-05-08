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
    project.has_spec ? 'Spec' : null,
    project.has_implementation_plan ? 'Plan' : null,
    project.has_agent_prompt ? 'Prompt' : null,
  ].filter(Boolean)
}

export default function LibraryPage() {
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [platform, setPlatform] = useState<(typeof PLATFORM_OPTIONS)[number]>('all')
  const [deletingId, setDeletingId] = useState('')

  useEffect(() => {
    listProjects()
      .then(setProjects)
      .catch(() => setError('Could not load your saved projects.'))
      .finally(() => setLoading(false))
  }, [])

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
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white">Library</h1>
          <p className="text-sm text-surface-400 mt-1">
            Saved project plans and generated deliverables.
          </p>
        </div>
        <Link to="/wizard" className="btn-primary text-center">
          New Brief
        </Link>
      </div>

      <div className="bg-surface-900 rounded-xl border border-surface-700/60 p-4 flex flex-col sm:flex-row gap-3">
        <input
          type="search"
          className="input-dark"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search saved projects..."
        />
        <select
          className="input-dark sm:max-w-44"
          value={platform}
          onChange={(event) =>
            setPlatform(event.target.value as (typeof PLATFORM_OPTIONS)[number])
          }
        >
          {PLATFORM_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option === 'all' ? 'All platforms' : option.charAt(0).toUpperCase() + option.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="rounded-md border border-red-600/50 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="bg-surface-900 rounded-xl border border-surface-700/60 p-8 text-center text-surface-400">
          Loading saved projects...
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="bg-surface-900 rounded-xl border border-surface-700/60 p-8 text-center">
          <p className="text-surface-300">
            {projects.length === 0
              ? 'No saved projects yet.'
              : 'No saved projects match those filters.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredProjects.map((project) => {
            const labels = deliverableLabels(project)
            return (
              <article
                key={project.id}
                className="bg-surface-900 rounded-xl border border-surface-700/60 p-5 flex flex-col gap-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-white truncate">
                      {project.title}
                    </h2>
                    <p className="text-sm text-surface-400 mt-1 line-clamp-2">
                      {project.description}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Link to={`/results/${project.id}`} className="btn-primary">
                      Open
                    </Link>
                    <button
                      onClick={() => handleDelete(project)}
                      disabled={deletingId === project.id}
                      className="btn-ghost hover:border-red-400 hover:text-red-300"
                    >
                      {deletingId === project.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded border border-surface-600 bg-surface-800 px-2 py-1 text-surface-300">
                    {project.platform}
                  </span>
                  <span className="rounded border border-surface-600 bg-surface-800 px-2 py-1 text-surface-300">
                    {project.complexity}
                  </span>
                  {labels.length > 0 ? (
                    labels.map((label) => (
                      <span
                        key={label}
                        className="rounded border border-brand-500/50 bg-brand-500/10 px-2 py-1 text-brand-300"
                      >
                        {label}
                      </span>
                    ))
                  ) : (
                    <span className="rounded border border-amber-600/50 bg-amber-500/10 px-2 py-1 text-amber-300">
                      No deliverables
                    </span>
                  )}
                </div>

                <div className="text-xs text-surface-500">
                  Updated {formatDate(project.updated_at)} · Created {formatDate(project.created_at)}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
