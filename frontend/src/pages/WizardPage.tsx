import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchModels, createProject, generateDeliverables, ProjectCreate } from '../api'

interface FormState {
  // Step 1
  title: string
  description: string
  target_users: string
  // Step 2
  platform: 'web' | 'mobile' | 'desktop' | 'cli'
  tech_preferences: string
  complexity: 'simple' | 'medium' | 'complex'
  // Step 3
  constraints: string
  extra_context: string
}

interface Step1Errors {
  title?: string
  description?: string
  target_users?: string
}

const DELIVERABLE_OPTIONS = [
  { key: 'spec', label: 'Specification Document' },
  { key: 'implementation_plan', label: 'Implementation Plan' },
  { key: 'agent_prompt', label: 'Agent Prompt' },
] as const

const initialForm: FormState = {
  title: '',
  description: '',
  target_users: '',
  platform: 'web',
  tech_preferences: '',
  complexity: 'medium',
  constraints: '',
  extra_context: '',
}

const labelClass = 'block text-sm font-medium text-slate-300 mb-1'
const fieldClass = 'flex flex-col gap-1'

const STEP_LABELS = ['The Idea', 'Platform & Tech', 'Context', 'Generate']

export default function WizardPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [form, setForm] = useState<FormState>(initialForm)
  const [errors, setErrors] = useState<Step1Errors>({})
  const [models, setModels] = useState<string[]>([])
  const [modelsLoaded, setModelsLoaded] = useState(false)
  const [selectedModel, setSelectedModel] = useState('')
  const [deliverables, setDeliverables] = useState<string[]>(['spec'])
  const [generating, setGenerating] = useState(false)
  const [apiError, setApiError] = useState('')

  useEffect(() => {
    fetchModels()
      .then((list) => {
        setModels(list)
        if (list.length > 0) setSelectedModel(list[0])
      })
      .catch(() => {
        setModels([])
      })
      .finally(() => setModelsLoaded(true))
  }, [])

  function updateForm(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (field in errors) {
      setErrors((prev) => ({ ...prev, [field]: undefined }))
    }
  }

  function validateStep1(): boolean {
    const newErrors: Step1Errors = {}
    if (!form.title.trim()) newErrors.title = 'Required'
    if (!form.description.trim()) newErrors.description = 'Required'
    if (!form.target_users.trim()) newErrors.target_users = 'Required'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  function handleNext() {
    if (step === 1 && !validateStep1()) return
    setStep((s) => s + 1)
  }

  function handleBack() {
    setApiError('')
    setStep((s) => s - 1)
  }

  function toggleDeliverable(key: string) {
    setDeliverables((prev) =>
      prev.includes(key) ? prev.filter((d) => d !== key) : [...prev, key]
    )
  }

  async function handleGenerate() {
    if (!selectedModel || deliverables.length === 0) return
    setGenerating(true)
    setApiError('')
    try {
      const projectData: ProjectCreate = {
        title: form.title,
        description: form.description,
        target_users: form.target_users,
        platform: form.platform,
        tech_preferences: form.tech_preferences,
        complexity: form.complexity,
        constraints: form.constraints,
        extra_context: form.extra_context,
      }
      const { id } = await createProject(projectData)
      const result = await generateDeliverables(id, {
        model: selectedModel,
        deliverables,
      })
      navigate(`/results/${id}`, { state: { deliverables: result } })
    } catch {
      setApiError('Something went wrong. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  const canGenerate = !!selectedModel && deliverables.length > 0 && !generating

  return (
    <div className="bg-surface-900 rounded-xl border border-surface-700/60 shadow-[0_4px_40px_rgba(0,0,0,0.5)] p-6 sm:p-8">

      {/* Step indicator */}
      <div className="flex items-center justify-between mb-8">
        {[1, 2, 3, 4].map((n, i) => (
          <div key={n} className="flex items-center flex-1">
            <div className="flex flex-col items-center gap-1 shrink-0">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${
                  step === n
                    ? 'bg-brand-500 text-white shadow-glow-sm'
                    : step > n
                    ? 'bg-brand-900 text-brand-300 border border-brand-600'
                    : 'bg-surface-800 text-surface-400 border border-surface-600'
                }`}
              >
                {step > n ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  n
                )}
              </div>
              <span className={`text-[10px] font-medium hidden sm:block ${
                step === n ? 'text-brand-300' : step > n ? 'text-brand-500' : 'text-surface-500'
              }`}>
                {STEP_LABELS[i]}
              </span>
            </div>
            {i < 3 && (
              <div
                className={`flex-1 h-px mx-2 transition-all duration-500 ${
                  step > n ? 'bg-brand-500/70' : 'bg-surface-700'
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step 1 */}
      {step === 1 && (
        <div className="flex flex-col gap-5">
          <h2 className="text-lg font-semibold text-white">The Idea</h2>

          <div className={fieldClass}>
            <label className={labelClass} htmlFor="title">
              Project Title <span className="text-red-400">*</span>
            </label>
            <input
              id="title"
              type="text"
              className="input-dark"
              value={form.title}
              onChange={(e) => updateForm('title', e.target.value)}
              placeholder="e.g. Recipe Sharing App"
            />
            {errors.title && (
              <span className="text-red-400 text-xs">* {errors.title}</span>
            )}
          </div>

          <div className={fieldClass}>
            <label className={labelClass} htmlFor="description">
              Description <span className="text-red-400">*</span>
            </label>
            <textarea
              id="description"
              className="input-dark resize-none"
              rows={4}
              value={form.description}
              onChange={(e) => updateForm('description', e.target.value)}
              placeholder="Describe what your project does and what problem it solves…"
            />
            {errors.description && (
              <span className="text-red-400 text-xs">* {errors.description}</span>
            )}
          </div>

          <div className={fieldClass}>
            <label className={labelClass} htmlFor="target_users">
              Target Users <span className="text-red-400">*</span>
            </label>
            <input
              id="target_users"
              type="text"
              className="input-dark"
              value={form.target_users}
              onChange={(e) => updateForm('target_users', e.target.value)}
              placeholder="e.g. Home cooks and food enthusiasts"
            />
            {errors.target_users && (
              <span className="text-red-400 text-xs">* {errors.target_users}</span>
            )}
          </div>
        </div>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <div className="flex flex-col gap-5">
          <h2 className="text-lg font-semibold text-white">Platform &amp; Tech</h2>

          <div className={fieldClass}>
            <span className={labelClass}>Platform</span>
            <div className="flex flex-wrap gap-3">
              {(['web', 'mobile', 'desktop', 'cli'] as const).map((p) => (
                <label
                  key={p}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md border cursor-pointer text-sm font-medium transition-all duration-200 ${
                    form.platform === p
                      ? 'border-brand-400 bg-brand-500/15 text-brand-300 shadow-glow-sm'
                      : 'border-surface-600 text-surface-300 hover:border-surface-400 hover:text-slate-200 bg-surface-800/50'
                  }`}
                >
                  <input
                    type="radio"
                    name="platform"
                    value={p}
                    checked={form.platform === p}
                    onChange={() => updateForm('platform', p)}
                    className="sr-only"
                  />
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </label>
              ))}
            </div>
          </div>

          <div className={fieldClass}>
            <label className={labelClass} htmlFor="tech_preferences">
              Tech Preferences{' '}
              <span className="text-surface-400 font-normal">(optional)</span>
            </label>
            <input
              id="tech_preferences"
              type="text"
              className="input-dark"
              value={form.tech_preferences}
              onChange={(e) => updateForm('tech_preferences', e.target.value)}
              placeholder="e.g. React, Node.js, PostgreSQL"
            />
          </div>

          <div className={fieldClass}>
            <label className={labelClass} htmlFor="complexity">
              Complexity
            </label>
            <select
              id="complexity"
              className="input-dark"
              value={form.complexity}
              onChange={(e) =>
                updateForm('complexity', e.target.value as FormState['complexity'])
              }
            >
              <option value="simple">Simple</option>
              <option value="medium">Medium</option>
              <option value="complex">Complex</option>
            </select>
          </div>
        </div>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <div className="flex flex-col gap-5">
          <h2 className="text-lg font-semibold text-white">Constraints &amp; Context</h2>

          <div className={fieldClass}>
            <label className={labelClass} htmlFor="constraints">
              Constraints{' '}
              <span className="text-surface-400 font-normal">(optional)</span>
            </label>
            <textarea
              id="constraints"
              className="input-dark resize-none"
              rows={3}
              value={form.constraints}
              onChange={(e) => updateForm('constraints', e.target.value)}
              placeholder="e.g. Must work offline, budget under $500/month, GDPR compliant…"
            />
          </div>

          <div className={fieldClass}>
            <label className={labelClass} htmlFor="extra_context">
              Extra Context{' '}
              <span className="text-surface-400 font-normal">(optional)</span>
            </label>
            <textarea
              id="extra_context"
              className="input-dark resize-none"
              rows={3}
              value={form.extra_context}
              onChange={(e) => updateForm('extra_context', e.target.value)}
              placeholder="Any other information that would help generate a better plan…"
            />
          </div>
        </div>
      )}

      {/* Step 4 */}
      {step === 4 && (
        <div className="flex flex-col gap-5">
          <h2 className="text-lg font-semibold text-white">Model &amp; Outputs</h2>

          {/* Model picker */}
          <div className={fieldClass}>
            <label className={labelClass} htmlFor="model">
              Model
            </label>
            {!modelsLoaded ? (
              <p className="text-sm text-surface-400 animate-pulse">Loading models…</p>
            ) : models.length === 0 ? (
              <div className="rounded-md border border-amber-600/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
                No models available. Please start LM Studio or Ollama and refresh.
              </div>
            ) : (
              <select
                id="model"
                className="input-dark"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
              >
                {models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Deliverable checkboxes */}
          <div className={fieldClass}>
            <span className={labelClass}>
              Deliverables <span className="text-red-400">*</span>
            </span>
            <div className="flex flex-col gap-3">
              {DELIVERABLE_OPTIONS.map(({ key, label }) => {
                const checked = deliverables.includes(key)
                return (
                  <label
                    key={key}
                    className={`flex items-center gap-3 cursor-pointer px-4 py-3 rounded-md border transition-all duration-200 ${
                      checked
                        ? 'border-brand-500/60 bg-brand-500/10'
                        : 'border-surface-600 bg-surface-800/50 hover:border-surface-500'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all duration-200 ${
                        checked
                          ? 'border-brand-400 bg-brand-500'
                          : 'border-surface-500 bg-transparent'
                      }`}
                    >
                      {checked && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={checked}
                      onChange={() => toggleDeliverable(key)}
                    />
                    <span className={`text-sm font-medium ${checked ? 'text-slate-100' : 'text-surface-300'}`}>
                      {label}
                    </span>
                  </label>
                )
              })}
            </div>
          </div>

          {/* API error */}
          {apiError && (
            <div className="rounded-md border border-red-600/50 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {apiError}
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between items-center mt-8 pt-6 border-t border-surface-700/60">
        <div>
          {step > 1 && (
            <button onClick={handleBack} disabled={generating} className="btn-ghost">
              Back
            </button>
          )}
        </div>
        <div>
          {step < 4 ? (
            <button onClick={handleNext} className="btn-primary">
              Next →
            </button>
          ) : (
            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="btn-primary"
            >
              {generating
                ? `Generating…`
                : 'Generate Brief'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
