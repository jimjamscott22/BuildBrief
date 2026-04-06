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

  if (!deliverables || availableTabs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
        <p className="text-gray-600 text-base">
          No results to display. Please complete the wizard first.
        </p>
        <Link
          to="/wizard"
          className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 transition-colors"
        >
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

  return (
    <div className="flex flex-col gap-6">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-800">
            Results{id ? ` — ${id}` : ''}
          </h1>
        </div>
        <Link
          to="/wizard"
          className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:border-gray-400 transition-colors"
        >
          Start Over
        </Link>
      </div>

      {/* Tab bar */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-0" aria-label="Tabs">
          {availableTabs.map(({ key, label }) => {
            const isActive = activeTab === key
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {label}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Markdown content */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 text-sm text-gray-800 leading-relaxed overflow-auto max-h-[60vh]">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {content}
        </ReactMarkdown>
      </div>

      {/* Download button */}
      <div className="flex justify-end">
        <button
          onClick={handleDownload}
          className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 transition-colors"
        >
          Download .md
        </button>
      </div>
    </div>
  )
}
