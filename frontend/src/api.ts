const BASE = '/api'

export async function fetchModels(): Promise<string[]> {
  const res = await fetch(`${BASE}/models`)
  if (!res.ok) throw new Error('Failed to fetch models')
  const data = await res.json()
  return data.models as string[]
}

export interface ProjectCreate {
  title: string
  description: string
  target_users: string
  platform: string
  tech_preferences: string
  complexity: string
  constraints: string
  extra_context: string
}

export interface GenerateRequest {
  model: string
  deliverables: string[]
}

export interface Deliverable {
  spec?: string
  implementation_plan?: string
  agent_prompt?: string
}

export async function createProject(data: ProjectCreate): Promise<{ id: string }> {
  const res = await fetch(`${BASE}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to create project')
  return res.json()
}

export async function generateDeliverables(
  id: string,
  req: GenerateRequest
): Promise<Deliverable> {
  const res = await fetch(`${BASE}/projects/${id}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to generate deliverables')
  return res.json()
}
