const BASE = '/api'

export type Platform = 'web' | 'mobile' | 'desktop' | 'cli'
export type Complexity = 'simple' | 'medium' | 'complex'
export type DeliverableKey = 'spec' | 'implementation_plan' | 'agent_prompt'

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init)
  if (!res.ok) {
    let message = `Request failed with status ${res.status}`
    try {
      const body = await res.json()
      if (typeof body.detail === 'string') message = body.detail
    } catch {
      // Keep the status-based fallback.
    }
    throw new ApiError(message, res.status)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export interface ProjectCreate {
  title: string
  description: string
  target_users: string
  platform: Platform
  tech_preferences: string
  complexity: Complexity
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
  platform: Platform
  complexity: Complexity
  created_at: string
  updated_at: string
  has_spec: boolean
  has_implementation_plan: boolean
  has_agent_prompt: boolean
}

export interface GenerateRequest {
  model: string
  deliverables: DeliverableKey[]
  preset?: string
}

export type Deliverable = Partial<Record<DeliverableKey, string>>

export interface ProjectWithDeliverables {
  project: Project
  deliverables: Deliverable | null
}

export interface ProviderStatus {
  id: string
  label: string
  available: boolean
  models: string[]
  message: string
}

export interface ModelsResponse {
  models: string[]
  providers: ProviderStatus[]
}

export interface ListProjectsParams {
  q?: string
  platform?: Platform | 'all'
  limit?: number
  offset?: number
}

function queryString(params: ListProjectsParams) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '' && value !== 'all') {
      search.set(key, String(value))
    }
  })
  const text = search.toString()
  return text ? `?${text}` : ''
}

export async function fetchModels(): Promise<ModelsResponse> {
  return request<ModelsResponse>('/models')
}

export async function createProject(data: ProjectCreate): Promise<{ id: string }> {
  return request<{ id: string }>('/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function updateProject(
  id: string,
  data: ProjectCreate
): Promise<ProjectWithDeliverables> {
  return request<ProjectWithDeliverables>(`/projects/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function listProjects(params: ListProjectsParams = {}): Promise<ProjectSummary[]> {
  return request<ProjectSummary[]>(`/projects${queryString(params)}`)
}

export async function getProject(id: string): Promise<ProjectWithDeliverables> {
  return request<ProjectWithDeliverables>(`/projects/${id}`)
}

export async function deleteProject(id: string): Promise<void> {
  return request<void>(`/projects/${id}`, { method: 'DELETE' })
}

export async function generateDeliverables(
  id: string,
  req: GenerateRequest
): Promise<Deliverable> {
  return request<Deliverable>(`/projects/${id}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
}

export async function refineProject(id: string, model: string): Promise<string[]> {
  const data = await request<{ questions: string[] }>(`/projects/${id}/refine`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model }),
  })
  return data.questions
}
