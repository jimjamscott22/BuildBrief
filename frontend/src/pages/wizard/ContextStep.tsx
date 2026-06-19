import Field from './Field'
import type { FormState } from './useWizardController'

export default function ContextStep({
  form,
  updateForm,
}: {
  form: FormState
  updateForm: (field: keyof FormState, value: string) => void
}) {
  return (
    <div className="flex flex-col gap-8 max-w-2xl">
      <Field id="constraints" label="Constraints" optional>
        <textarea
          id="constraints"
          rows={3}
          className="field resize-none"
          value={form.constraints}
          onChange={(e) => updateForm('constraints', e.target.value)}
          placeholder="Must work offline - budget under $500/month - GDPR compliant..."
        />
      </Field>

      <Field id="extra_context" label="Extra Context" optional>
        <textarea
          id="extra_context"
          rows={7}
          className="field resize-none"
          value={form.extra_context}
          onChange={(e) => updateForm('extra_context', e.target.value)}
          placeholder="Anything else that would sharpen the plan..."
        />
      </Field>
    </div>
  )
}
