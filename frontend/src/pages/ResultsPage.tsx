import { useState } from 'react'
import { useParams, useLocation, Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Deliverable } from '../api'

interface LocationState {
  deliverables: Deliverable
}

const TAB_CONFIG: { key: keyof Deliverable; label: string }[] = [
  { key: 'spec', label: 'Specification' },
  { key: 'implementation_plan', label: 'Implementation Plan' },
  { key: 'agent_prompt', label: 'Agent Prompt' },
]

export default function ResultsPage() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const state = location.state as LocationState | null

  const deliverables = state?.deliverables

  const availableTabs = TAB_CONFIG.filter(
    (t) => deliverables && deliverables[t.key] != null
  )

  const [activeTab, setActiveTab] = useState<keyof Deliverable | null>(
    availableTabs.length > 0 ? availableTabs[0].key : null
  )
  const [copied, setCopied] = useState(false)

  if (!deliverables || availableTabs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-5 text-center">
        <div className="text-5xl opacity-30">📋</div>
        <p className="text-surface-300 text-base">
          No results to display. Please complete the wizard first.
        </p>
        <Link to="/wizard" className="btn-primary">
          Go to Wizard
        </Link>
      </div>
    )
  }

  const content = activeTab ? (deliverables[activeTab] ?? '') : ''

  function handleDownload() {
    if (!activeTab) return
    const blob = new Blob([content], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${activeTab}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleCopy() {
    if (!content) return
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white">
            Results{id ? <span className="text-surface-400 font-normal text-sm ml-2">#{id}</span> : ''}
          </h1>
        </div>
        <Link to="/wizard" className="btn-ghost">
          ← Start Over
        </Link>
      </div>

      {/* Tab bar */}
      <div className="border-b border-surface-700">
        <nav className="-mb-px flex gap-1" aria-label="Tabs">
          {availableTabs.map(({ key, label }) => {
            const isActive = activeTab === key
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-all duration-200 whitespace-nowrap rounded-t-md ${
                  isActive
                    ? 'border-brand-400 text-brand-300 bg-brand-500/10'
                    : 'border-transparent text-surface-400 hover:text-slate-300 hover:border-surface-500 hover:bg-surface-800/50'
                }`}
              >
                {label}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Markdown content */}
      <div className="bg-surface-900 rounded-xl border border-surface-700/60 p-6 overflow-auto max-h-[60vh] shadow-[inset_0_2px_20px_rgba(0,0,0,0.3)]">
        <div className="prose prose-invert prose-sm max-w-none
          prose-headings:text-slate-100 prose-headings:font-semibold
          prose-p:text-slate-300 prose-p:leading-relaxed
          prose-a:text-brand-300 prose-a:no-underline hover:prose-a:underline
          prose-strong:text-slate-100
          prose-code:text-brand-300 prose-code:bg-surface-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs
          prose-pre:bg-surface-800 prose-pre:border prose-pre:border-surface-600
          prose-blockquote:border-l-brand-500 prose-blockquote:text-surface-300
          prose-li:text-slate-300
          prose-hr:border-surface-700
          prose-th:text-slate-200 prose-td:text-slate-300
          prose-table:border-surface-700">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {content}
          </ReactMarkdown>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex justify-end gap-3">
        <button onClick={handleCopy} className="btn-ghost flex items-center gap-2">
          {copied ? (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy
            </>
          )}
        </button>
        <button onClick={handleDownload} className="btn-primary flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
          </svg>
          Download .md
        </button>
      </div>
    </div>
  )
}
