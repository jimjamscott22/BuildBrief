import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Deliverable, DeliverableFailure, DeliverableKey, getProject, Project } from '../api'
import { availableDeliverables, buildBundleMarkdown } from '../deliverables'

interface LocationState {
  deliverables: Deliverable
  failures?: DeliverableFailure[]
  /** Keys asked for in the run that produced this view, for an accurate "n of m". */
  requested?: DeliverableKey[]
  project?: Partial<Project>
}

const pad = (n: number) => n.toString().padStart(2, '0')

function downloadMarkdown(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function ResultsPage() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const state = location.state as LocationState | null
  const [project, setProject] = useState<Project | null>(
    state?.project && id
      ? {
          id,
          title: state.project.title ?? 'Results',
          description: state.project.description ?? '',
          target_users: state.project.target_users ?? '',
          platform: state.project.platform ?? 'web',
          tech_preferences: state.project.tech_preferences ?? '',
          complexity: state.project.complexity ?? 'medium',
          constraints: state.project.constraints ?? '',
          extra_context: state.project.extra_context ?? '',
          created_at: state.project.created_at ?? '',
          updated_at: state.project.updated_at ?? '',
        }
      : null
  )
  const [fetchedDeliverables, setFetchedDeliverables] = useState<Deliverable | null>(null)
  const [loading, setLoading] = useState(!state?.deliverables || !state?.project)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return

    let ignore = false
    if (!state?.deliverables || !state?.project) {
      setLoading(true)
    }
    setError('')
    getProject(id)
      .then((record) => {
        if (ignore) return
        setProject(record.project)
        setFetchedDeliverables(record.deliverables)
      })
      .catch(() => {
        if (!ignore) setError('Could not load that saved project.')
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [id, state?.deliverables, state?.project])

  const deliverables = state?.deliverables ?? fetchedDeliverables ?? undefined
  const failures = state?.failures ?? []
  const requestedCount = state?.requested?.length ?? failures.length
  const tabs = useMemo(() => availableDeliverables(deliverables), [deliverables])
  const [activeTab, setActiveTab] = useState<DeliverableKey | null>(null)

  useEffect(() => {
    if (tabs.length === 0) {
      setActiveTab(null)
      return
    }
    if (!activeTab || !tabs.some((tab) => tab.key === activeTab)) {
      setActiveTab(tabs[0].key)
    }
  }, [activeTab, tabs])

  if (loading) {
    return (
      <div className="py-24 flex flex-col items-center gap-5">
        <span className="caption text-cyan-400 animate-pulse">Loading saved results...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="py-24 flex flex-col items-center gap-5">
        <p className="text-rose">{error}</p>
        <Link to="/library" className="btn-ghost">Back to Library</Link>
      </div>
    )
  }

  if (!deliverables || tabs.length === 0) {
    return (
      <div className="py-24 flex flex-col items-center gap-5">
        <span className="caption text-paper-mute">No generated deliverables to display.</span>
        <Link to="/library" className="btn-ghost">Back to Library</Link>
      </div>
    )
  }

  const activeConfig = tabs.find((tab) => tab.key === activeTab)
  const content = activeTab ? (deliverables[activeTab] ?? '') : ''
  const title = project?.title ?? 'Results'

  function handleDownload() {
    if (!activeConfig) return
    downloadMarkdown(activeConfig.filename, content)
  }

  function handleBundleDownload() {
    if (!deliverables) return
    downloadMarkdown('buildbrief-bundle.md', buildBundleMarkdown(title, deliverables))
  }

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-4 pt-2">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="caption text-cyan-400">DRAFT</span>
          <span className="h-px w-10 bg-cyan-400/50" />
          {id && <span className="caption text-paper-mute">#{id.slice(0, 8)}</span>}
        </div>
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <h2 className="font-display italic text-[2.5rem] sm:text-[3.25rem] leading-[0.95] tracking-tighter-2 text-paper max-w-3xl">
            {title}
          </h2>
          <div className="flex gap-2 flex-wrap">
            {id && <Link to={`/wizard?edit=${id}`} className="btn-ghost">Edit Brief</Link>}
            <Link to="/library" className="btn-ghost">Library</Link>
            <Link to="/wizard" className="btn-ghost">Start Over</Link>
          </div>
        </div>
      </header>

      {failures.length > 0 && (
        <div className="border-l-2 border-ember pl-4 py-3 flex flex-col gap-2">
          <span className="caption text-ember">
            {requestedCount - failures.length} of {requestedCount} generated
          </span>
          <ul className="flex flex-col gap-1">
            {failures.map((failure) => (
              <li key={failure.deliverable} className="text-[13px] text-paper-dim">
                <span className="text-paper">{failure.label}</span> — {failure.message}
              </li>
            ))}
          </ul>
          {id && (
            <Link to={`/wizard?edit=${id}`} className="btn-link self-start">
              Retry in the wizard
            </Link>
          )}
        </div>
      )}

      <div className="grid grid-cols-12 gap-8 border-t border-ink-700 pt-8">
        <aside className="col-span-12 md:col-span-3">
          <div className="md:sticky md:top-8 flex flex-col gap-6">
            <span className="caption text-paper-mute">Sections</span>
            <nav className="flex flex-col">
              {tabs.map(({ key, label, short }, idx) => {
                const active = activeTab === key
                return (
                  <button
                    key={key}
                    onClick={() => setActiveTab(key)}
                    className={[
                      'group flex items-start gap-3 py-3 pl-4 pr-2 border-l-2 text-left transition-colors duration-200',
                      active
                        ? 'border-l-cyan-400 bg-cyan-400/[0.04]'
                        : 'border-l-ink-700 hover:border-l-ink-500 hover:bg-ink-900/40',
                    ].join(' ')}
                  >
                    <span className={['font-mono text-[10px] tracking-[0.22em] mt-1', active ? 'text-cyan-400' : 'text-paper-mute'].join(' ')}>
                      {pad(idx + 1)}
                    </span>
                    <span className="flex flex-col leading-tight min-w-0">
                      <span className={['font-display text-lg', active ? 'text-paper' : 'text-paper-dim group-hover:text-paper'].join(' ')}>
                        {label}
                      </span>
                      <span className="caption text-paper-mute mt-0.5">{short}</span>
                    </span>
                  </button>
                )
              })}
            </nav>

            <div className="hairline pt-4 flex flex-col gap-2">
              <button onClick={handleDownload} className="btn-ghost w-full">
                Export Current
              </button>
              <button onClick={handleBundleDownload} className="btn-ghost w-full">
                Export Bundle
              </button>
            </div>
          </div>
        </aside>

        <div className="col-span-12 md:col-span-9">
          <article
            className="prose prose-invert max-w-none
              font-sans
              prose-headings:font-display prose-headings:italic prose-headings:font-normal prose-headings:text-paper prose-headings:tracking-tighter-2
              prose-h1:text-4xl prose-h1:leading-[1.05] prose-h1:mt-0
              prose-h2:text-3xl prose-h2:leading-[1.1] prose-h2:mt-12 prose-h2:mb-4 prose-h2:not-italic
              prose-h3:text-xl prose-h3:not-italic prose-h3:font-medium prose-h3:font-sans prose-h3:uppercase prose-h3:tracking-[0.18em] prose-h3:text-paper-dim prose-h3:mt-8
              prose-p:text-paper prose-p:leading-[1.75] prose-p:text-[15px]
              prose-a:text-cyan-300 prose-a:no-underline prose-a:border-b prose-a:border-cyan-300/40 hover:prose-a:border-cyan-300
              prose-strong:text-paper prose-strong:font-semibold
              prose-em:text-paper-dim
              prose-code:font-mono prose-code:text-[12px] prose-code:text-cyan-200 prose-code:bg-ink-900 prose-code:border prose-code:border-ink-700 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-sm prose-code:before:content-none prose-code:after:content-none
              prose-pre:bg-ink-900 prose-pre:border prose-pre:border-ink-700 prose-pre:rounded-sm prose-pre:text-[12px] prose-pre:leading-relaxed
              prose-blockquote:border-l-2 prose-blockquote:border-cyan-400 prose-blockquote:bg-transparent prose-blockquote:not-italic prose-blockquote:text-paper-dim prose-blockquote:pl-5
              prose-li:text-paper prose-li:my-1
              prose-ul:my-4 prose-ol:my-4
              prose-hr:border-ink-700
              prose-th:font-mono prose-th:text-[10px] prose-th:uppercase prose-th:tracking-[0.18em] prose-th:text-paper-dim prose-th:border-ink-700
              prose-td:text-paper prose-td:border-ink-800
              prose-table:border-collapse"
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </article>
        </div>
      </div>
    </div>
  )
}
