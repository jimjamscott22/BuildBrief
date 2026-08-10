import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../../api'
import { useWizardController } from './useWizardController'

const navigate = vi.fn()

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}))

vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api')>()),
  createProject: vi.fn(),
  fetchModels: vi.fn(),
  generateDeliverables: vi.fn(),
  getProject: vi.fn(),
  refineProject: vi.fn(),
  updateProject: vi.fn(),
}))

function wrapper({ children }: PropsWithChildren) {
  return <MemoryRouter>{children}</MemoryRouter>
}

async function renderReadyWizard() {
  vi.mocked(api.fetchModels).mockResolvedValue({
    models: ['ollama/test'],
    providers: [],
  })
  const hook = renderHook(() => useWizardController(), { wrapper })

  await waitFor(() => expect(hook.result.current.modelsLoaded).toBe(true))

  act(() => {
    hook.result.current.updateForm('title', 'Live Brief')
    hook.result.current.updateForm('description', 'A brief that starts streaming in Results.')
    hook.result.current.updateForm('target_users', 'Builders')
    hook.result.current.setSelectedModel('ollama/test')
  })
  act(() => {
    hook.result.current.handleNext()
    hook.result.current.handleNext()
    hook.result.current.handleNext()
  })

  expect(hook.result.current.step).toBe(4)
  return hook
}

describe('useWizardController generation handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens Results with the generation request immediately after saving the project', async () => {
    vi.mocked(api.createProject).mockResolvedValue({ id: 'project-1' })
    const { result } = await renderReadyWizard()

    await act(async () => {
      await result.current.handleGenerate()
    })

    expect(api.createProject).toHaveBeenCalledWith(expect.objectContaining({ title: 'Live Brief' }))
    expect(api.generateDeliverables).not.toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledWith('/results/project-1', {
      state: {
        generationRequest: {
          model: 'ollama/test',
          deliverables: ['spec'],
          preset: 'mvp',
        },
        project: expect.objectContaining({ id: 'project-1', title: 'Live Brief' }),
      },
    })
  })

  it('does not create a second project when generate is clicked while saving', async () => {
    let resolveProject: ((value: { id: string }) => void) | undefined
    vi.mocked(api.createProject).mockReturnValue(
      new Promise((resolve) => {
        resolveProject = resolve
      }),
    )
    const { result } = await renderReadyWizard()

    act(() => {
      void result.current.handleGenerate()
    })
    await waitFor(() => expect(api.createProject).toHaveBeenCalledTimes(1))
    act(() => {
      void result.current.handleGenerate()
    })

    expect(api.createProject).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveProject?.({ id: 'project-1' })
    })
  })
})
