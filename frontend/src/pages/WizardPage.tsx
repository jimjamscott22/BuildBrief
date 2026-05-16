import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchModels, createProject, generateDeliverables, ProjectCreate } from '../api'

interface FormState {
  title: string
  description: string
  target_users: string
  platform: 'web' | 'mobile' | 'desktop' | 'cli'
  tech_preferences: string
  complexity: 'simple' | 'medium' | 'complex'
  constraints: string
  extra_context: string
}

interface Step1Errors {
  title?: string
  description?: string
  target_users?: string
}

const DELIVERABLE_OPTIONS = [
  { key: 'spec', label: 'Specification Document', hint: 'Functional + non-functional requirements.' },
  { key: 'implementation_plan', label: 'Implementation Plan', hint: 'Sequenced build steps with milestones.' },
  { key: 'agent_prompt', label: 'Agent Prompt', hint: 'Drop-in brief for a coding agent.' },
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

const STEP_LABELS = ['The Idea', 'Platform & Tech', 'Context', 'Generate']

const pad = (n: number) => n.toString().padStart(2, '0')

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
  const [elapsed, setElapsed] = useState(0)
  const [apiError, setApiError] = useState('')

  useEffect(() => {
    fetchModels()
      .then((list) => {
        setModels(list)
        if (list.length > 0) setSelectedModel(list[0])
      })
      .catch(() => setModels([]))
      .finally(() => setModelsLoaded(true))
  }, [])

  useEffect(() => {
    if (!generating) return
    setElapsed(0)
    const start = Date.now()
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(id)
  }, [generating])

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
  const stepLabel = STEP_LABELS[step - 1]

  return (
    <div className="flex flex-col gap-10">
      {/* Hero */}
      <header className="flex flex-col gap-4 pt-2">
        <div className="flex items-center gap-3">
          <span className="caption text-cyan-400">
            STEP {pad(step)} / 04
          </span>
          <span className="h-px w-10 bg-cyan-400/50" />
          <span className="caption text-paper-dim">{stepLabel.toUpperCase()}</span>
        </div>
        <h2 className="font-display italic text-[2.5rem] sm:text-[3rem] leading-[0.95] tracking-tighter-2 text-paper animate-fade-up">
          {step === 1 && 'Brief your build.'}
          {step === 2 && 'Pick a stack.'}
          {step === 3 && 'Add the edges.'}
          {step === 4 && 'Draft the brief.'}
        </h2>
        <p className="text-paper-dim text-base max-w-xl leading-relaxed">
          {step === 1 && 'Describe the project. We turn it into a structured spec, an implementation plan, and an agent-ready prompt.'}
          {step === 2 && 'Tell us where this runs and the rough shape of the tech.'}
          {step === 3 && 'Constraints sharpen the plan. Skip what doesn’t apply.'}
          {step === 4 && 'Choose a model and the artifacts you want generated.'}
        </p>
      </header>

      {/* Step rail */}
      <div className="grid grid-cols-4 gap-0 border-y border-ink-700">
        {STEP_LABELS.map((label, i) => {
          const n = i + 1
          const active = step === n
          const done = step > n
          return (
            <div
              key={label}
              className={[
                'relative flex items-center gap-3 px-4 py-3 border-r border-ink-700 last:border-r-0',
                active ? 'bg-ink-900/60' : '',
              ].join(' ')}
            >
              <span
                className={[
                  'inline-flex items-center justify-center h-4 w-4 shrink-0 rounded-full border',
                  done
                    ? 'border-cyan-300 bg-cyan-300/20 text-cyan-300'
                    : active
                    ? 'border-cyan-400 bg-cyan-400'
                    : 'border-ink-600 bg-transparent',
                ].join(' ')}
                aria-hidden
              >
                {done && (
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </span>
              <div className="flex flex-col leading-tight min-w-0">
                <span className={['font-mono text-[10px] tracking-[0.22em]', active ? 'text-cyan-400' : done ? 'text-cyan-300/70' : 'text-paper-mute'].join(' ')}>
                  {pad(n)}
                </span>
                <span className={['text-[12px] truncate', active ? 'text-paper' : done ? 'text-paper-dim' : 'text-paper-mute'].join(' ')}>
                  {label}
                </span>
              </div>
              {active && (
                <span className="absolute left-0 right-0 -bottom-px h-px bg-cyan-400" />
              )}
            </div>
          )
        })}
      </div>

      {/* Content */}
      <div className="panel p-6 sm:p-10 animate-fade-in">
        {step === 1 && (
          <div className="flex flex-col gap-8 max-w-2xl">
            <Field
              id="title"
              label="Project Title"
              required
              error={errors.title}
            >
              <input
                id="title"
                type="text"
                className="field"
                value={form.title}
                onChange={(e) => updateForm('title', e.target.value)}
                placeholder="Recipe Sharing App"
              />
            </Field>

            <Field
              id="description"
              label="Description"
              required
              error={errors.description}
            >
              <textarea
                id="description"
                rows={4}
                className="field resize-none"
                value={form.description}
                onChange={(e) => updateForm('description', e.target.value)}
                placeholder="What it does and what problem it solves…"
              />
            </Field>

            <Field
              id="target_users"
              label="Target Users"
              required
              error={errors.target_users}
            >
              <input
                id="target_users"
                type="text"
                className="field"
                value={form.target_users}
                onChange={(e) => updateForm('target_users', e.target.value)}
                placeholder="Home cooks and food enthusiasts"
              />
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-10 max-w-2xl">
            <div>
              <span className="label-mono">Platform</span>
              <div className="flex border border-ink-700 rounded-sm overflow-hidden">
                {(['web', 'mobile', 'desktop', 'cli'] as const).map((p) => {
                  const selected = form.platform === p
                  return (
                    <label
                      key={p}
                      className={[
                        'flex-1 cursor-pointer text-center px-3 py-3 text-[12px] font-mono uppercase tracking-[0.18em] border-r border-ink-700 last:border-r-0 transition-colors duration-200 relative',
                        selected
                          ? 'bg-ink-800 text-paper'
                          : 'text-paper-mute hover:text-paper hover:bg-ink-900/60',
                      ].join(' ')}
                    >
                      <input
                        type="radio"
                        name="platform"
                        value={p}
                        checked={selected}
                        onChange={() => updateForm('platform', p)}
                        className="sr-only"
                      />
                      {p}
                      {selected && (
                        <span className="absolute left-0 right-0 bottom-0 h-0.5 bg-cyan-400" />
                      )}
                    </label>
                  )
                })}
              </div>
            </div>

            <Field id="tech_preferences" label="Tech Preferences" optional>
              <input
                id="tech_preferences"
                type="text"
                className="field"
                value={form.tech_preferences}
                onChange={(e) => updateForm('tech_preferences', e.target.value)}
                placeholder="React, Node.js, PostgreSQL"
              />
            </Field>

            <Field id="complexity" label="Complexity">
              <select
                id="complexity"
                className="field"
                value={form.complexity}
                onChange={(e) => updateForm('complexity', e.target.value as FormState['complexity'])}
              >
                <option value="simple">Simple</option>
                <option value="medium">Medium</option>
                <option value="complex">Complex</option>
              </select>
            </Field>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-8 max-w-2xl">
            <Field id="constraints" label="Constraints" optional>
              <textarea
                id="constraints"
                rows={3}
                className="field resize-none"
                value={form.constraints}
                onChange={(e) => updateForm('constraints', e.target.value)}
                placeholder="Must work offline · budget under $500/month · GDPR compliant…"
              />
            </Field>

            <Field id="extra_context" label="Extra Context" optional>
              <textarea
                id="extra_context"
                rows={4}
                className="field resize-none"
                value={form.extra_context}
                onChange={(e) => updateForm('extra_context', e.target.value)}
                placeholder="Anything else that would sharpen the plan…"
              />
            </Field>
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-10 max-w-2xl">
            <Field id="model" label="Model">
              {!modelsLoaded ? (
                <p className="font-mono text-[11px] text-paper-mute uppercase tracking-[0.18em] animate-pulse pt-2">
                  Loading models…
                </p>
              ) : models.length === 0 ? (
                <div className="border-l-2 border-ember pl-4 py-2 text-[13px] text-ember">
                  No models available. Start LM Studio or Ollama and refresh.
                </div>
              ) : (
                <select
                  id="model"
                  className="field"
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                >
                  {models.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              )}
            </Field>

            <div>
              <span className="label-mono">
                Deliverables <span className="text-ember normal-case tracking-normal">*</span>
              </span>
              <div className="flex flex-col">
                {DELIVERABLE_OPTIONS.map(({ key, label, hint }, idx) => {
                  const checked = deliverables.includes(key)
                  return (
                    <label
                      key={key}
                      className={[
                        'group relative flex items-start gap-4 cursor-pointer py-4 pl-5 pr-4 border-l-2 transition-colors duration-200',
                        idx !== 0 ? 'border-t border-t-ink-800' : '',
                        checked
                          ? 'border-l-cyan-400 bg-cyan-400/[0.03]'
                          : 'border-l-transparent hover:bg-ink-900/40',
                      ].join(' ')}
                    >
                      <span
                        className={[
                          'mt-0.5 inline-flex items-center justify-center h-4 w-4 shrink-0 rounded-[2px] border',
                          checked ? 'border-cyan-400 bg-cyan-400 text-ink-950' : 'border-ink-600 bg-transparent',
                        ].join(' ')}
                        aria-hidden
                      >
                        {checked && (
                          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={checked}
                        onChange={() => toggleDeliverable(key)}
                      />
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-paper-mute">
                          {pad(idx + 1)}
                        </span>
                        <span className={['font-display text-xl leading-tight', checked ? 'text-paper' : 'text-paper-dim'].join(' ')}>
                          {label}
                        </span>
                        <span className="text-[12px] text-paper-mute">{hint}</span>
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>

            {apiError && (
              <div className="border-l-2 border-rose pl-4 py-2 text-[13px] text-rose">
                {apiError}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer nav */}
      <div className="flex items-center justify-between hairline pt-6">
        <div>
          {step > 1 ? (
            <button onClick={handleBack} disabled={generating} className="btn-ghost">
              ← Back
            </button>
          ) : (
            <span className="caption text-paper-mute">Start of brief</span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span className="caption text-paper-mute hidden sm:inline">
            {pad(step)} / 04
          </span>
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
                ? `Generating · ${pad(Math.floor(elapsed / 60))}:${pad(elapsed % 60)}`
                : 'Generate brief'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({
  id,
  label,
  required,
  optional,
  error,
  children,
}: {
  id: string
  label: string
  required?: boolean
  optional?: boolean
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col">
      <label htmlFor={id} className="label-mono">
        {label}
        {required && <span className="text-ember ml-1.5">*</span>}
        {optional && <span className="text-paper-mute ml-2 normal-case tracking-normal font-sans text-[10px] italic">optional</span>}
      </label>
      {children}
      {error && (
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-rose mt-2">
          ⚠ {error}
        </span>
      )}
    </div>
  )
}
