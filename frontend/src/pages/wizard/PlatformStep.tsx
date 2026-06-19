import type { Platform } from '../../api'
import Field from './Field'
import type { FormState } from './useWizardController'

const PLATFORMS: Platform[] = ['web', 'mobile', 'desktop', 'cli']

export default function PlatformStep({
  form,
  updateForm,
}: {
  form: FormState
  updateForm: (field: keyof FormState, value: string) => void
}) {
  return (
    <div className="flex flex-col gap-10 max-w-2xl">
      <div>
        <span className="label-mono">Platform</span>
        <div className="flex border border-ink-700 rounded-sm overflow-hidden">
          {PLATFORMS.map((platform) => {
            const selected = form.platform === platform
            return (
              <label
                key={platform}
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
                  value={platform}
                  checked={selected}
                  onChange={() => updateForm('platform', platform)}
                  className="sr-only"
                />
                {platform}
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
          onChange={(e) => updateForm('complexity', e.target.value)}
        >
          <option value="simple">Simple</option>
          <option value="medium">Medium</option>
          <option value="complex">Complex</option>
        </select>
      </Field>
    </div>
  )
}
