import ContextStep from './wizard/ContextStep'
import GenerateStep from './wizard/GenerateStep'
import IdeaStep from './wizard/IdeaStep'
import PlatformStep from './wizard/PlatformStep'
import { useWizardController } from './wizard/useWizardController'

const pad = (n: number) => n.toString().padStart(2, '0')

const HEADLINES = ['Brief your build.', 'Pick a stack.', 'Add the edges.', 'Draft the brief.']
const DESCRIPTIONS = [
  'Describe the project. We turn it into a structured spec, an implementation plan, and an agent-ready prompt.',
  'Tell us where this runs and the rough shape of the tech.',
  "Constraints sharpen the plan. Skip what doesn't apply.",
  'Choose a model, preset, and the artifacts you want generated.',
]

export default function WizardPage() {
  const wizard = useWizardController()

  if (wizard.loadingProject) {
    return (
      <div className="py-24 flex flex-col items-center gap-5">
        <span className="caption text-cyan-400 animate-pulse">Loading brief...</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-4 pt-2">
        <div className="flex items-center gap-3">
          <span className="caption text-cyan-400">
            STEP {pad(wizard.step)} / 04
          </span>
          <span className="h-px w-10 bg-cyan-400/50" />
          <span className="caption text-paper-dim">{wizard.stepLabel.toUpperCase()}</span>
          {wizard.editId && <span className="caption text-ember">EDITING</span>}
        </div>
        <h2 className="font-display italic text-[2.5rem] sm:text-[3rem] leading-[0.95] tracking-tighter-2 text-paper animate-fade-up">
          {HEADLINES[wizard.step - 1]}
        </h2>
        <p className="text-paper-dim text-base max-w-xl leading-relaxed">
          {DESCRIPTIONS[wizard.step - 1]}
        </p>
      </header>

      <div className="grid grid-cols-4 gap-0 border-y border-ink-700">
        {wizard.stepLabels.map((label, i) => {
          const n = i + 1
          const active = wizard.step === n
          const done = wizard.step > n
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
              {active && <span className="absolute left-0 right-0 -bottom-px h-px bg-cyan-400" />}
            </div>
          )
        })}
      </div>

      <div className="panel p-6 sm:p-10 animate-fade-in">
        {wizard.step === 1 && (
          <IdeaStep form={wizard.form} errors={wizard.errors} updateForm={wizard.updateForm} />
        )}
        {wizard.step === 2 && (
          <PlatformStep form={wizard.form} updateForm={wizard.updateForm} />
        )}
        {wizard.step === 3 && (
          <ContextStep form={wizard.form} updateForm={wizard.updateForm} />
        )}
        {wizard.step === 4 && (
          <GenerateStep
            apiError={wizard.apiError}
            appendRefinementAnswers={wizard.appendRefinementAnswers}
            applyPreset={wizard.applyPreset}
            deliverables={wizard.deliverables}
            handleRefine={wizard.handleRefine}
            loadModels={wizard.loadModels}
            models={wizard.models}
            modelsLoaded={wizard.modelsLoaded}
            providers={wizard.providers}
            refinementQuestions={wizard.refinementQuestions}
            refining={wizard.refining}
            selectedModel={wizard.selectedModel}
            selectedPreset={wizard.selectedPreset}
            setSelectedModel={wizard.setSelectedModel}
            toggleDeliverable={wizard.toggleDeliverable}
          />
        )}
      </div>

      <div className="flex items-center justify-between hairline pt-6">
        <div>
          {wizard.step > 1 ? (
            <button onClick={wizard.handleBack} disabled={wizard.generating} className="btn-ghost">
              Back
            </button>
          ) : (
            <span className="caption text-paper-mute">
              {wizard.editId ? 'Editing saved brief' : 'Start of brief'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span className="caption text-paper-mute hidden sm:inline">
            {pad(wizard.step)} / 04
          </span>
          {wizard.step < 4 ? (
            <button onClick={wizard.handleNext} className="btn-primary">
              Next
            </button>
          ) : (
            <button
              onClick={wizard.handleGenerate}
              disabled={!wizard.canGenerate}
              className="btn-primary"
            >
              {wizard.generating
                ? `Generating - ${pad(Math.floor(wizard.elapsed / 60))}:${pad(wizard.elapsed % 60)}`
                : wizard.editId
                  ? 'Regenerate brief'
                  : 'Generate brief'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
