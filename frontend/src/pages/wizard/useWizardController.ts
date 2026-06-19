import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  ApiError,
  Complexity,
  createProject,
  DeliverableKey,
  fetchModels,
  generateDeliverables,
  getProject,
  Platform,
  ProjectCreate,
  ProviderStatus,
  refineProject,
  updateProject,
} from '../../api'
import { DELIVERABLE_PRESETS } from '../../deliverables'

export interface FormState {
  title: string
  description: string
  target_users: string
  platform: Platform
  tech_preferences: string
  complexity: Complexity
  constraints: string
  extra_context: string
}

export interface Step1Errors {
  title?: string
  description?: string
  target_users?: string
}

export const initialForm: FormState = {
  title: '',
  description: '',
  target_users: '',
  platform: 'web',
  tech_preferences: '',
  complexity: 'medium',
  constraints: '',
  extra_context: '',
}

const STEP_LABELS = ['The Idea', 'Platform & Tech', 'Context', 'Generate']

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback
}

export function useWizardController() {
  const navigate = useNavigate()
  const location = useLocation()
  const editId = new URLSearchParams(location.search).get('edit')
  const [step, setStep] = useState(1)
  const [form, setForm] = useState<FormState>(initialForm)
  const [errors, setErrors] = useState<Step1Errors>({})
  const [models, setModels] = useState<string[]>([])
  const [providers, setProviders] = useState<ProviderStatus[]>([])
  const [modelsLoaded, setModelsLoaded] = useState(false)
  const [selectedModel, setSelectedModel] = useState('')
  const [deliverables, setDeliverables] = useState<DeliverableKey[]>(['spec'])
  const [selectedPreset, setSelectedPreset] = useState('mvp')
  const [generating, setGenerating] = useState(false)
  const [refining, setRefining] = useState(false)
  const [refinementQuestions, setRefinementQuestions] = useState<string[]>([])
  const [elapsed, setElapsed] = useState(0)
  const [apiError, setApiError] = useState('')
  const [loadingProject, setLoadingProject] = useState(Boolean(editId))

  function loadModels() {
    setModelsLoaded(false)
    fetchModels()
      .then((response) => {
        setModels(response.models)
        setProviders(response.providers)
        setSelectedModel((current) => {
          if (response.models.length > 0 && (!current || !response.models.includes(current))) {
            return response.models[0]
          }
          return current || ''
        })
      })
      .catch((error) => {
        setModels([])
        setProviders([])
        setSelectedModel('')
        setApiError(errorMessage(error, 'Could not refresh local model providers.'))
      })
      .finally(() => setModelsLoaded(true))
  }

  useEffect(() => {
    loadModels()
  }, [])

  useEffect(() => {
    if (!editId) return

    let ignore = false
    setLoadingProject(true)
    setApiError('')
    getProject(editId)
      .then((record) => {
        if (ignore) return
        setForm({
          title: record.project.title,
          description: record.project.description,
          target_users: record.project.target_users,
          platform: record.project.platform,
          tech_preferences: record.project.tech_preferences,
          complexity: record.project.complexity,
          constraints: record.project.constraints,
          extra_context: record.project.extra_context,
        })
        const existing = record.deliverables
          ? (Object.entries(record.deliverables)
              .filter(([, value]) => value)
              .map(([key]) => key) as DeliverableKey[])
          : []
        if (existing.length > 0) setDeliverables(existing)
      })
      .catch((error) => {
        if (!ignore) setApiError(errorMessage(error, 'Could not load that brief for editing.'))
      })
      .finally(() => {
        if (!ignore) setLoadingProject(false)
      })
    return () => {
      ignore = true
    }
  }, [editId])

  useEffect(() => {
    if (!generating) return
    setElapsed(0)
    const start = Date.now()
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(id)
  }, [generating])

  function updateForm(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (field in errors) {
      setErrors((prev) => ({ ...prev, [field]: undefined }))
    }
  }

  function validateStep1(): boolean {
    const newErrors: Step1Errors = {}
    if (!form.title.trim()) newErrors.title = 'Required'
    if (!form.description.trim()) newErrors.description = 'Required'
    if (!form.target_users.trim()) newErrors.target_users = 'Required'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  function handleNext() {
    if (step === 1 && !validateStep1()) return
    setStep((s) => Math.min(s + 1, STEP_LABELS.length))
  }

  function handleBack() {
    setApiError('')
    setStep((s) => Math.max(s - 1, 1))
  }

  function toggleDeliverable(key: DeliverableKey) {
    setDeliverables((prev) =>
      prev.includes(key) ? prev.filter((d) => d !== key) : [...prev, key]
    )
  }

  function applyPreset(presetId: string) {
    const preset = DELIVERABLE_PRESETS.find((item) => item.id === presetId)
    if (!preset) return
    setSelectedPreset(preset.id)
    setDeliverables([...preset.deliverables])
  }

  async function handleRefine() {
    if (!selectedModel || refining) return
    setRefining(true)
    setApiError('')
    try {
      const projectId = editId ?? (await createProject(form)).id
      if (editId) await updateProject(editId, form)
      const questions = await refineProject(projectId, selectedModel)
      setRefinementQuestions(questions)
      if (!editId) {
        navigate(`/wizard?edit=${projectId}`, { replace: true })
      }
    } catch (error) {
      setApiError(errorMessage(error, 'Could not generate refinement questions.'))
    } finally {
      setRefining(false)
    }
  }

  function appendRefinementAnswers() {
    if (refinementQuestions.length === 0) return
    const block = refinementQuestions.map((question) => `Q: ${question}\nA: `).join('\n\n')
    setForm((prev) => ({
      ...prev,
      extra_context: [prev.extra_context.trim(), block].filter(Boolean).join('\n\n'),
    }))
    setStep(3)
  }

  async function handleGenerate() {
    if (!selectedModel || deliverables.length === 0) return
    setGenerating(true)
    setApiError('')
    try {
      const projectData: ProjectCreate = { ...form }
      const projectId = editId ?? (await createProject(projectData)).id
      if (editId) await updateProject(editId, projectData)
      const result = await generateDeliverables(projectId, {
        model: selectedModel,
        deliverables,
        preset: selectedPreset,
      })
      navigate(`/results/${projectId}`, { state: { deliverables: result, project: { ...form, id: projectId } } })
    } catch (error) {
      setApiError(errorMessage(error, 'Something went wrong. Please try again.'))
    } finally {
      setGenerating(false)
    }
  }

  const canGenerate = !!selectedModel && deliverables.length > 0 && !generating && !loadingProject
  const stepLabel = STEP_LABELS[step - 1]
  const providerSummary = useMemo(() => {
    if (!modelsLoaded) return 'Checking providers'
    if (models.length === 0) return 'No providers available'
    return `${models.length} model${models.length === 1 ? '' : 's'} available`
  }, [models.length, modelsLoaded])

  return {
    apiError,
    appendRefinementAnswers,
    applyPreset,
    canGenerate,
    deliverables,
    editId,
    elapsed,
    errors,
    form,
    generating,
    handleBack,
    handleGenerate,
    handleNext,
    handleRefine,
    loadModels,
    loadingProject,
    models,
    modelsLoaded,
    providerSummary,
    providers,
    refinementQuestions,
    refining,
    selectedModel,
    selectedPreset,
    setSelectedModel,
    step,
    stepLabel,
    stepLabels: STEP_LABELS,
    toggleDeliverable,
    updateForm,
  }
}
