export default function Field({
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
          ! {error}
        </span>
      )}
    </div>
  )
}
