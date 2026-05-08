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

export interface Project extends ProjectCreate {
  id: string
  created_at: string
  updated_at: string
}

export interface ProjectSummary {
  id: string
  title: string
  description: string
  target_users: string
  platform: string
  complexity: string
  created_at: string
  updated_at: string
  has_spec: boolean
  has_implementation_plan: boolean
  has_agent_prompt: boolean
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

export interface ProjectWithDeliverables {
  project: Project
  deliverables: Deliverable | null
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

export async function listProjects(): Promise<ProjectSummary[]> {
  const res = await fetch(`${BASE}/projects`)
  if (!res.ok) throw new Error('Failed to list projects')
  return res.json()
}

export async function getProject(id: string): Promise<ProjectWithDeliverables> {
  const res = await fetch(`${BASE}/projects/${id}`)
  if (!res.ok) throw new Error('Failed to fetch project')
  return res.json()
}

export async function deleteProject(id: string): Promise<void> {
  const res = await fetch(`${BASE}/projects/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete project')
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
