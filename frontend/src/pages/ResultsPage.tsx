import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  type Deliverable,
  type DeliverableFailure,
  type DeliverableKey,
  type GenerateRequest,
  getProject,
  type Project,
} from '../api'
import {
  availableDeliverables,
  buildBundleMarkdown,
  DELIVERABLE_OPTIONS,
} from '../deliverables'
import { useGenerationRun } from './results/useGenerationRun'

interface LocationState {
  generationRequest?: GenerateRequest
  deliverables?: Deliverable
  failures?: DeliverableFailure[]
  /** Keys asked for in the run that produced this view, for an accurate "n of m". */
  requested?: DeliverableKey[]
  project?: Partial<Project>
}

const pad = (n: number) => n.toString().padStart(2, '0')

const statusLabel = {
  queued: 'Queued',
  generating: 'Generating',
  complete: 'Complete',
  failed: 'Failed',
} as const

function formatElapsed(seconds: number) {
  return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`
}

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
  const navigate = useNavigate()
  const state = location.state as LocationState | null
  const generationRequest = state?.generationRequest
  const generatingMode = generationRequest !== undefined
  const hasSavedRouteState = state?.deliverables !== undefined && state.project !== undefined
  const run = useGenerationRun(id, generationRequest)
  const [fetchedProject, setFetchedProject] = useState<Project | null>(null)
  const [fetchedDeliverables, setFetchedDeliverables] = useState<Deliverable | null>(null)
  const [loading, setLoading] = useState(!generatingMode && !hasSavedRouteState)
  const [fetchError, setFetchError] = useState('')
  const [terminalNotice, setTerminalNotice] = useState('')
  const [terminalError, setTerminalError] = useState('')
  const replacedRun = useRef('')

  const terminalPhase =
    run.phase === 'completed' || run.phase === 'cancelled' || run.phase === 'failed'
  const terminalReady = generatingMode && terminalPhase && run.savedRecord !== undefined
  const generationKey = generationRequest
    ? `${id ?? ''}|${generationRequest.model}|${generationRequest.preset ?? ''}|${generationRequest.deliverables.join(',')}`
    : ''
  const terminalState = useRef<LocationState | null>(null)
  if (terminalReady && run.savedRecord) {
    terminalState.current = {
      deliverables: run.savedRecord.deliverables ?? {},
      failures: run.failures,
      requested: generationRequest.deliverables,
      project: run.savedRecord.project,
    }
  }

  useEffect(() => {
    if (!id || generatingMode || hasSavedRouteState) return

    let ignore = false
    setLoading(true)
    setFetchError('')
    getProject(id)
      .then((record) => {
        if (ignore) return
        setFetchedProject(record.project)
        setFetchedDeliverables(record.deliverables)
      })
      .catch(() => {
        if (!ignore) setFetchError('Could not load that saved project.')
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [generatingMode, hasSavedRouteState, id])

  useEffect(() => {
    if (!terminalReady || !generationKey || replacedRun.current === generationKey) return
    const replacementState = terminalState.current
    if (!replacementState) return

    replacedRun.current = generationKey
    setTerminalNotice(run.notice)
    setTerminalError(run.error)
    navigate(location.pathname, { replace: true, state: replacementState })
  }, [generationKey, location.pathname, navigate, run.error, run.notice, terminalReady])

  const deliverables = generatingMode
    ? (run.savedRecord?.deliverables ?? run.drafts)
    : (state?.deliverables ?? fetchedDeliverables ?? undefined)
  const failures = generatingMode ? run.failures : (state?.failures ?? [])
  const requested = generatingMode ? generationRequest.deliverables : state?.requested
  const requestedCount = requested?.length ?? failures.length
  const tabs = generatingMode
    ? DELIVERABLE_OPTIONS.filter((option) => requested?.includes(option.key))
    : availableDeliverables(deliverables)
  const [selectedTab, setSelectedTab] = useState<DeliverableKey | null>(null)
  const activeTab =
    selectedTab && tabs.some((tab) => tab.key === selectedTab)
      ? selectedTab
      : (tabs[0]?.key ?? null)
  const completeCount = requested?.filter((key) => run.statuses[key] === 'complete').length ?? 0
  const displayNotice = generatingMode ? run.notice : terminalNotice
  const displayRunError = generatingMode ? run.error : terminalError

  if (loading) {
    return (
      <div className="py-24 flex flex-col items-center gap-5">
        <span className="caption text-cyan-400 animate-pulse">Loading saved results...</span>
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="py-24 flex flex-col items-center gap-5">
        <p role="alert" className="text-rose">{fetchError}</p>
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
  const activeStatus = activeTab ? run.statuses[activeTab] : undefined
  const currentExportDisabled = generatingMode ? activeStatus !== 'complete' : content.length === 0
  const bundleExportDisabled =
    generatingMode && (run.phase === 'running' || run.phase === 'stopping')
  const title =
    run.savedRecord?.project.title ?? state?.project?.title ?? fetchedProject?.title ?? 'Results'

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

      {generatingMode && (
        <div
          aria-live="polite"
          className="border border-ink-700 bg-ink-900/40 px-4 py-3 flex items-center justify-between gap-4 flex-wrap"
        >
          <div className="flex items-center gap-4 flex-wrap">
            <span className="caption text-cyan-300">
              {completeCount} of {requestedCount} complete
            </span>
            <span className="font-mono text-sm text-paper-dim">
              {formatElapsed(run.elapsed)}
            </span>
          </div>
          {run.phase === 'running' && (
            <button type="button" onClick={run.stop} className="btn-ghost">
              Stop generation
            </button>
          )}
          {run.phase === 'stopping' && (
            <button type="button" disabled className="btn-ghost">
              Stopping...
            </button>
          )}
        </div>
      )}

      {displayNotice && (
        <p role="status" className="border-l-2 border-cyan-400 pl-4 py-3 text-paper-dim">
          {displayNotice}
        </p>
      )}

      {displayRunError && (
        <p role="alert" className="border-l-2 border-rose pl-4 py-3 text-rose">
          {displayRunError}
        </p>
      )}

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
                    onClick={() => setSelectedTab(key)}
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
                      {generatingMode && (
                        <span className="caption text-paper-dim mt-1">
                          {statusLabel[run.statuses[key] ?? 'queued']}
                        </span>
                      )}
                    </span>
                  </button>
                )
              })}
            </nav>

            <div className="hairline pt-4 flex flex-col gap-2">
              <button
                onClick={handleDownload}
                disabled={currentExportDisabled}
                className="btn-ghost w-full"
              >
                Export Current
              </button>
              <button
                onClick={handleBundleDownload}
                disabled={bundleExportDisabled}
                className="btn-ghost w-full"
              >
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
            {/* Generated Markdown intentionally cannot inject raw HTML: no rehype-raw plugin. */}
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </article>
        </div>
      </div>
    </div>
  )
}
