import type { Deliverable, DeliverableKey } from './api'

export const DELIVERABLE_OPTIONS: {
  key: DeliverableKey
  label: string
  short: string
  hint: string
  filename: string
}[] = [
  {
    key: 'spec',
    label: 'Specification Document',
    short: 'SPEC',
    hint: 'Functional + non-functional requirements.',
    filename: 'specification.md',
  },
  {
    key: 'implementation_plan',
    label: 'Implementation Plan',
    short: 'PLAN',
    hint: 'Sequenced build steps with milestones.',
    filename: 'implementation-plan.md',
  },
  {
    key: 'agent_prompt',
    label: 'Agent Prompt',
    short: 'PROMPT',
    hint: 'Drop-in brief for a coding agent.',
    filename: 'agent-prompt.md',
  },
]

export const DELIVERABLE_PRESETS = [
  {
    id: 'mvp',
    label: 'MVP',
    hint: 'Lean plan for a fast first version.',
    deliverables: ['spec', 'implementation_plan'] satisfies DeliverableKey[],
  },
  {
    id: 'technical_spec',
    label: 'Technical Spec',
    hint: 'Architecture-heavy planning pack.',
    deliverables: ['spec', 'implementation_plan'] satisfies DeliverableKey[],
  },
  {
    id: 'agent_handoff',
    label: 'Agent Handoff',
    hint: 'Everything a coding agent needs.',
    deliverables: ['spec', 'implementation_plan', 'agent_prompt'] satisfies DeliverableKey[],
  },
  {
    id: 'student_project',
    label: 'Student Project',
    hint: 'Scoped for learning and portfolio polish.',
    deliverables: ['spec', 'agent_prompt'] satisfies DeliverableKey[],
  },
  {
    id: 'startup_prototype',
    label: 'Startup Prototype',
    hint: 'Validation and demo-focused outputs.',
    deliverables: ['spec', 'implementation_plan'] satisfies DeliverableKey[],
  },
] as const

export function availableDeliverables(deliverables: Deliverable | null | undefined) {
  return DELIVERABLE_OPTIONS.filter((option) => deliverables?.[option.key] != null)
}

export function buildBundleMarkdown(projectTitle: string, deliverables: Deliverable) {
  return DELIVERABLE_OPTIONS
    .map((option) => {
      const content = deliverables[option.key]
      if (!content) return null
      return `# ${projectTitle} - ${option.label}\n\n${content}`
    })
    .filter(Boolean)
    .join('\n\n---\n\n')
}
