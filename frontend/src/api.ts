const BASE = '/api'

async function extractErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json()
    if (typeof data?.detail === 'string') return data.detail
  } catch {
    // ignore parse errors
  }
  return fallback
}

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
  if (!res.ok) {
    const msg = await extractErrorMessage(res, 'Failed to create project.')
    throw new Error(msg)
  }
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
  if (!res.ok) {
    const msg = await extractErrorMessage(res, 'Generation failed.')
    throw new Error(msg)
  }
  return res.json()
}
