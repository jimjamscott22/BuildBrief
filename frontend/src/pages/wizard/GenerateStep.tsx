import type { DeliverableKey, ProviderStatus } from '../../api'
import { DELIVERABLE_OPTIONS, DELIVERABLE_PRESETS } from '../../deliverables'
import Field from './Field'

const pad = (n: number) => n.toString().padStart(2, '0')

export default function GenerateStep({
  apiError,
  appendRefinementAnswers,
  applyPreset,
  deliverables,
  generating,
  handleRefine,
  loadModels,
  models,
  modelsLoaded,
  providers,
  refinementQuestions,
  refining,
  selectedModel,
  selectedPreset,
  setSelectedModel,
  toggleDeliverable,
}: {
  apiError: string
  appendRefinementAnswers: () => void
  applyPreset: (presetId: string) => void
  deliverables: DeliverableKey[]
  generating: boolean
  handleRefine: () => void
  loadModels: () => void
  models: string[]
  modelsLoaded: boolean
  providers: ProviderStatus[]
  refinementQuestions: string[]
  refining: boolean
  selectedModel: string
  selectedPreset: string
  setSelectedModel: (model: string) => void
  toggleDeliverable: (key: DeliverableKey) => void
}) {
  return (
    <div className="flex flex-col gap-8 max-w-2xl">
      <div className="flex items-center justify-between hairline pt-2">
        <span className="caption text-paper">Model &amp; Outputs</span>
        <button onClick={loadModels} disabled={!modelsLoaded} className="btn-link text-[10px]">
          {modelsLoaded ? 'Refresh Providers' : 'Refreshing...'}
        </button>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {providers.length === 0 && !modelsLoaded && (
          <div className="rounded-sm border border-ink-700 px-4 py-3 text-[13px] text-paper-mute">
            Checking local providers...
          </div>
        )}
        {providers.map((provider) => (
          <div
            key={provider.id}
            className={[
              'rounded-sm border px-4 py-3',
              provider.available ? 'border-cyan-400/40 bg-cyan-400/[0.04]' : 'border-ember-dim/50 bg-ember-dim/10',
            ].join(' ')}
          >
            <div className="caption text-paper">{provider.label}</div>
            <p className={['text-[12px] mt-1', provider.available ? 'text-paper-dim' : 'text-ember'].join(' ')}>
              {provider.message}
            </p>
          </div>
        ))}
      </div>

      <Field id="model" label="Model">
        {!modelsLoaded ? (
          <p className="text-[13px] text-paper-mute animate-pulse">Loading models...</p>
        ) : models.length === 0 ? (
          <div className="rounded-sm border border-ember-dim/50 bg-ember-dim/10 px-4 py-3 text-[13px] text-ember">
            No models available. Please start LM Studio or Ollama and refresh.
          </div>
        ) : (
          <select
            id="model"
            className="field"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
          >
            {models.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        )}
      </Field>

      <div>
        <span className="label-mono">Preset</span>
        <div className="grid sm:grid-cols-2 gap-2">
          {DELIVERABLE_PRESETS.map((preset) => {
            const active = selectedPreset === preset.id
            return (
              <button
                key={preset.id}
                onClick={() => applyPreset(preset.id)}
                className={[
                  'text-left border rounded-sm px-3 py-3 transition-colors',
                  active
                    ? 'border-cyan-400 bg-cyan-400/[0.06] text-paper'
                    : 'border-ink-700 text-paper-dim hover:border-ink-500',
                ].join(' ')}
              >
                <span className="caption text-cyan-300">{preset.label}</span>
                <span className="block text-[12px] mt-1">{preset.hint}</span>
              </button>
            )
          })}
        </div>
      </div>

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
                  checked ? 'border-l-cyan-400 bg-cyan-400/[0.03]' : 'border-l-transparent hover:bg-ink-900/40',
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

      <div className="hairline pt-5 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <span className="caption text-paper">Clarifying Questions</span>
          <button onClick={handleRefine} disabled={!selectedModel || refining || generating} className="btn-ghost">
            {refining ? 'Refining...' : 'Suggest Questions'}
          </button>
        </div>
        {refinementQuestions.length > 0 && (
          <div className="border border-ink-700 rounded-sm p-4">
            <ol className="list-decimal pl-5 text-[13px] text-paper-dim space-y-2">
              {refinementQuestions.map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ol>
            <button onClick={appendRefinementAnswers} className="btn-link mt-4">
              Add to context
            </button>
          </div>
        )}
      </div>

      {apiError && (
        <div className="border-l-2 border-rose pl-4 py-2 text-[13px] text-rose">
          {apiError}
        </div>
      )}
    </div>
  )
}
