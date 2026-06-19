import Field from './Field'
import type { FormState, Step1Errors } from './useWizardController'

export default function IdeaStep({
  form,
  errors,
  updateForm,
}: {
  form: FormState
  errors: Step1Errors
  updateForm: (field: keyof FormState, value: string) => void
}) {
  return (
    <div className="flex flex-col gap-8 max-w-2xl">
      <Field id="title" label="Project Title" required error={errors.title}>
        <input
          id="title"
          type="text"
          className="field"
          value={form.title}
          onChange={(e) => updateForm('title', e.target.value)}
          placeholder="Recipe Sharing App"
        />
      </Field>

      <Field id="description" label="Description" required error={errors.description}>
        <textarea
          id="description"
          rows={4}
          className="field resize-none"
          value={form.description}
          onChange={(e) => updateForm('description', e.target.value)}
          placeholder="What it does and what problem it solves..."
        />
      </Field>

      <Field id="target_users" label="Target Users" required error={errors.target_users}>
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
  )
}
